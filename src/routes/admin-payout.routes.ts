import { Router } from 'express';
import Stripe from 'stripe';
import { z } from 'zod';
import { db } from '../db/index.js';
import { payouts, campaigns } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { eq } from 'drizzle-orm';

const router = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-07-30.basil',
});

const processPayoutSchema = z.object({
  payoutId: z.string(),
  action: z.enum(['approve', 'reject', 'process_stripe']),
  rejectionReason: z.string().optional(),
  stripeTransferData: z.object({
    destinationAccount: z.string().optional(),
    transferAmount: z.number().optional(),
  }).optional(),
});

// Process a manual payout (admin only)
router.put('/process/:payoutId', authMiddleware, async (req, res) => {
  try {
    const { payoutId } = req.params;
    const validatedData = processPayoutSchema.parse(req.body);
    
    // For demo purposes, we'll allow any authenticated user to process payouts
    // In production, you'd check for admin role here
    // if (!req.user!.isAdmin) {
    //   return res.status(403).json({
    //     success: false,
    //     message: 'Admin access required',
    //   });
    // }

    const payout = await db.query.payouts.findFirst({
      where: eq(payouts.id, payoutId),
      with: {
        campaign: true,
        user: true,
      },
    });

    if (!payout) {
      return res.status(404).json({
        success: false,
        message: 'Payout not found',
      });
    }

    let updateData: any = {
      updatedAt: new Date(),
    };

    switch (validatedData.action) {
      case 'approve':
        updateData.status = 'approved';
        updateData.approvedAt = new Date();
        break;

      case 'reject':
        updateData.status = 'failed';
        updateData.failureReason = validatedData.rejectionReason || 'Rejected by admin';
        updateData.processedAt = new Date();
        break;

      case 'process_stripe':
        // Process via Stripe (if you want to use Stripe for the actual transfer)
        try {
          let transferResult;
          
          if (validatedData.stripeTransferData?.destinationAccount) {
            // Transfer to connected account
            transferResult = await stripe.transfers.create({
              amount: Math.round(parseFloat(payout.netAmount) * 100),
              currency: payout.currency.toLowerCase(),
              destination: validatedData.stripeTransferData.destinationAccount,
              description: `Manual payout for campaign: ${payout.campaign.title}`,
              metadata: {
                payoutId: payout.id,
                campaignId: payout.campaignId,
                manual: 'true',
              },
            });
          } else {
            // Create a payment intent (for direct bank transfer via Stripe)
            // This requires the customer's payment method
            transferResult = await stripe.paymentIntents.create({
              amount: Math.round(parseFloat(payout.netAmount) * 100),
              currency: payout.currency.toLowerCase(),
              description: `Payout for campaign: ${payout.campaign.title}`,
              metadata: {
                payoutId: payout.id,
                campaignId: payout.campaignId,
                type: 'manual_payout',
              },
            });
          }

          updateData.status = 'processing';
          updateData.stripeTransferId = transferResult.id;
          updateData.processedAt = new Date();

        } catch (stripeError: any) {
          console.error('Stripe transfer failed:', stripeError);
          return res.status(400).json({
            success: false,
            message: 'Stripe transfer failed',
            error: stripeError.message,
          });
        }
        break;

      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid action',
        });
    }

    // Update payout record
    const [updatedPayout] = await db
      .update(payouts)
      .set(updateData)
      .where(eq(payouts.id, payoutId))
      .returning();

    res.json({
      success: true,
      message: `Payout ${validatedData.action === 'process_stripe' ? 'processed via Stripe' : validatedData.action}d successfully`,
      data: updatedPayout,
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request data',
        errors: error.issues,
      });
    }

    console.error('Error processing payout:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process payout',
    });
  }
});

// Get all pending payouts (admin)
router.get('/pending', authMiddleware, async (req, res) => {
  try {
    // For demo purposes, we'll allow any authenticated user to view pending payouts
    // In production, you'd check for admin role here

    const pendingPayouts = await db.query.payouts.findMany({
      where: eq(payouts.status, 'pending'),
      with: {
        campaign: {
          columns: {
            id: true,
            title: true,
            slug: true,
          },
        },
        user: {
          columns: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: (payouts, { desc }) => [desc(payouts.requestedAt)],
    });

    res.json({
      success: true,
      data: pendingPayouts,
    });

  } catch (error) {
    console.error('Error fetching pending payouts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending payouts',
    });
  }
});

export default router;
