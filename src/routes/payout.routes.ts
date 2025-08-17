
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { payoutService } from '../services/payout.service.js';
import { db } from '../db/index.js';
import { campaigns, donations } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

const router = Router();

// Get campaign financial overview
router.get('/campaign/:campaignId/financials', authMiddleware, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const userId = req.user!.id;

    // Verify campaign ownership
    const campaign = await db.query.campaigns.findFirst({
      where: and(eq(campaigns.id, campaignId), eq(campaigns.userId, userId)),
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found or access denied',
      });
    }

    const financials = await payoutService.getCampaignFinancials(campaignId);

    res.json({
      success: true,
      data: financials,
    });
  } catch (error) {
    console.error('Get campaign financials error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get campaign financials',
    });
  }
});

// Get campaign balance
router.get('/campaign/:campaignId/balance', authMiddleware, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const userId = req.user!.id;

    // Verify campaign ownership
    const campaign = await db.query.campaigns.findFirst({
      where: and(eq(campaigns.id, campaignId), eq(campaigns.userId, userId)),
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found or access denied',
      });
    }

    const balance = await payoutService.getCampaignBalance(campaignId);

    res.json({
      success: true,
      data: balance,
    });
  } catch (error) {
    console.error('Get campaign balance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get campaign balance',
    });
  }
});

// Request a payout (automatic via Stripe Connect)
router.post('/request', authMiddleware, async (req, res) => {
  try {
    const { campaignId } = req.body;
    const userId = req.user!.id;

    if (!campaignId) {
      return res.status(400).json({
        success: false,
        message: 'Campaign ID is required',
      });
    }

    const payout = await payoutService.requestPayout(campaignId, userId);

    res.status(201).json({
      success: true,
      message: 'Payout request submitted and processed automatically',
      data: payout,
    });
  } catch (error: any) {
    console.error('Error requesting payout:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to request payout',
    });
  }
});

// Process payout (admin only or automated)
router.post('/:payoutId/process', authMiddleware, async (req, res) => {
  try {
    const { payoutId } = req.params;

    // In a real app, you'd check if user is admin or this would be called automatically
    const result = await payoutService.processStripePayout(payoutId);

    res.json({
      success: true,
      data: result,
      message: 'Payout processing initiated',
    });
  } catch (error) {
    console.error('Process payout error:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to process payout',
    });
  }
});

// Get payout history for user
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const userId = req.user!.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const history = await payoutService.getPayoutHistory(userId, page, limit);

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    console.error('Get payout history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payout history',
    });
  }
});

// Get platform fee settings (public)
router.get('/settings', async (req, res) => {
  try {
    const settings = await payoutService.getPlatformSettings();

    // Only return public settings
    res.json({
      success: true,
      data: {
        platformFeePercentage: settings.platformFeePercentage,
        stripeProcessingFeePercentage: settings.stripeProcessingFeePercentage,
        stripeProcessingFeeFixed: settings.stripeProcessingFeeFixed,
        minimumPayoutAmount: settings.minimumPayoutAmount,
      },
    });
  } catch (error) {
    console.error('Get platform settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get platform settings',
    });
  }
});

// Stripe webhook for transfer events
router.post('/webhook/stripe', async (req, res) => {
  try {
    const event = req.body;

    // In production, you should verify the webhook signature
    // const sig = req.headers['stripe-signature'];
    // const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);

    await payoutService.handleStripeTransferWebhook(event);

    res.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    res.status(400).json({
      success: false,
      message: 'Webhook error',
    });
  }
});

// Debug endpoint to reprocess donations for campaigns that have missing available balance
router.post('/debug/reprocess-campaign/:campaignId', async (req: any, res: any) => {
  try {
    const { campaignId } = req.params;

    // Get all completed donations for this campaign
    const campaignDonations = await db.query.donations.findMany({
      where: and(eq(donations.campaignId, campaignId), eq(donations.status, 'completed')),
      orderBy: [donations.createdAt],
    });

    console.log(`Found ${campaignDonations.length} completed donations for campaign ${campaignId}`);

    let totalReprocessed = 0;
    let totalAmount = 0;
    const errors = [];

    for (const donation of campaignDonations) {
      try {
        console.log(`Reprocessing donation ${donation.id} (${donation.amount})`);
        await payoutService.processDonation(donation.id);
        totalReprocessed++;
        totalAmount += parseFloat(donation.amount);
      } catch (error) {
        console.error(`Failed to reprocess donation ${donation.id}:`, error);
        errors.push({ 
          donationId: donation.id, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }

    res.json({
      success: true,
      message: `Reprocessed ${totalReprocessed} donations`,
      data: {
        totalDonations: campaignDonations.length,
        reprocessed: totalReprocessed,
        totalAmount,
        errors,
      },
    });
  } catch (error) {
    console.error('Reprocess donations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reprocess donations',
    });
  }
});

// Debug endpoint to set Stripe Connect account ID for testing
router.post('/debug/set-stripe-connect/:campaignId', async (req: any, res: any) => {
  try {
    const { campaignId } = req.params;
    const { stripeConnectAccountId } = req.body;

    if (!stripeConnectAccountId) {
      return res.status(400).json({
        success: false,
        message: 'stripeConnectAccountId is required',
      });
    }

    await db
      .update(campaigns)
      .set({ 
        stripeConnectAccountId,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campaignId));

    res.json({
      success: true,
      message: 'Stripe Connect account ID updated successfully',
      data: { campaignId, stripeConnectAccountId },
    });
  } catch (error) {
    console.error('Update Stripe Connect ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update Stripe Connect account ID',
    });
  }
});

export default router;
