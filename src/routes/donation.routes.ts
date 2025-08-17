import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { donations, campaigns } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { stripeService } from '../services/stripe.service.js';
import { payoutService } from '../services/payout.service.js';

const router = Router();

// Create payment intent
router.post('/create-payment-intent', async (req: Request, res: Response) => {
  try {
    const validatedData = createPaymentIntentSchema.parse(req.body);
    
    // Check if campaign exists and is active
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, validatedData.campaignId),
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found',
      });
    }

    if (!campaign.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Campaign is not active',
      });
    }

    // Create payment intent with Stripe
    const paymentIntent = await stripeService.createPaymentIntent(
      validatedData.amount,
      'usd',
      {
        campaignId: validatedData.campaignId,
        donorName: validatedData.donorName,
        donorEmail: validatedData.donorEmail,
      }
    );

    res.status(200).json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      },
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.issues,
      });
    }

    console.error('Payment intent creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

// Validation schemas
const createPaymentIntentSchema = z.object({
  campaignId: z.string().uuid(),
  amount: z.number().positive().max(10000),
  donorName: z.string().min(1).max(100),
  donorEmail: z.string().email(),
});

const createDonationSchema = z.object({
  campaignId: z.string().uuid(),
  amount: z.number().positive().max(10000),
  donorName: z.string().min(1).max(100),
  donorEmail: z.string().email(),
  donorPhone: z.string().optional(),
  message: z.string().max(500).optional(),
  isAnonymous: z.boolean().default(false),
  paymentIntentId: z.string(),
  billingAddress: z.object({
    address: z.string(),
    city: z.string(),
    state: z.string(),
    zip: z.string(),
    country: z.string(),
  }).optional(),
});

// Create donation
router.post('/', async (req: Request, res: Response) => {
  try {
    console.log('=== DONATION CREATION DEBUG ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    const validatedData = createDonationSchema.parse(req.body);
    console.log('Validated data:', JSON.stringify(validatedData, null, 2));
    
    // Check if campaign exists and is active
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, validatedData.campaignId),
    });

    console.log('Campaign found:', campaign ? 'YES' : 'NO');
    if (campaign) {
      console.log('Campaign details:', {
        id: campaign.id,
        title: campaign.title,
        isActive: campaign.isActive,
        goalAmount: campaign.goalAmount,
        currentAmount: campaign.currentAmount
      });
    }

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found',
      });
    }

    if (!campaign.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Campaign is not active',
      });
    }

    // Verify payment intent with Stripe
    console.log('Verifying payment intent:', validatedData.paymentIntentId);
    const paymentIntent = await stripeService.getPaymentIntent(validatedData.paymentIntentId);
    console.log('Payment intent status:', paymentIntent.status);
    console.log('Payment intent amount:', paymentIntent.amount);
    
    // Allow both 'succeeded' and 'requires_capture' for testing
    const validPaymentStatuses = ['succeeded', 'requires_capture'];
    if (!validPaymentStatuses.includes(paymentIntent.status)) {
      console.log('Payment intent not in valid status, status:', paymentIntent.status);
      return res.status(400).json({
        success: false,
        message: `Payment has not been completed. Status: ${paymentIntent.status}`,
      });
    }

    // Verify the payment amount matches
    const expectedAmount = Math.round(validatedData.amount * 100); // Convert to cents
    console.log('Expected amount (cents):', expectedAmount);
    console.log('Actual amount (cents):', paymentIntent.amount);
    console.log('Original amount (dollars):', validatedData.amount);
    
    if (paymentIntent.amount !== expectedAmount) {
      console.error('AMOUNT MISMATCH DETAILS:');
      console.error('- Validated amount (dollars):', validatedData.amount);
      console.error('- Converted to cents:', expectedAmount);
      console.error('- Stripe amount (cents):', paymentIntent.amount);
      console.error('- Difference:', Math.abs(paymentIntent.amount - expectedAmount));
      
      return res.status(400).json({
        success: false,
        message: 'Payment amount mismatch',
        debug: {
          expectedCents: expectedAmount,
          actualCents: paymentIntent.amount,
          originalDollars: validatedData.amount
        }
      });
    }

    console.log('Creating donation record...');
    // Create donation record
    const [donation] = await db.insert(donations).values({
      campaignId: validatedData.campaignId,
      amount: validatedData.amount.toString(),
      currency: 'USD',
      donorName: validatedData.isAnonymous ? null : validatedData.donorName,
      donorEmail: validatedData.donorEmail,
      message: validatedData.message || null,
      isAnonymous: validatedData.isAnonymous,
      paymentMethod: 'card',
      status: 'completed',
      paymentIntentId: validatedData.paymentIntentId,
    }).returning();

    console.log('Donation created successfully:', donation.id);

    // Process donation for payout system (calculate fees and update available balance)
    try {
      console.log('Processing donation for payout system...');
      await payoutService.processDonation(donation.id);
      console.log('Payout processing completed successfully');
    } catch (payoutError) {
      console.error('Error processing donation for payouts:', payoutError);
      // Continue with donation processing even if payout processing fails
    }

    // Update campaign's current amount
    const currentAmount = parseFloat(campaign.currentAmount);
    const newAmount = currentAmount + validatedData.amount;
    
    console.log('Updating campaign amount from', currentAmount, 'to', newAmount);
    await db.update(campaigns)
      .set({ currentAmount: newAmount.toString() })
      .where(eq(campaigns.id, validatedData.campaignId));

    console.log('Campaign amount updated successfully');

    // TODO: Send confirmation email to donor
    // TODO: Send notification email to campaign creator
    
    console.log('=== DONATION CREATION COMPLETED ===');
    res.status(201).json({
      success: true,
      message: 'Donation processed successfully',
      data: {
        donation: {
          ...donation,
          campaign: {
            id: campaign.id,
            title: campaign.title,
            slug: campaign.slug,
            coverImage: campaign.coverImage,
          },
        },
      },
    });

  } catch (error) {
    console.error('=== DONATION CREATION ERROR ===');
    console.error('Error details:', error);
    
    if (error instanceof z.ZodError) {
      console.error('Validation errors:', error.issues);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.issues,
      });
    }

    console.error('Donation creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

// Get donation by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const donation = await db.query.donations.findFirst({
      where: eq(donations.id, id),
      with: {
        campaign: {
          columns: {
            id: true,
            title: true,
            slug: true,
            coverImage: true,
          },
        },
      },
    });

    if (!donation) {
      return res.status(404).json({
        success: false,
        message: 'Donation not found',
      });
    }

    res.json({
      success: true,
      data: { donation },
    });

  } catch (error) {
    console.error('Get donation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

// Get donations for a campaign
router.get('/campaign/:campaignId', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    // Check if campaign exists
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found',
      });
    }

    const campaignDonations = await db.query.donations.findMany({
      where: eq(donations.campaignId, campaignId),
      limit,
      offset,
      orderBy: (donations, { desc }) => [desc(donations.createdAt)],
    });

    // Get total count for pagination
    const totalResult = await db.query.donations.findMany({
      where: eq(donations.campaignId, campaignId),
    });
    const total = totalResult.length;

    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    res.json({
      success: true,
      data: {
        donations: campaignDonations,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext,
          hasPrev,
        },
      },
    });

  } catch (error) {
    console.error('Get campaign donations error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

// Stripe webhook endpoint
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['stripe-signature'];
    
    if (!signature) {
      return res.status(400).json({
        success: false,
        message: 'Missing stripe signature',
      });
    }

    // Construct the event from the webhook payload and signature
    const event = stripeService.constructEvent(req.body, signature as string);
    
    // Process the webhook event
    const result = await stripeService.processWebhookEvent(event);
    
    res.status(200).json({
      success: true,
      message: 'Webhook processed',
      data: result,
    });

  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(400).json({
      success: false,
      message: 'Webhook processing failed',
    });
  }
});

export default router;
