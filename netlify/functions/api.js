const serverless = require('serverless-http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

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

// Mock API routes for testing
app.get('/api/campaigns/categories/stats', (req, res) => {
  res.json({
    success: true,
    data: {
      categories: {
        "Medical": 45,
        "Education": 32,
        "Community": 28,
        "Emergency": 15,
        "Animals": 12,
        "Sports": 8
      },
      total: 140
    }
  });
});

app.get('/api/campaigns', (req, res) => {
  const featured = req.query.featured;
  const limit = parseInt(req.query.limit || '10');
  
  const mockCampaigns = [
    {
      id: "1",
      title: "Help Build Community Center",
      summary: "Building a community center for local families",
      goalAmount: "50000",
      raisedAmount: "12500",
      deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      category: "Community",
      coverImage: "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800",
      creator: {
        id: "1",
        firstName: "John",
        lastName: "Doe",
        avatar: null
      },
      isActive: true,
      isApproved: true,
      createdAt: new Date().toISOString()
    },
    {
      id: "2",
      title: "Medical Treatment Fund",
      summary: "Raising funds for urgent medical treatment",
      goalAmount: "25000",
      raisedAmount: "18000",
      deadline: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
      category: "Medical",
      coverImage: "https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=800",
      creator: {
        id: "2",
        firstName: "Jane",
        lastName: "Smith",
        avatar: null
      },
      isActive: true,
      isApproved: true,
      createdAt: new Date().toISOString()
    }
  ];

  const campaigns = featured === 'true' ? mockCampaigns.slice(0, limit) : mockCampaigns;

  res.json({
    success: true,
    data: {
      campaigns,
      pagination: {
        page: 1,
        limit,
        total: campaigns.length,
        totalPages: 1,
        hasNext: false,
        hasPrev: false
      }
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
    path: req.originalUrl,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
  });
});

// Export handler for Netlify Functions
module.exports.handler = serverless(app);
