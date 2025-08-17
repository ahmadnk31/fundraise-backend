import { SESClient, SendEmailCommand, SendTemplatedEmailCommand } from '@aws-sdk/client-ses';

const sesClient = new SESClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
}

export interface TemplatedEmailOptions {
  to: string | string[];
  templateName: string;
  templateData: Record<string, any>;
  from?: string;
}

export class EmailService {
  private static readonly FROM_EMAIL = process.env.SES_FROM_EMAIL!;
  private static readonly FROM_NAME = process.env.SES_FROM_NAME || 'FundRaise Platform';

  static async sendEmail(options: EmailOptions): Promise<void> {
    try {
      const destinations = Array.isArray(options.to) ? options.to : [options.to];
      
      const command = new SendEmailCommand({
        Source: options.from || `${this.FROM_NAME} <${this.FROM_EMAIL}>`,
        Destination: {
          ToAddresses: destinations,
        },
        Message: {
          Subject: {
            Data: options.subject,
            Charset: 'UTF-8',
          },
          Body: {
            Html: options.html ? {
              Data: options.html,
              Charset: 'UTF-8',
            } : undefined,
            Text: options.text ? {
              Data: options.text,
              Charset: 'UTF-8',
            } : undefined,
          },
        },
      });

      await sesClient.send(command);
      console.log(`✅ Email sent successfully to: ${destinations.join(', ')}`);
    } catch (error) {
      console.error('❌ Error sending email:', error);
      throw new Error('Failed to send email');
    }
  }

  static async sendTemplatedEmail(options: TemplatedEmailOptions): Promise<void> {
    try {
      const destinations = Array.isArray(options.to) ? options.to : [options.to];
      
      const command = new SendTemplatedEmailCommand({
        Source: options.from || `${this.FROM_NAME} <${this.FROM_EMAIL}>`,
        Destination: {
          ToAddresses: destinations,
        },
        Template: options.templateName,
        TemplateData: JSON.stringify(options.templateData),
      });

      await sesClient.send(command);
      console.log(`✅ Templated email sent successfully to: ${destinations.join(', ')}`);
    } catch (error) {
      console.error('❌ Error sending templated email:', error);
      throw new Error('Failed to send templated email');
    }
  }

  // Predefined email templates
  static async sendWelcomeEmail(email: string, firstName: string, verificationToken: string): Promise<void> {
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
    
    await this.sendEmail({
      to: email,
      subject: 'Welcome to FundRaise - Verify Your Account',
      html: `
        <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
          <h1 style="color: #2563eb; text-align: center;">Welcome to FundRaise!</h1>
          <p>Hi ${firstName},</p>
          <p>Thank you for joining FundRaise! We're excited to help you make a difference.</p>
          <p>To get started, please verify your email address by clicking the button below:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" 
               style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Verify Email Address
            </a>
          </div>
          <p>If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #666;">${verificationUrl}</p>
          <p>This link will expire in 24 hours.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #888; font-size: 12px;">
            If you didn't create an account with FundRaise, please ignore this email.
          </p>
        </div>
      `,
    });
  }

  static async sendPasswordResetEmail(email: string, firstName: string, resetToken: string): Promise<void> {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    
    await this.sendEmail({
      to: email,
      subject: 'Reset Your FundRaise Password',
      html: `
        <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
          <h1 style="color: #2563eb; text-align: center;">Password Reset Request</h1>
          <p>Hi ${firstName},</p>
          <p>We received a request to reset your password for your FundRaise account.</p>
          <p>Click the button below to reset your password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p>If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #666;">${resetUrl}</p>
          <p>This link will expire in 1 hour.</p>
          <p><strong>If you didn't request a password reset, please ignore this email.</strong></p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #888; font-size: 12px;">
            For security reasons, this link will only work once.
          </p>
        </div>
      `,
    });
  }

  static async sendDonationReceiptEmail(
    email: string,
    donorName: string,
    amount: string,
    campaignTitle: string,
    donationId: string
  ): Promise<void> {
    await this.sendEmail({
      to: email,
      subject: `Thank you for your donation to "${campaignTitle}"`,
      html: `
        <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
          <h1 style="color: #16a34a; text-align: center;">Thank You for Your Generous Donation!</h1>
          <p>Dear ${donorName},</p>
          <p>Thank you for your generous donation of <strong>$${amount}</strong> to "${campaignTitle}".</p>
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0; color: #333;">Donation Details:</h3>
            <p style="margin: 5px 0;"><strong>Amount:</strong> $${amount}</p>
            <p style="margin: 5px 0;"><strong>Campaign:</strong> ${campaignTitle}</p>
            <p style="margin: 5px 0;"><strong>Donation ID:</strong> ${donationId}</p>
            <p style="margin: 5px 0;"><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
          </div>
          <p>Your contribution makes a real difference and brings us one step closer to achieving this important goal.</p>
          <p>You will receive updates on the campaign's progress, and you can always visit your donor dashboard to track all your contributions.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/dashboard" 
               style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              View Dashboard
            </a>
          </div>
          <p>Thank you for your kindness and generosity!</p>
          <p>The FundRaise Team</p>
        </div>
      `,
    });
  }

  static async sendCampaignApprovalEmail(
    email: string,
    firstName: string,
    campaignTitle: string,
    campaignUrl: string
  ): Promise<void> {
    await this.sendEmail({
      to: email,
      subject: `Your campaign "${campaignTitle}" has been approved!`,
      html: `
        <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
          <h1 style="color: #16a34a; text-align: center;">🎉 Campaign Approved!</h1>
          <p>Hi ${firstName},</p>
          <p>Great news! Your campaign "<strong>${campaignTitle}</strong>" has been reviewed and approved.</p>
          <p>Your campaign is now live and people can start supporting your cause!</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${campaignUrl}" 
               style="background-color: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              View Your Campaign
            </a>
          </div>
          <h3>Next Steps:</h3>
          <ul>
            <li>Share your campaign with friends and family</li>
            <li>Post updates to keep supporters engaged</li>
            <li>Thank your donors personally when possible</li>
            <li>Provide regular progress updates</li>
          </ul>
          <p>We're excited to see your campaign succeed!</p>
          <p>The FundRaise Team</p>
        </div>
      `,
    });
  }
}
