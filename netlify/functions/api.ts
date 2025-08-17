import 'dotenv/config';
import serverless from 'serverless-http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

// Import routes
import authRoutes from '../../src/routes/auth.routes.js';
import campaignRoutes from '../../src/routes/campaign.routes.js';
import uploadRoutes from '../../src/routes/upload.routes.js';
import userRoutes from '../../src/routes/user.routes.js';
import donationRoutes from '../../src/routes/donation.routes.js';
import commentRoutes from '../../src/routes/comment.routes.js';
import followRoutes from '../../src/routes/follow.routes.js';
import payoutRoutes from '../../src/routes/payout.routes.js';
import reportRoutes from '../../src/routes/report.routes.js';
import stripeConnectRoutes from '../../src/routes/stripe-connect.routes.js';
import manualPayoutRoutes from '../../src/routes/manual-payout.routes.js';
import adminPayoutRoutes from '../../src/routes/admin-payout.routes.js';

const app = express();

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// CORS configuration
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:8080',
    'https://fundraise-new.vercel.app',
    'https://fundraise-inky.vercel.app',
    /^https:\/\/fundraise.*\.vercel\.app$/,
    /\.vercel\.app$/,
    'http://localhost:8080',
    'http://localhost:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with'],
}));

// Raw body parsing for Stripe webhooks
app.use('/api/donations/webhook', express.raw({ type: 'application/json' }));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    path: req.path
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API routes - using your real routes
app.use('/api/auth', authRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/users', userRoutes);
app.use('/api/donations', donationRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/follows', followRoutes);
app.use('/api/payouts', payoutRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/stripe-connect', stripeConnectRoutes);
app.use('/api/manual-payouts', manualPayoutRoutes);
app.use('/api/admin/payouts', adminPayoutRoutes);

// 404 handler for non-API routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
    path: req.originalUrl,
  });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Global error handler:', err);
  
  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(isDevelopment && { stack: err.stack }),
  });
});

// Export handler for Netlify Functions
const handler = serverless(app);
export { handler };
