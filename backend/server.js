console.log(`Starting server on port ${PORT}`);

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const winston = require('winston');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const crudRoutes = require('./routes/crudAPI');
const YAML = require('yamljs');
const middleware = require('./middleware');
const authenticateToken = middleware.authenticateToken;

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

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  logger.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  logger.error('Uncaught Exception:', error);
  if (error.code === 'MODULE_NOT_FOUND') {
    console.error('Critical error: Module not found. Exiting process.');
    process.exit(1);
  }
});

const allowedOrigins = [
  'http://localhost:3000',
  'https://salesbase-frontend.vercel.app',
  'https://salesbase-backend.onrender.com'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

app.use(helmet());
app.use(compression());
app.use(rateLimit({ windowMs: 60000, max: 1000 }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, _, next) => {
  console.log('>>> Incoming request:', req.method, req.originalUrl);
  next();
});

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
app.get('/health', (_, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

console.log('🔄 Registering routes...');

// Swagger docs
try {
  const swaggerDocument = YAML.load(path.join(__dirname, 'swagger.yaml'));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
  console.log('✅ Swagger docs loaded');
} catch (error) {
  console.error('⚠️ Swagger docs not loaded:', error);
}

app.use(express.static(path.join(__dirname, 'public')));

// Import and use other routes
app.use('/api/crud', crudRoutes);
const authRoutes = require('./routes/auth');
const companiesRoutes = require('./routes/companies');
const dealsRoutes = require('./routes/deals');
const integrationsRoutes = require('./routes/integrations');
app.use('/api/auth', authRoutes);
app.use('/api/companies', companiesRoutes);
app.use('/api/deals', dealsRoutes);
app.use('/api/integrations', integrationsRoutes);

// Root route (public)
app.get('/', (_, res) => {
  res.json({
    message: 'Welcome to SalesBase API!',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

// Catch-all 404 handler (public)
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Global error handler
app.use((error, _, res, __) => {
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

// Start server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    logger.info(`🚀 SalesBase API server running on port ${PORT}`);
    console.log(`🚀 SalesBase API server running on port ${PORT}`);
  });
}