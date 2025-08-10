const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const winston = require('winston');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const reportRoutes = require('./routes/reportRoutes');
const crudRoutes = require('./routes/crudAPI'); // Your CRUD routes
const pool = require('./routes/db'); // Adjust path if needed

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'salesbase-api' },
  transports: [new winston.transports.Console({ format: winston.format.simple() })]
});

const allowedOrigins = [
  'http://localhost:3000',
  'https://salesbase-frontend.vercel.app', // deployed frontend
  'https://salesbase-backend.onrender.com' // deployed backend (optional for SSR)
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// Security middlewares
app.use(helmet());
app.use(compression());

// Rate limiting globally (1k requests/min)
app.use(rateLimit({ windowMs: 60000, max: 1000 }));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Log every incoming request (for debugging)
app.use((req, res, next) => {
  console.log('>>> Incoming request:', req.method, req.originalUrl);
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  if (req.method === 'POST') {
    console.log('📮 POST REQUEST DETECTED:', req.method, req.path, 'Body:', req.body);
  }

  const originalSend = res.send;
  res.send = function (data) {
    logger.info(`${req.method} ${req.path} - ${res.statusCode}`, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      statusCode: res.statusCode
    });
    return originalSend.call(this, data);
  };
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

console.log('🔄 Registering routes...');

// Register reports routes first (must be before CRUD routes)
app.use('/api/reports', reportRoutes);

// Middleware to intercept /api/reports requests and prevent passing to CRUD router
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/reports')) {
    // If no matching reports route, send this 404 to avoid CRUD router catching it
    return res.status(404).json({
      error: 'Route not found in reports router',
      path: req.originalUrl,
      method: req.method
    });
  }
  next();
});

// Register CRUD routes for all other /api requests
app.use('/api', crudRoutes);

console.log('✅ CRUD routes registered');

// Swagger docs
try {
  const swaggerDocument = YAML.load(path.join(__dirname, 'swagger.yaml'));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
  console.log('✅ Swagger docs loaded');
} catch (error) {
  console.log('⚠️ Swagger docs not loaded (swagger.yaml not found)');
}

// Global error handler
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', error);

  if (error.type === 'validation') {
    return res.status(400).json({
      error: 'Validation Error',
      details: error.details
    });
  }

  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 catch-all route
app.use('*', (req, res) => {
  console.log('🚨 404 - Route not found:', req.method, req.originalUrl, 'Body:', req.body, 'Headers:', req.headers.authorization ? 'Auth present' : 'No auth');
  res.status(404).json({ error: 'Route not found', path: req.originalUrl, method: req.method });
});

// Start server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    logger.info(`🚀 SalesBase API server running on port ${PORT}`);
    console.log(`🚀 SalesBase API server running on port ${PORT}`);
  });
}

module.exports = app;
