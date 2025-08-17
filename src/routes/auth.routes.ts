import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db, users } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { EmailService } from '../services/email.service.js';

const router = express.Router();

// Helper function to generate JWT token
const generateToken = (userId: string): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not defined');
  }
  
  return jwt.sign(
    { userId } as jwt.JwtPayload, 
    secret as jwt.Secret, 
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    } as jwt.SignOptions
  );
};

// Helper function to generate verification token
const generateVerificationToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    // Validation
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long',
      });
    }

    // Check if user already exists
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (existingUser.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists',
      });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Generate verification token
    const verificationToken = generateVerificationToken();

    // Create user
    const [newUser] = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        password: hashedPassword,
        firstName,
        lastName,
        verificationToken,
      })
      .returning({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        isVerified: users.isVerified,
        createdAt: users.createdAt,
      });

    // Send welcome email
    try {
      await EmailService.sendWelcomeEmail(
        newUser.email,
        newUser.firstName,
        verificationToken
      );
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
      // Don't fail registration if email fails
    }

    // Generate JWT token
    const token = generateToken(newUser.id);

    res.status(201).json({
      success: true,
      message: 'Account created successfully. Please check your email to verify your account.',
      data: {
        token,
        user: newUser,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during registration',
    });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    // Find user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Generate JWT token
    const token = generateToken(user.id);

    // Return user data without password
    const { password: _, verificationToken, resetPasswordToken, ...userWithoutSensitiveData } = user;

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: userWithoutSensitiveData,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during login',
    });
  }
});

// Verify email
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Verification token is required',
      });
    }

    // Find user with verification token
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.verificationToken, token))
      .limit(1);

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification token',
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified',
      });
    }

    // Update user to verified
    await db
      .update(users)
      .set({
        isVerified: true,
        verificationToken: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    res.json({
      success: true,
      message: 'Email verified successfully',
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during email verification',
    });
  }
});

// Request password reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }

    // Find user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (!user) {
      // Don't reveal if email exists or not
      return res.json({
        success: true,
        message: 'If an account with that email exists, we sent you a password reset link.',
      });
    }

    // Generate reset token
    const resetToken = generateVerificationToken();
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Save reset token
    await db
      .update(users)
      .set({
        resetPasswordToken: resetToken,
        resetPasswordExpires: resetExpires,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    // Send reset email
    try {
      await EmailService.sendPasswordResetEmail(
        user.email,
        user.firstName,
        resetToken
      );
    } catch (emailError) {
      console.error('Failed to send reset email:', emailError);
      return res.status(500).json({
        success: false,
        message: 'Failed to send password reset email',
      });
    }

    res.json({
      success: true,
      message: 'Password reset link sent to your email',
    });
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during password reset request',
    });
  }
});

// Reset password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        message: 'Token and new password are required',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long',
      });
    }

    // Find user with reset token
    const [user] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.resetPasswordToken, token),
          // Check if token is not expired
        )
      )
      .limit(1);

    if (!user || !user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token',
      });
    }

    // Hash new password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Update password and clear reset token
    await db
      .update(users)
      .set({
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpires: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    res.json({
      success: true,
      message: 'Password reset successfully',
    });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during password reset',
    });
  }
});

export default router;
