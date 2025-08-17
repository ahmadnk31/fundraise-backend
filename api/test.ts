import { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  return res.json({
    message: 'Hello from Vercel!',
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    env: {
      NODE_ENV: process.env.NODE_ENV,
      DATABASE_URL: process.env.DATABASE_URL ? 'configured' : 'missing'
    }
  });
}
