module.exports = (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url } = req;

  try {
    if (url === '/api/simple') {
      return res.status(200).json({
        status: 'OK - Simple JS Function',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        database: process.env.DATABASE_URL ? 'configured' : 'missing'
      });
    }

    return res.status(404).json({
      success: false,
      message: 'Simple endpoint not found',
      path: url
    });

  } catch (error) {
    console.error('Simple handler error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};
