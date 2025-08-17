import { Router } from 'express';
import Stripe from 'stripe';
import { z } from 'zod';
import { db } from '../db/index.js';
import { campaigns } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { eq, and } from 'drizzle-orm';

const router = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-07-30.basil',
});

// Create Stripe Connect account link for onboarding
router.post('/connect/onboard', authMiddleware, async (req, res) => {
  try {
    const { campaignId } = req.body;
    const userId = req.user!.id;

    if (!campaignId) {
      return res.status(400).json({
        success: false,
        message: 'Campaign ID is required',
      });
    }

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

    let stripeAccountId = campaign.stripeConnectAccountId;

    // Only create a new account if one doesn't exist
    if (!stripeAccountId) {
      try {
        console.log('Creating new Stripe Connect account for campaign:', campaignId);
        const newAccount = await stripe.accounts.create({
          type: 'express',
          country: 'BE',
          email: req.user!.email,
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
          business_type: 'individual',
        });

        stripeAccountId = newAccount.id;
        console.log('Created new Stripe account:', stripeAccountId);

        // Update campaign with Stripe account ID
        await db
          .update(campaigns)
          .set({
            stripeConnectAccountId: stripeAccountId,
            updatedAt: new Date(),
          })
          .where(eq(campaigns.id, campaignId));
      } catch (stripeError: any) {
        // Handle various Stripe Connect setup issues
        if (stripeError.code === 'invalid_request_error') {
          let errorCode = 'STRIPE_CONNECT_ERROR';
          let setupUrl = 'https://dashboard.stripe.com/settings/connect';
          let message = 'Stripe Connect setup required.';

          if (stripeError.message.includes('signed up for Connect')) {
            errorCode = 'STRIPE_CONNECT_NOT_ENABLED';
            setupUrl = 'https://dashboard.stripe.com/connect/applications';
            message = 'Stripe Connect is not enabled for this account. Please enable it in your Stripe dashboard first.';
          } else if (stripeError.message.includes('platform-profile')) {
            errorCode = 'STRIPE_PLATFORM_PROFILE_REQUIRED';
            setupUrl = 'https://dashboard.stripe.com/settings/connect/platform-profile';
            message = 'Please complete your platform profile setup in Stripe Connect before creating connected accounts.';
          } else if (stripeError.message.includes('losses')) {
            errorCode = 'STRIPE_LIABILITY_SETUP_REQUIRED';
            setupUrl = 'https://dashboard.stripe.com/settings/connect/platform-profile';
            message = 'Please review and configure the liability settings for connected accounts in your Stripe dashboard.';
          }

          return res.status(400).json({
            success: false,
            message,
            code: errorCode,
            setupUrl,
            stripeError: {
              message: stripeError.message,
              requestId: stripeError.requestId,
            },
          });
        }
        throw stripeError;
      }
    } else {
      console.log('Using existing Stripe account:', stripeAccountId);
    }

    // Create account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${process.env.FRONTEND_URL}/dashboard?tab=payouts&refresh=true`,
      return_url: `${process.env.FRONTEND_URL}/dashboard?tab=payouts&connected=true`,
      type: 'account_onboarding',
    });

    res.json({
      success: true,
      data: {
        url: accountLink.url,
        accountId: stripeAccountId,
      },
    });
  } catch (error) {
    console.error('Error creating Stripe Connect onboarding:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create Stripe Connect onboarding link',
    });
  }
});

// Get Stripe Connect account status
router.get('/connect/status/:campaignId', authMiddleware, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const userId = req.user!.id;

    console.log('Checking Stripe Connect status for campaign:', campaignId, 'user:', userId);

    // Verify campaign ownership
    const campaign = await db.query.campaigns.findFirst({
      where: and(eq(campaigns.id, campaignId), eq(campaigns.userId, userId)),
    });

    if (!campaign) {
      console.log('Campaign not found or access denied');
      return res.status(404).json({
        success: false,
        message: 'Campaign not found or access denied',
      });
    }

    console.log('Campaign found:', {
      id: campaign.id,
      title: campaign.title,
      stripeConnectAccountId: campaign.stripeConnectAccountId
    });

    if (!campaign.stripeConnectAccountId) {
      console.log('No Stripe Connect account ID found - needs onboarding');
      return res.json({
        success: true,
        data: {
          connected: false,
          needsOnboarding: true,
        },
      });
    }

    // Check account status with Stripe
    console.log('Retrieving Stripe account:', campaign.stripeConnectAccountId);
    const account = await stripe.accounts.retrieve(campaign.stripeConnectAccountId);
    console.log('Stripe account retrieved:', {
      id: account.id,
      details_submitted: account.details_submitted,
      capabilities: account.capabilities,
      requirements: account.requirements
    });

    // For Express accounts, we need to check capabilities and requirements
    const hasChargesCapability = account.capabilities?.card_payments === 'active';
    const hasTransfersCapability = account.capabilities?.transfers === 'active';
    const detailsSubmitted = account.details_submitted;
    
    // Account is considered connected if details are submitted and it has at least charges capability
    // For development, we can be more lenient since transfers capability might take time to activate
    const isConnected = detailsSubmitted && (hasChargesCapability || hasTransfersCapability);
    
    // Check if onboarding is needed
    const needsOnboarding = !detailsSubmitted || (account.requirements?.currently_due?.length || 0) > 0;

    const statusData = {
      connected: isConnected,
      needsOnboarding,
      canReceivePayments: hasChargesCapability,
      canReceivePayouts: hasTransfersCapability,
      accountId: campaign.stripeConnectAccountId,
      country: account.country,
      email: account.email,
      capabilities: account.capabilities,
      requirements: account.requirements,
    };

    console.log('Final status data:', statusData);

    res.json({
      success: true,
      data: statusData,
    });
  } catch (error) {
    console.error('Error checking Stripe Connect status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check Stripe Connect status',
    });
  }
});

// Create login link for existing Stripe Connect account
router.post('/connect/login', authMiddleware, async (req, res) => {
  try {
    const { campaignId } = req.body;
    const userId = req.user!.id;

    // Verify campaign ownership
    const campaign = await db.query.campaigns.findFirst({
      where: and(eq(campaigns.id, campaignId), eq(campaigns.userId, userId)),
    });

    if (!campaign || !campaign.stripeConnectAccountId) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found or Stripe account not connected',
      });
    }

    // Create login link
    const loginLink = await stripe.accounts.createLoginLink(campaign.stripeConnectAccountId);

    res.json({
      success: true,
      data: {
        url: loginLink.url,
      },
    });
  } catch (error) {
    console.error('Error creating Stripe Connect login link:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create Stripe Connect login link',
    });
  }
});

export default router;
