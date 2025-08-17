import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { comments, campaigns, users } from '../db/schema.js';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

// Validation schemas
const createCommentSchema = z.object({
  campaignId: z.string().uuid(),
  content: z.string().min(1).max(1000),
  parentId: z.string().uuid().optional(),
});

const updateCommentSchema = z.object({
  content: z.string().min(1).max(1000),
});

// Get replies for a specific comment
router.get('/:commentId/replies', async (req: Request, res: Response) => {
  try {
    const { commentId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    // Check if parent comment exists
    const parentComment = await db.query.comments.findFirst({
      where: eq(comments.id, commentId),
    });

    if (!parentComment) {
      return res.status(404).json({
        success: false,
        message: 'Parent comment not found',
      });
    }

    // Get all replies with user information and their reply counts
    const allReplies = await db.query.comments.findMany({
      where: and(
        eq(comments.parentId, commentId),
        eq(comments.isApproved, true)
      ),
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
      orderBy: [asc(comments.createdAt)],
    });

    // Add reply counts to each reply
    const repliesWithCounts = await Promise.all(
      allReplies.map(async (reply) => {
        const [replyCountResult] = await db
          .select({ count: sql<number>`cast(count(*) as int)` })
          .from(comments)
          .where(and(
            eq(comments.parentId, reply.id),
            eq(comments.isApproved, true)
          ));

        return {
          ...reply,
          replyCount: replyCountResult?.count || 0,
          replies: [], // Don't include nested replies - they'll be loaded on demand
        };
      })
    );

    // Apply pagination
    const paginatedReplies = repliesWithCounts.slice(offset, offset + limit);
    const total = repliesWithCounts.length;
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    res.json({
      success: true,
      data: {
        replies: paginatedReplies,
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
    console.error('Get replies error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

// Get comments for a campaign
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

        // Get all comments with user information and reply counts
    const allComments = await db.query.comments.findMany({
      where: and(
        eq(comments.campaignId, campaignId),
        eq(comments.isApproved, true)
      ),
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
      orderBy: [asc(comments.createdAt)],
    });

    // Get only top-level comments for initial load
    const topLevelComments = allComments
      .filter(comment => !comment.parentId)
      .map(comment => {
        // Count direct replies
        const directReplies = allComments.filter(c => c.parentId === comment.id);
        
        return {
          ...comment,
          replyCount: directReplies.length,
          replies: [], // Don't include replies initially - they'll be loaded on demand
        };
      });

    // Apply pagination to top-level comments only
    const paginatedComments = topLevelComments
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(offset, offset + limit);

    const totalTopLevelComments = topLevelComments.length;
    const totalPages = Math.ceil(totalTopLevelComments / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    res.json({
      success: true,
      data: {
        comments: paginatedComments,
        pagination: {
          page,
          limit,
          total: totalTopLevelComments,
          totalPages,
          hasNext,
          hasPrev,
        },
      },
    });

  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

// Create a new comment (requires authentication)
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const validatedData = createCommentSchema.parse(req.body);

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

    // If parentId is provided, check if parent comment exists
    if (validatedData.parentId) {
      const parentComment = await db.query.comments.findFirst({
        where: eq(comments.id, validatedData.parentId),
      });

      if (!parentComment) {
        return res.status(404).json({
          success: false,
          message: 'Parent comment not found',
        });
      }
    }

    // Create the comment
    const [comment] = await db.insert(comments).values({
      campaignId: validatedData.campaignId,
      userId,
      content: validatedData.content,
      parentId: validatedData.parentId || null,
    }).returning();

    // Get the created comment with user information
    const commentWithUser = await db.query.comments.findFirst({
      where: eq(comments.id, comment.id),
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
    });

    res.status(201).json({
      success: true,
      message: 'Comment created successfully',
      data: { comment: commentWithUser },
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.issues,
      });
    }

    console.error('Create comment error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

// Update a comment (requires authentication and ownership)
router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const validatedData = updateCommentSchema.parse(req.body);

    // Check if comment exists and user owns it
    const comment = await db.query.comments.findFirst({
      where: eq(comments.id, id),
    });

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found',
      });
    }

    if (comment.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only edit your own comments',
      });
    }

    // Update the comment
    const [updatedComment] = await db.update(comments)
      .set({
        content: validatedData.content,
        updatedAt: new Date(),
      })
      .where(eq(comments.id, id))
      .returning();

    // Get the updated comment with user information
    const commentWithUser = await db.query.comments.findFirst({
      where: eq(comments.id, updatedComment.id),
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
    });

    res.json({
      success: true,
      message: 'Comment updated successfully',
      data: { comment: commentWithUser },
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.issues,
      });
    }

    console.error('Update comment error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

// Delete a comment (requires authentication and ownership)
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;

    // Check if comment exists and user owns it
    const comment = await db.query.comments.findFirst({
      where: eq(comments.id, id),
    });

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found',
      });
    }

    if (comment.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own comments',
      });
    }

    // Delete the comment
    await db.delete(comments).where(eq(comments.id, id));

    res.json({
      success: true,
      message: 'Comment deleted successfully',
    });

  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

export default router;
