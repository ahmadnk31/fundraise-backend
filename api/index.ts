import type { VercelRequest, VercelResponse } from '@vercel/node';

// Vercel serverless function for fundraise API
export default function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url } = req;

  try {
    if (url === '/api/health') {
      return res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        database: process.env.DATABASE_URL ? 'configured' : 'missing'
      });
    }

    if (url === '/api/test') {
      return res.status(200).json({
        message: 'Test endpoint working',
        timestamp: new Date().toISOString()
      });
    }

    return res.status(404).json({
      success: false,
      message: 'API endpoint not found',
      path: url
    });

  } catch (error) {
    console.error('Handler error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}
