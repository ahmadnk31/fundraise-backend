import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  region: process.env.AWS_S3_REGION || process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME!;

export class S3Service {
  static async uploadFile(
    file: Buffer,
    key: string,
    contentType: string
  ): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: file,
        ContentType: contentType,
        ACL: 'public-read',
      });

      await s3Client.send(command);
      
      // Return the public URL
      return `https://${BUCKET_NAME}.s3.${process.env.AWS_S3_REGION}.amazonaws.com/${key}`;
    } catch (error) {
      console.error('Error uploading file to S3:', error);
      throw new Error('Failed to upload file');
    }
  }

  static async deleteFile(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      });

      await s3Client.send(command);
    } catch (error) {
      console.error('Error deleting file from S3:', error);
      throw new Error('Failed to delete file');
    }
  }

  static async getSignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn = 300 // 5 minutes
  ): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        ContentType: contentType,
        ACL: 'public-read',
      });

      return await getSignedUrl(s3Client, command, { expiresIn });
    } catch (error) {
      console.error('Error generating signed URL:', error);
      throw new Error('Failed to generate upload URL');
    }
  }

  static async getSignedDownloadUrl(
    key: string,
    expiresIn = 3600 // 1 hour
  ): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      });

      return await getSignedUrl(s3Client, command, { expiresIn });
    } catch (error) {
      console.error('Error generating signed download URL:', error);
      throw new Error('Failed to generate download URL');
    }
  }

  static generateFileKey(
    userId: string,
    type: 'campaign' | 'profile' | 'update',
    filename: string
  ): string {
    const timestamp = Date.now();
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    return `${type}s/${userId}/${timestamp}-${sanitizedFilename}`;
  }
}
