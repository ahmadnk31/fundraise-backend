import express from 'express';
import { db, campaigns, users, donations } from '../db/index.js';
import { eq, desc, sql, ilike, and, gte, lte } from 'drizzle-orm';
import { authMiddleware, optionalAuthMiddleware, requireVerifiedUser } from '../middleware/auth.middleware.js';

const router = express.Router();

// Helper function to generate slug
const generateSlug = (title: string): string => {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .trim();
};

// Get category statistics
router.get('/categories/stats', async (req, res) => {
  try {
    const categoryStats = await db
      .select({
        category: campaigns.category,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(campaigns)
      .where(
        and(
          eq(campaigns.isActive, true),
          eq(campaigns.isApproved, true)
        )
      )
      .groupBy(campaigns.category);

    const [totalCount] = await db
      .select({
        total: sql<number>`cast(count(*) as int)`,
      })
      .from(campaigns)
      .where(
        and(
          eq(campaigns.isActive, true),
          eq(campaigns.isApproved, true)
        )
      );

    const stats = categoryStats.reduce((acc, stat) => {
      acc[stat.category] = stat.count;
      return acc;
    }, {} as Record<string, number>);

    res.json({
      success: true,
      data: {
        categories: stats,
        total: totalCount?.total || 0,
      },
    });
  } catch (error) {
    console.error('Get category stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch category statistics',
    });
  }
});

// Get all campaigns with filters
router.get('/', optionalAuthMiddleware, async (req, res) => {
  try {
    const {
      page = '1',
      limit = '12',
      category,
      search,
      sortBy = 'recent', // recent, goal, raised
      featured,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;

    // Build conditions
    const conditions = [eq(campaigns.isActive, true), eq(campaigns.isApproved, true)];

    if (category && category !== 'all') {
      conditions.push(eq(campaigns.category, category as string));
    }

    if (search) {
      conditions.push(
        sql`(${campaigns.title} ILIKE ${'%' + search + '%'} OR ${campaigns.summary} ILIKE ${'%' + search + '%'})`
      );
    }

    if (featured === 'true') {
      conditions.push(eq(campaigns.isFeatured, true));
    }

    // Build order by
    let orderBy;
    switch (sortBy) {
      case 'goal':
        orderBy = desc(campaigns.goalAmount);
        break;
      case 'raised':
        orderBy = desc(campaigns.currentAmount);
        break;
      default:
        orderBy = desc(campaigns.createdAt);
    }

    // Get campaigns with user information
    const campaignList = await db
      .select({
        id: campaigns.id,
        title: campaigns.title,
        slug: campaigns.slug,
        summary: campaigns.summary,
        category: campaigns.category,
        location: campaigns.location,
        goalAmount: campaigns.goalAmount,
        currentAmount: campaigns.currentAmount,
        currency: campaigns.currency,
        deadline: campaigns.deadline,
        coverImage: campaigns.coverImage,
        isActive: campaigns.isActive,
        isApproved: campaigns.isApproved,
        isFeatured: campaigns.isFeatured,
        createdAt: campaigns.createdAt,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          avatar: users.avatar,
        },
      })
      .from(campaigns)
      .innerJoin(users, eq(campaigns.userId, users.id))
      .where(and(...conditions))
      .orderBy(orderBy)
      .limit(limitNum)
      .offset(offset);

    // Get total count for pagination
    const [totalResult] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(campaigns)
      .where(and(...conditions));

    const total = totalResult?.count || 0;
    const totalPages = Math.ceil(total / limitNum);

    res.json({
      success: true,
      data: {
        campaigns: campaignList,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages,
          hasNext: pageNum < totalPages,
          hasPrev: pageNum > 1,
        },
      },
    });
  } catch (error) {
    console.error('Get campaigns error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch campaigns',
    });
  }
});

// Get campaign by slug or ID
router.get('/:identifier', optionalAuthMiddleware, async (req, res) => {
  try {
    const { identifier } = req.params;

    // Check if identifier is UUID (ID) or slug
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
    
    const [campaign] = await db
      .select({
        id: campaigns.id,
        title: campaigns.title,
        slug: campaigns.slug,
        summary: campaigns.summary,
        story: campaigns.story,
        category: campaigns.category,
        location: campaigns.location,
        goalAmount: campaigns.goalAmount,
        currentAmount: campaigns.currentAmount,
        currency: campaigns.currency,
        deadline: campaigns.deadline,
        budgetBreakdown: campaigns.budgetBreakdown,
        coverImage: campaigns.coverImage,
        additionalMedia: campaigns.additionalMedia,
        isActive: campaigns.isActive,
        isApproved: campaigns.isApproved,
        isFeatured: campaigns.isFeatured,
        createdAt: campaigns.createdAt,
        updatedAt: campaigns.updatedAt,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          avatar: users.avatar,
        },
      })
      .from(campaigns)
      .innerJoin(users, eq(campaigns.userId, users.id))
      .where(
        and(
          isUuid ? eq(campaigns.id, identifier) : eq(campaigns.slug, identifier),
          eq(campaigns.isActive, true),
          eq(campaigns.isApproved, true)
        )
      )
      .limit(1);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found',
      });
    }

    // Get recent donations for this campaign
    const recentDonations = await db
      .select({
        id: donations.id,
        amount: donations.amount,
        donorName: donations.donorName,
        message: donations.message,
        isAnonymous: donations.isAnonymous,
        createdAt: donations.createdAt,
      })
      .from(donations)
      .where(
        and(
          eq(donations.campaignId, campaign.id),
          eq(donations.status, 'completed')
        )
      )
      .orderBy(desc(donations.createdAt))
      .limit(10);

    // Get donation stats
    const [donationStats] = await db
      .select({
        totalDonors: sql<number>`cast(count(distinct ${donations.donorEmail}) as int)`,
        totalDonations: sql<number>`cast(count(*) as int)`,
      })
      .from(donations)
      .where(
        and(
          eq(donations.campaignId, campaign.id),
          eq(donations.status, 'completed')
        )
      );

    res.json({
      success: true,
      data: {
        campaign,
        recentDonations,
        stats: {
          totalDonors: donationStats?.totalDonors || 0,
          totalDonations: donationStats?.totalDonations || 0,
          percentageRaised: campaign.goalAmount ? 
            (parseFloat(campaign.currentAmount) / parseFloat(campaign.goalAmount)) * 100 : 0,
        },
      },
    });
  } catch (error) {
    console.error('Get campaign error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch campaign',
    });
  }
});

// Create new campaign
router.post('/', authMiddleware, requireVerifiedUser, async (req, res) => {
  try {
    const {
      title,
      summary,
      story,
      category,
      location,
      goalAmount,
      deadline,
      budgetBreakdown,
      coverImage,
      additionalMedia = [],
    } = req.body;

    const userId = req.user!.id;

    // Validation
    if (!title || !summary || !story || !category || !goalAmount) {
      return res.status(400).json({
        success: false,
        message: 'Title, summary, story, category, and goal amount are required',
      });
    }

    if (parseFloat(goalAmount) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Goal amount must be greater than 0',
      });
    }

    // Generate unique slug
    let baseSlug = generateSlug(title);
    let slug = baseSlug;
    let counter = 1;

    while (true) {
      const [existingCampaign] = await db
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(eq(campaigns.slug, slug))
        .limit(1);

      if (!existingCampaign) break;

      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Create campaign
    const [newCampaign] = await db
      .insert(campaigns)
      .values({
        userId,
        title,
        slug,
        summary,
        story,
        category,
        location,
        goalAmount,
        deadline: deadline ? new Date(deadline) : null,
        budgetBreakdown,
        coverImage,
        additionalMedia,
        isApproved: false, // Campaigns need approval
      })
      .returning({
        id: campaigns.id,
        title: campaigns.title,
        slug: campaigns.slug,
        summary: campaigns.summary,
        category: campaigns.category,
        goalAmount: campaigns.goalAmount,
        isApproved: campaigns.isApproved,
        createdAt: campaigns.createdAt,
      });

    res.status(201).json({
      success: true,
      message: 'Campaign created successfully. It will be reviewed before going live.',
      data: newCampaign,
    });
  } catch (error) {
    console.error('Create campaign error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create campaign',
    });
  }
});

// Update campaign
router.put('/:id', authMiddleware, requireVerifiedUser, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // Check if campaign exists and belongs to user
    const [existingCampaign] = await db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.id, id), eq(campaigns.userId, userId)))
      .limit(1);

    if (!existingCampaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found or you do not have permission to edit it',
      });
    }

    // Extract updateable fields
    const {
      title,
      summary,
      story,
      category,
      location,
      goalAmount,
      deadline,
      budgetBreakdown,
      coverImage,
      additionalMedia,
    } = req.body;

    const updateData: any = { updatedAt: new Date() };

    if (title !== undefined) {
      updateData.title = title;
      // Update slug if title changed
      if (title !== existingCampaign.title) {
        let baseSlug = generateSlug(title);
        let slug = baseSlug;
        let counter = 1;

        while (true) {
          const [existing] = await db
            .select({ id: campaigns.id })
            .from(campaigns)
            .where(and(eq(campaigns.slug, slug), sql`${campaigns.id} != ${id}`))
            .limit(1);

          if (!existing) break;

          slug = `${baseSlug}-${counter}`;
          counter++;
        }
        updateData.slug = slug;
      }
    }

    if (summary !== undefined) updateData.summary = summary;
    if (story !== undefined) updateData.story = story;
    if (category !== undefined) updateData.category = category;
    if (location !== undefined) updateData.location = location;
    if (goalAmount !== undefined) {
      if (parseFloat(goalAmount) <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Goal amount must be greater than 0',
        });
      }
      updateData.goalAmount = goalAmount;
    }
    if (deadline !== undefined) updateData.deadline = deadline ? new Date(deadline) : null;
    if (budgetBreakdown !== undefined) updateData.budgetBreakdown = budgetBreakdown;
    if (coverImage !== undefined) updateData.coverImage = coverImage;
    if (additionalMedia !== undefined) updateData.additionalMedia = additionalMedia;

    // Update campaign
    const [updatedCampaign] = await db
      .update(campaigns)
      .set(updateData)
      .where(eq(campaigns.id, id))
      .returning({
        id: campaigns.id,
        title: campaigns.title,
        slug: campaigns.slug,
        summary: campaigns.summary,
        updatedAt: campaigns.updatedAt,
      });

    res.json({
      success: true,
      message: 'Campaign updated successfully',
      data: updatedCampaign,
    });
  } catch (error) {
    console.error('Update campaign error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update campaign',
    });
  }
});

// Delete campaign
router.delete('/:id', authMiddleware, requireVerifiedUser, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // Check if campaign exists and belongs to user
    const [existingCampaign] = await db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.id, id), eq(campaigns.userId, userId)))
      .limit(1);

    if (!existingCampaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found or you do not have permission to delete it',
      });
    }

    // Check if campaign has donations
    const [donationCount] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(donations)
      .where(eq(donations.campaignId, id));

    if (donationCount && donationCount.count > 0) {
      // Soft delete - just deactivate
      await db
        .update(campaigns)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(campaigns.id, id));

      res.json({
        success: true,
        message: 'Campaign deactivated successfully (donations exist, so it cannot be permanently deleted)',
      });
    } else {
      // Hard delete if no donations
      await db.delete(campaigns).where(eq(campaigns.id, id));

      res.json({
        success: true,
        message: 'Campaign deleted successfully',
      });
    }
  } catch (error) {
    console.error('Delete campaign error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete campaign',
    });
  }
});

// Debug endpoint to check campaign balances (temporary)
router.get('/debug/balances', async (req, res) => {
  try {
    const campaignsWithBalance = await db
      .select({
        id: campaigns.id,
        title: campaigns.title,
        currentAmount: campaigns.currentAmount,
        availableBalance: campaigns.availableBalance,
        paidOut: campaigns.paidOut,
        stripeConnectAccountId: campaigns.stripeConnectAccountId,
      })
      .from(campaigns)
      .limit(10);

    res.json({
      success: true,
      data: campaignsWithBalance,
    });
  } catch (error) {
    console.error('Debug balance check error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check balances',
    });
  }
});

// Debug endpoint to set Stripe Connect account ID for testing
router.post('/debug/set-stripe-connect/:campaignId', async (req, res) => {
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
