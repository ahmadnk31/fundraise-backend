import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { follows, campaigns, users } from '../db/schema.js';
import { eq, and, desc, count } from 'drizzle-orm';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

// Validation schemas
const followCampaignSchema = z.object({
  campaignId: z.string().uuid(),
});

// Follow a campaign (requires authentication)
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const validatedData = followCampaignSchema.parse(req.body);

    // Check if campaign exists
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, validatedData.campaignId),
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found',
      });
    }

    // Check if already following
    const existingFollow = await db.query.follows.findFirst({
      where: and(
        eq(follows.campaignId, validatedData.campaignId),
        eq(follows.userId, userId)
      ),
    });

    if (existingFollow) {
      return res.status(400).json({
        success: false,
        message: 'Already following this campaign',
      });
    }

    // Create follow record
    const [follow] = await db.insert(follows).values({
      campaignId: validatedData.campaignId,
      userId,
    }).returning();

    res.status(201).json({
      success: true,
      message: 'Successfully followed campaign',
      data: { follow },
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.issues,
      });
    }

    console.error('Follow campaign error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

// Unfollow a campaign (requires authentication)
router.delete('/:campaignId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { campaignId } = req.params;

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

    // Check if following
    const existingFollow = await db.query.follows.findFirst({
      where: and(
        eq(follows.campaignId, campaignId),
        eq(follows.userId, userId)
      ),
    });

    if (!existingFollow) {
      return res.status(400).json({
        success: false,
        message: 'Not following this campaign',
      });
    }

    // Delete follow record
    await db.delete(follows).where(
      and(
        eq(follows.campaignId, campaignId),
        eq(follows.userId, userId)
      )
    );

    res.json({
      success: true,
      message: 'Successfully unfollowed campaign',
    });

  } catch (error) {
    console.error('Unfollow campaign error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

// Check if user is following a campaign (requires authentication)
router.get('/status/:campaignId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { campaignId } = req.params;

    // Check if following
    const existingFollow = await db.query.follows.findFirst({
      where: and(
        eq(follows.campaignId, campaignId),
        eq(follows.userId, userId)
      ),
    });

    res.json({
      success: true,
      data: {
        isFollowing: !!existingFollow,
        followId: existingFollow?.id || null,
      },
    });

  } catch (error) {
    console.error('Check follow status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

// Get followers for a campaign
router.get('/campaign/:campaignId', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
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

    // Get followers with user information
    const campaignFollowers = await db.query.follows.findMany({
      where: eq(follows.campaignId, campaignId),
      with: {
        user: {
          columns: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
      },
      orderBy: [desc(follows.createdAt)],
      limit,
      offset,
    });

    // Get total count for pagination
    const totalResult = await db.query.follows.findMany({
      where: eq(follows.campaignId, campaignId),
    });
    const total = totalResult.length;

    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    res.json({
      success: true,
      data: {
        followers: campaignFollowers,
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
    console.error('Get campaign followers error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

// Get campaigns followed by a user (requires authentication)
router.get('/user', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    // Get followed campaigns with campaign information
    const followedCampaigns = await db.query.follows.findMany({
      where: eq(follows.userId, userId),
      with: {
        campaign: {
          with: {
            user: {
              columns: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
              },
            },
          },
        },
      },
      orderBy: [desc(follows.createdAt)],
      limit,
      offset,
    });

    // Get total count for pagination
    const totalResult = await db.query.follows.findMany({
      where: eq(follows.userId, userId),
    });
    const total = totalResult.length;

    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    res.json({
      success: true,
      data: {
        followedCampaigns,
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
    console.error('Get user followed campaigns error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

// Get follow count for a campaign
router.get('/count/:campaignId', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;

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

    // Get follow count
    const result = await db.query.follows.findMany({
      where: eq(follows.campaignId, campaignId),
    });
    const followCount = result.length;

    res.json({
      success: true,
      data: {
        campaignId,
        followCount,
      },
    });

  } catch (error) {
    console.error('Get follow count error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

export default router;
