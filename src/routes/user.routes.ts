import express from 'express';
import bcrypt from 'bcryptjs';
import { db, users, campaigns, donations } from '../db/index.js';
import { eq, desc, sql } from 'drizzle-orm';
import { authMiddleware, requireVerifiedUser } from '../middleware/auth.middleware.js';

const router = express.Router();

// Get current user profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const userId = req.user!.id;

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        avatar: users.avatar,
        isVerified: users.isVerified,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile',
    });
  }
});

// Update user profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { firstName, lastName, avatar } = req.body;

    // Validation
    if (!firstName || !lastName) {
      return res.status(400).json({
        success: false,
        message: 'First name and last name are required',
      });
    }

    // Update user
    const [updatedUser] = await db
      .update(users)
      .set({
        firstName,
        lastName,
        avatar,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        avatar: users.avatar,
        isVerified: users.isVerified,
        updatedAt: users.updatedAt,
      });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedUser,
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
    });
  }
});

// Change password
router.put('/password', authMiddleware, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { currentPassword, newPassword } = req.body;

    // Validation
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long',
      });
    }

    // Get user's current password
    const [user] = await db
      .select({ password: users.password })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect',
      });
    }

    // Hash new password
    const saltRounds = 12;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await db
      .update(users)
      .set({
        password: hashedNewPassword,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    res.json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password',
    });
  }
});

// Get user's campaigns
router.get('/campaigns', authMiddleware, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { page = '1', limit = '10', status = 'all' } = req.query;

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;

    // Build conditions
    const conditions = [eq(campaigns.userId, userId)];

    if (status === 'active') {
      conditions.push(eq(campaigns.isActive, true));
    } else if (status === 'inactive') {
      conditions.push(eq(campaigns.isActive, false));
    }

    // Get campaigns
    const userCampaigns = await db
      .select({
        id: campaigns.id,
        title: campaigns.title,
        slug: campaigns.slug,
        summary: campaigns.summary,
        category: campaigns.category,
        goalAmount: campaigns.goalAmount,
        currentAmount: campaigns.currentAmount,
        currency: campaigns.currency,
        deadline: campaigns.deadline,
        coverImage: campaigns.coverImage,
        isActive: campaigns.isActive,
        isApproved: campaigns.isApproved,
        isFeatured: campaigns.isFeatured,
        createdAt: campaigns.createdAt,
        updatedAt: campaigns.updatedAt,
      })
      .from(campaigns)
      .where(sql`${campaigns.userId} = ${userId}${status === 'active' ? sql` AND ${campaigns.isActive} = true` : status === 'inactive' ? sql` AND ${campaigns.isActive} = false` : sql``}`)
      .orderBy(desc(campaigns.createdAt))
      .limit(limitNum)
      .offset(offset);

    // Get total count
    const [totalResult] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(campaigns)
      .where(sql`${campaigns.userId} = ${userId}${status === 'active' ? sql` AND ${campaigns.isActive} = true` : status === 'inactive' ? sql` AND ${campaigns.isActive} = false` : sql``}`);

    const total = totalResult?.count || 0;
    const totalPages = Math.ceil(total / limitNum);

    res.json({
      success: true,
      data: {
        campaigns: userCampaigns,
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
    console.error('Get user campaigns error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch campaigns',
    });
  }
});

// Get user's donations
router.get('/donations', authMiddleware, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { page = '1', limit = '10' } = req.query;

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;

    // Get donations with campaign info
    const userDonations = await db
      .select({
        id: donations.id,
        amount: donations.amount,
        currency: donations.currency,
        message: donations.message,
        isAnonymous: donations.isAnonymous,
        status: donations.status,
        createdAt: donations.createdAt,
        campaign: {
          id: campaigns.id,
          title: campaigns.title,
          slug: campaigns.slug,
          coverImage: campaigns.coverImage,
        },
      })
      .from(donations)
      .innerJoin(campaigns, eq(donations.campaignId, campaigns.id))
      .where(eq(donations.donorId, userId))
      .orderBy(desc(donations.createdAt))
      .limit(limitNum)
      .offset(offset);

    // Get total count and sum
    const [stats] = await db
      .select({
        count: sql<number>`cast(count(*) as int)`,
        totalDonated: sql<number>`cast(sum(${donations.amount}) as decimal)`,
      })
      .from(donations)
      .where(eq(donations.donorId, userId));

    const total = stats?.count || 0;
    const totalPages = Math.ceil(total / limitNum);

    res.json({
      success: true,
      data: {
        donations: userDonations,
        stats: {
          totalDonations: total,
          totalAmountDonated: stats?.totalDonated || 0,
        },
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
    console.error('Get user donations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch donations',
    });
  }
});

// Get dashboard stats
router.get('/dashboard', authMiddleware, async (req, res) => {
  try {
    const userId = req.user!.id;

    // Get campaign stats
    const [campaignStats] = await db
      .select({
        totalCampaigns: sql<number>`cast(count(*) as int)`,
        activeCampaigns: sql<number>`cast(sum(case when ${campaigns.isActive} = true then 1 else 0 end) as int)`,
        totalRaised: sql<number>`cast(sum(${campaigns.currentAmount}) as decimal)`,
      })
      .from(campaigns)
      .where(eq(campaigns.userId, userId));

    // Get donation stats (as a donor)
    const [donationStats] = await db
      .select({
        totalDonations: sql<number>`cast(count(*) as int)`,
        totalDonated: sql<number>`cast(sum(${donations.amount}) as decimal)`,
      })
      .from(donations)
      .where(eq(donations.donorId, userId));

    // Get recent activity (recent donations to user's campaigns)
    const recentActivity = await db
      .select({
        id: donations.id,
        amount: donations.amount,
        donorName: donations.donorName,
        isAnonymous: donations.isAnonymous,
        createdAt: donations.createdAt,
        campaign: {
          id: campaigns.id,
          title: campaigns.title,
          slug: campaigns.slug,
        },
      })
      .from(donations)
      .innerJoin(campaigns, eq(donations.campaignId, campaigns.id))
      .where(eq(campaigns.userId, userId))
      .orderBy(desc(donations.createdAt))
      .limit(5);

    res.json({
      success: true,
      data: {
        campaigns: {
          total: campaignStats?.totalCampaigns || 0,
          active: campaignStats?.activeCampaigns || 0,
          totalRaised: campaignStats?.totalRaised || 0,
        },
        donations: {
          total: donationStats?.totalDonations || 0,
          totalAmount: donationStats?.totalDonated || 0,
        },
        recentActivity,
      },
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data',
    });
  }
});

export default router;
