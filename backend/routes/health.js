// filepath: /Users/ky/Desktop/GitHub/VS_Code/SalesBase/salesbase-backend/backend/routes/health.js
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;