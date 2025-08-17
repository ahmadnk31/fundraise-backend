import express from 'express';
import multer from 'multer';
import { S3Service } from '../services/s3.service';
import { authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images and videos
    const allowedMimes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/webm',
      'video/mov',
      'video/avi',
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images and videos are allowed.'));
    }
  },
});

// Get signed upload URL
router.post('/signed-url', authMiddleware, async (req, res) => {
  try {
    const { filename, contentType, type } = req.body;
    const userId = req.user?.id;

    if (!filename || !contentType || !type) {
      return res.status(400).json({
        success: false,
        message: 'Filename, content type, and upload type are required',
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    // Validate upload type
    const validTypes = ['campaign', 'profile', 'update'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid upload type',
      });
    }

    // Generate file key
    const fileKey = S3Service.generateFileKey(userId, type, filename);

    // Get signed URL
    const signedUrl = await S3Service.getSignedUploadUrl(fileKey, contentType);

    // Generate the final public URL
    const publicUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_S3_REGION}.amazonaws.com/${fileKey}`;

    res.json({
      success: true,
      data: {
        uploadUrl: signedUrl,
        fileKey,
        publicUrl,
      },
    });
  } catch (error) {
    console.error('Signed URL generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate upload URL',
    });
  }
});

// Direct file upload (alternative to signed URL)
router.post('/direct', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const { type } = req.body;
    const userId = req.user?.id;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    if (!type) {
      return res.status(400).json({
        success: false,
        message: 'Upload type is required',
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    // Validate upload type
    const validTypes = ['campaign', 'profile', 'update'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid upload type',
      });
    }

    // Generate file key
    const fileKey = S3Service.generateFileKey(userId, type, req.file.originalname);

    // Upload to S3
    const publicUrl = await S3Service.uploadFile(
      req.file.buffer,
      fileKey,
      req.file.mimetype
    );

    res.json({
      success: true,
      data: {
        fileKey,
        publicUrl,
        originalName: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
      },
    });
  } catch (error) {
    console.error('Direct upload error:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to upload file',
    });
  }
});

// Multiple file upload
router.post('/multiple', authMiddleware, upload.array('files', 10), async (req, res) => {
  try {
    const { type } = req.body;
    const userId = req.user?.id;
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded',
      });
    }

    if (!type) {
      return res.status(400).json({
        success: false,
        message: 'Upload type is required',
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    // Validate upload type
    const validTypes = ['campaign', 'profile', 'update'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid upload type',
      });
    }

    // Upload all files
    const uploads = await Promise.all(
      files.map(async (file) => {
        const fileKey = S3Service.generateFileKey(userId, type, file.originalname);
        const publicUrl = await S3Service.uploadFile(
          file.buffer,
          fileKey,
          file.mimetype
        );

        return {
          fileKey,
          publicUrl,
          originalName: file.originalname,
          size: file.size,
          mimeType: file.mimetype,
        };
      })
    );

    res.json({
      success: true,
      data: uploads,
    });
  } catch (error) {
    console.error('Multiple upload error:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to upload files',
    });
  }
});

// Delete file
router.delete('/:fileKey', authMiddleware, async (req, res) => {
  try {
    const { fileKey } = req.params;
    const userId = req.user?.id;

    if (!fileKey) {
      return res.status(400).json({
        success: false,
        message: 'File key is required',
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    // Verify user owns the file (check if file key contains user ID)
    if (!fileKey.includes(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this file',
      });
    }

    // Delete from S3
    await S3Service.deleteFile(fileKey);

    res.json({
      success: true,
      message: 'File deleted successfully',
    });
  } catch (error) {
    console.error('File deletion error:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to delete file',
    });
  }
});

// Error handling middleware for multer
router.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 10MB.',
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Maximum is 10 files.',
      });
    }
  }

  if (error.message === 'Invalid file type. Only images and videos are allowed.') {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  next(error);
});

export default router;
