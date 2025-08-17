import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { reports } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

const reportCampaignSchema = z.object({
  campaignId: z.string().uuid(),
  reason: z.enum(['spam', 'inappropriate', 'fraud', 'offensive', 'copyright', 'other']),
  description: z.string().min(10, 'Please provide more details (minimum 10 characters)').max(500, 'Description too long (maximum 500 characters)'),
});

// Report a campaign
router.post('/', authMiddleware, async (req, res) => {
  try {
    // Validation
    const validationResult = reportCampaignSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: validationResult.error.issues,
      });
    }

    const { campaignId, reason, description } = validationResult.data;
    const reporterId = req.user!.id;

    // Check if campaign exists
    const campaign = await db.query.campaigns.findFirst({
      where: (campaigns, { eq }) => eq(campaigns.id, campaignId),
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found',
      });
    }

    // Check if user already reported this campaign
    const existingReport = await db.query.reports.findFirst({
      where: (reports, { and, eq }) => and(
        eq(reports.campaignId, campaignId),
        eq(reports.reporterId, reporterId)
      ),
    });

    if (existingReport) {
      return res.status(400).json({
        success: false,
        message: 'You have already reported this campaign',
      });
    }

    // Create the report
    const [newReport] = await db.insert(reports).values({
      campaignId,
      reporterId,
      reason,
      description,
    }).returning();

    res.status(201).json({
      success: true,
      message: 'Campaign reported successfully. Our team will review it.',
      data: {
        reportId: newReport.id,
      },
    });
  } catch (error) {
    console.error('Error reporting campaign:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit report',
    });
  }
});

// Get reports for admin (optional - for future admin panel)
router.get('/admin', authMiddleware, async (req, res) => {
  try {
    // Note: In a real app, you'd check if user is admin
    const allReports = await db.query.reports.findMany({
      with: {
        campaign: {
          columns: {
            id: true,
            title: true,
            slug: true,
          },
        },
        reporter: {
          columns: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: (reports, { desc }) => [desc(reports.createdAt)],
    });

    res.json({
      success: true,
      data: {
        reports: allReports,
      },
    });
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reports',
    });
  }
});

export default router;
