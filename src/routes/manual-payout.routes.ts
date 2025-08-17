import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { campaigns, payouts } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

const manualPayoutSchema = z.object({
  campaignId: z.string(),
  amount: z.string(),
  paymentMethod: z.enum(['bank_transfer', 'paypal', 'check']),
  accountDetails: z.object({
    accountHolder: z.string(),
    bankName: z.string().optional(),
    accountNumber: z.string().optional(),
    routingNumber: z.string().optional(),
    paypalEmail: z.string().email().optional(),
    address: z.string().optional(),
  }),
});

// Request manual payout (for development/testing)
router.post('/manual', authMiddleware, async (req, res) => {
  try {
    const validatedData = manualPayoutSchema.parse(req.body);
    const userId = req.user!.id;

    // Verify campaign ownership
    const campaign = await db.query.campaigns.findFirst({
      where: and(eq(campaigns.id, validatedData.campaignId), eq(campaigns.userId, userId)),
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found or access denied',
      });
    }

    // Calculate fees (5% platform fee + 3% processing fee)
    const amount = parseFloat(validatedData.amount);
    const platformFee = amount * 0.05;
    const processingFee = amount * 0.03;
    const netAmount = amount - platformFee - processingFee;

    // Create manual payout record
    const payoutData = {
      id: uuidv4(),
      userId: userId,
      campaignId: validatedData.campaignId,
      amount: validatedData.amount,
      currency: 'USD',
      status: 'pending' as const,
      paymentMethod: validatedData.paymentMethod,
      platformFee: platformFee.toFixed(2),
      processingFee: processingFee.toFixed(2),
      netAmount: netAmount.toFixed(2),
      requestedAt: new Date(),
      metadata: JSON.stringify({
        manual: true,
        accountDetails: validatedData.accountDetails,
        note: 'Manual payout request - requires admin approval',
      }),
    };

    const [payout] = await db.insert(payouts).values(payoutData).returning();

    res.json({
      success: true,
      message: 'Manual payout request submitted successfully. An admin will review and process your request.',
      data: {
        payoutId: payout.id,
        amount: payout.amount,
        netAmount: payout.netAmount,
        platformFee: payout.platformFee,
        processingFee: payout.processingFee,
        status: payout.status,
        estimatedProcessingTime: '3-5 business days',
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payout request data',
        errors: error.issues,
      });
    }

    console.error('Error creating manual payout:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payout request',
    });
  }
});

// Get manual payout instructions
router.get('/manual/instructions', authMiddleware, async (req, res) => {
  res.json({
    success: true,
    data: {
      title: 'Manual Payout Process',
      description: 'Since Stripe Connect is not enabled, we use a manual payout process.',
      steps: [
        'Submit your payout request with payment details',
        'Admin reviews the request (1-2 business days)',
        'Payment is processed via your chosen method',
        'You receive confirmation once payment is sent',
      ],
      supportedMethods: [
        {
          method: 'bank_transfer',
          name: 'Bank Transfer',
          description: 'Direct transfer to your bank account',
          requiredFields: ['accountHolder', 'bankName', 'accountNumber', 'routingNumber'],
          processingTime: '1-3 business days',
        },
        {
          method: 'paypal',
          name: 'PayPal',
          description: 'Transfer to your PayPal account',
          requiredFields: ['paypalEmail'],
          processingTime: '1-2 business days',
        },
        {
          method: 'check',
          name: 'Check',
          description: 'Physical check mailed to your address',
          requiredFields: ['accountHolder', 'address'],
          processingTime: '5-7 business days',
        },
      ],
      fees: {
        platformFee: '5%',
        processingFee: '3%',
        minimumPayout: '$10.00',
      },
      note: 'For faster processing, consider enabling Stripe Connect in your Stripe dashboard.',
    },
  });
});

export default router;
