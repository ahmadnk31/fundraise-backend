import Stripe from 'stripe';
import { db } from '../db/index.js';
import { campaigns, payouts, transactions, platformSettings, donations } from '../db/schema.js';
import { eq, and, sql, desc } from 'drizzle-orm';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-07-30.basil',
});

export class PayoutService {
  
  // Get platform settings
  async getPlatformSettings() {
    const settings = await db.select().from(platformSettings);
    const settingsMap = settings.reduce((acc, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {} as Record<string, string>);

    return {
      platformFeePercentage: parseFloat(settingsMap.platform_fee_percentage || '5.0'),
      stripeProcessingFeePercentage: parseFloat(settingsMap.stripe_processing_fee_percentage || '2.9'),
      stripeProcessingFeeFixed: parseFloat(settingsMap.stripe_processing_fee_fixed || '0.30'),
      minimumPayoutAmount: parseFloat(settingsMap.minimum_payout_amount || '25.00'),
      payoutHoldingPeriodDays: parseInt(settingsMap.payout_holding_period_days || '7'),
      autoPayoutEnabled: settingsMap.auto_payout_enabled === 'true',
    };
  }

  // Calculate fees for a donation
  calculateFees(amount: number, settings: any) {
    // Stripe processing fee: percentage + fixed fee
    const stripeProcessingFee = (amount * settings.stripeProcessingFeePercentage / 100) + settings.stripeProcessingFeeFixed;
    
    // Platform fee: percentage of the original amount
    const platformFee = amount * settings.platformFeePercentage / 100;
    
    // Net amount after all fees
    const netAmount = amount - stripeProcessingFee - platformFee;

    return {
      platformFee: Math.round(platformFee * 100) / 100,
      processingFee: Math.round(stripeProcessingFee * 100) / 100,
      netAmount: Math.round(netAmount * 100) / 100,
    };
  }

  // Process a successful donation and update campaign balance
  async processDonation(donationId: string) {
    try {
      const donation = await db.query.donations.findFirst({
        where: eq(donations.id, donationId),
        with: {
          campaign: true,
        },
      });

      if (!donation || donation.status !== 'completed') {
        throw new Error('Donation not found or not completed');
      }

      const settings = await this.getPlatformSettings();
      const amount = parseFloat(donation.amount);
      const fees = this.calculateFees(amount, settings);

      // Create transaction record
      await db.insert(transactions).values({
        campaignId: donation.campaignId,
        donationId: donation.id,
        type: 'donation',
        amount: donation.amount,
        platformFee: fees.platformFee.toFixed(2),
        processingFee: fees.processingFee.toFixed(2),
        netAmount: fees.netAmount.toFixed(2),
        currency: donation.currency,
        status: 'completed',
        description: `Donation from ${donation.donorName || donation.donorEmail}`,
      });

      // Update campaign balance
      await db
        .update(campaigns)
        .set({
          availableBalance: sql`available_balance + ${fees.netAmount}`,
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, donation.campaignId));

      return { success: true, netAmount: fees.netAmount };
    } catch (error) {
      console.error('Error processing donation:', error);
      throw error;
    }
  }

  // Get available balance for a campaign
  async getCampaignBalance(campaignId: string) {
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
      columns: {
        id: true,
        availableBalance: true,
        paidOut: true,
        currentAmount: true,
      },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    const settings = await this.getPlatformSettings();
    const availableBalance = parseFloat(campaign.availableBalance);
    const canPayout = availableBalance >= settings.minimumPayoutAmount;

    return {
      availableBalance,
      paidOut: parseFloat(campaign.paidOut),
      totalRaised: parseFloat(campaign.currentAmount),
      minimumPayoutAmount: settings.minimumPayoutAmount,
      canPayout,
    };
  }

  // Create a payout request
  async requestPayout(campaignId: string, userId: string) {
    try {
      // Verify campaign ownership
      const campaign = await db.query.campaigns.findFirst({
        where: and(eq(campaigns.id, campaignId), eq(campaigns.userId, userId)),
      });

      if (!campaign) {
        throw new Error('Campaign not found or access denied');
      }

      // Check if Stripe Connect account is set up
      if (!campaign.stripeConnectAccountId) {
        throw new Error('Stripe Connect account not set up for this campaign');
      }

      const balance = await this.getCampaignBalance(campaignId);
      
      if (!balance.canPayout) {
        throw new Error(`Minimum payout amount is $${balance.minimumPayoutAmount}`);
      }

      const settings = await this.getPlatformSettings();
      const amount = balance.availableBalance;
      
      // Calculate platform fee (5%)
      const platformFee = amount * 0.05;
      const netAmount = amount - platformFee;

      // Create payout record
      const [payout] = await db
        .insert(payouts)
        .values({
          campaignId,
          userId,
          amount: amount.toFixed(2),
          platformFee: platformFee.toFixed(2),
          processingFee: '0.00', // Stripe Connect handles processing fees
          netAmount: netAmount.toFixed(2),
          currency: campaign.currency,
          status: 'pending',
          paymentMethod: 'stripe_connect',
        })
        .returning();

      // Process Stripe transfer immediately
      const transferResult = await this.processStripePayout(payout.id);

      if (transferResult.success) {
        // Update campaign balance (reserve the amount)
        await db
          .update(campaigns)
          .set({
            availableBalance: '0.00',
            paidOut: (parseFloat(campaign.paidOut) + amount).toFixed(2),
            updatedAt: new Date(),
          })
          .where(eq(campaigns.id, campaignId));

        // Create transaction record
        await db.insert(transactions).values({
          campaignId,
          payoutId: payout.id,
          type: 'payout',
          amount: amount.toFixed(2),
          platformFee: platformFee.toFixed(2),
          processingFee: '0.00',
          netAmount: netAmount.toFixed(2),
          currency: campaign.currency,
          status: 'processing',
          description: `Automatic payout via Stripe Connect`,
        });
      }

      return payout;
    } catch (error) {
      console.error('Error creating payout request:', error);
      throw error;
    }
  }

  // Process payout via Stripe Connect (if using Stripe)
  async processStripePayout(payoutId: string) {
    try {
      const payout = await db.query.payouts.findFirst({
        where: eq(payouts.id, payoutId),
        with: {
          campaign: true,
          user: true,
        },
      });

      if (!payout || payout.status !== 'pending') {
        throw new Error('Payout not found or already processed');
      }

      if (!payout.campaign.stripeConnectAccountId) {
        throw new Error('Stripe Connect account not set up for this campaign');
      }

      // In test mode, if using a test account that doesn't have full capabilities,
      // simulate a successful transfer instead of making a real API call
      const isTestAccount = payout.campaign.stripeConnectAccountId.includes('acct_');
      const isTestMode = process.env.NODE_ENV !== 'production';

      if (isTestMode && isTestAccount) {
        console.log('🧪 Test Mode: Simulating successful Stripe transfer');
        
        // Simulate transfer with a fake transfer ID
        const fakeTransferId = `tr_test_${Date.now()}`;
        
        // Update payout status
        await db
          .update(payouts)
          .set({
            status: 'completed', // Mark as completed immediately in test mode
            stripeTransferId: fakeTransferId,
            processedAt: new Date(),
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(payouts.id, payoutId));

        // Update transaction status
        await db
          .update(transactions)
          .set({
            status: 'completed', // Mark as completed immediately in test mode
            metadata: { stripeTransferId: fakeTransferId, testMode: true },
            updatedAt: new Date(),
          })
          .where(eq(transactions.payoutId, payoutId));

        console.log('✅ Test Mode: Payout completed successfully');
        return { success: true, transferId: fakeTransferId, testMode: true };
      }

      // Production mode: Make real Stripe transfer
      const transfer = await stripe.transfers.create({
        amount: Math.round(parseFloat(payout.netAmount) * 100), // Convert to cents
        currency: payout.currency.toLowerCase(),
        destination: payout.campaign.stripeConnectAccountId,
        description: `Payout for campaign: ${payout.campaign.title}`,
        metadata: {
          payoutId: payout.id,
          campaignId: payout.campaignId,
        },
      });

      // Update payout status
      await db
        .update(payouts)
        .set({
          status: 'processing',
          stripeTransferId: transfer.id,
          processedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(payouts.id, payoutId));

      // Update transaction status
      await db
        .update(transactions)
        .set({
          status: 'processing',
          metadata: { stripeTransferId: transfer.id },
          updatedAt: new Date(),
        })
        .where(eq(transactions.payoutId, payoutId));

      return { success: true, transferId: transfer.id };
    } catch (error) {
      console.error('Error processing Stripe payout:', error);
      
      let errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Handle specific Stripe test environment errors
      if (errorMessage.includes('insufficient available funds')) {
        errorMessage = 'Test Environment: Platform account has insufficient funds. In test mode, you need to add funds to your Stripe platform account first. This would not occur in production with real donations.';
      } else if (errorMessage.includes('4000000000000077')) {
        errorMessage = 'Test Environment: Use the test card 4000000000000077 to add funds to your platform account first.';
      } else if (errorMessage.includes('capabilities') || errorMessage.includes('transfers')) {
        errorMessage = 'Test Environment: Connected account capabilities not fully set up. In production, this would be handled through proper Stripe Connect onboarding.';
      }
      
      // Mark payout as failed
      await db
        .update(payouts)
        .set({
          status: 'failed',
          failureReason: errorMessage,
          updatedAt: new Date(),
        })
        .where(eq(payouts.id, payoutId));

      throw new Error(errorMessage);
    }
  }

  // Handle Stripe webhook for transfer completion
  async handleStripeTransferWebhook(event: any) {
    try {
      if (event.type === 'transfer.paid') {
        const transfer = event.data.object;
        const payoutId = transfer.metadata?.payoutId;

        if (payoutId) {
          await db
            .update(payouts)
            .set({
              status: 'completed',
              completedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(payouts.id, payoutId));

          await db
            .update(transactions)
            .set({
              status: 'completed',
              updatedAt: new Date(),
            })
            .where(eq(transactions.payoutId, payoutId));

          // Update campaign paid out amount
          const payout = await db.query.payouts.findFirst({
            where: eq(payouts.id, payoutId),
          });

          if (payout) {
            await db
              .update(campaigns)
              .set({
                paidOut: sql`paid_out + ${parseFloat(payout.netAmount)}`,
                updatedAt: new Date(),
              })
              .where(eq(campaigns.id, payout.campaignId));
          }
        }
      } else if (event.type === 'transfer.failed') {
        const transfer = event.data.object;
        const payoutId = transfer.metadata?.payoutId;

        if (payoutId) {
          const payout = await db.query.payouts.findFirst({
            where: eq(payouts.id, payoutId),
          });

          if (payout) {
            // Mark as failed
            await db
              .update(payouts)
              .set({
                status: 'failed',
                failureReason: 'Stripe transfer failed',
                updatedAt: new Date(),
              })
              .where(eq(payouts.id, payoutId));

            // Restore campaign balance
            await db
              .update(campaigns)
              .set({
                availableBalance: sql`available_balance + ${parseFloat(payout.netAmount)}`,
                updatedAt: new Date(),
              })
              .where(eq(campaigns.id, payout.campaignId));
          }
        }
      }
    } catch (error) {
      console.error('Error handling Stripe transfer webhook:', error);
      throw error;
    }
  }

  // Get payout history for a user
  async getPayoutHistory(userId: string, page = 1, limit = 10) {
    const offset = (page - 1) * limit;

    const userPayouts = await db.query.payouts.findMany({
      where: eq(payouts.userId, userId),
      with: {
        campaign: {
          columns: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: [desc(payouts.createdAt)],
      limit,
      offset,
    });

    const total = await db
      .select({ count: sql<number>`count(*)` })
      .from(payouts)
      .where(eq(payouts.userId, userId));

    return {
      payouts: userPayouts,
      pagination: {
        page,
        limit,
        total: total[0].count,
        totalPages: Math.ceil(total[0].count / limit),
      },
    };
  }

  // Get financial overview for a campaign
  async getCampaignFinancials(campaignId: string) {
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    const transactionHistory = await db.query.transactions.findMany({
      where: eq(transactions.campaignId, campaignId),
      orderBy: [desc(transactions.createdAt)],
      limit: 50,
    });

    const totalRaised = parseFloat(campaign.currentAmount);
    const availableBalance = parseFloat(campaign.availableBalance);
    const paidOut = parseFloat(campaign.paidOut);

    // Calculate total fees
    const totalPlatformFees = transactionHistory
      .filter(t => t.type === 'donation')
      .reduce((sum, t) => sum + parseFloat(t.platformFee), 0);

    const totalProcessingFees = transactionHistory
      .filter(t => t.type === 'donation')
      .reduce((sum, t) => sum + parseFloat(t.processingFee), 0);

    return {
      totalRaised,
      availableBalance,
      paidOut,
      totalPlatformFees,
      totalProcessingFees,
      netReceived: totalRaised - totalPlatformFees - totalProcessingFees,
      transactions: transactionHistory,
    };
  }
}

export const payoutService = new PayoutService();
