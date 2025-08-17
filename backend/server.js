// filepath: /Users/ky/Desktop/GitHub/VS_Code/SalesBase/salesbase-backend/backend/server.js

const dotenv = require('dotenv');
dotenv.config();

console.log('DATABASE_URL:', process.env.DATABASE_URL);

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const crudRoutes = require('./routes/crudAPI');
const YAML = require('yamljs');
const middleware = require('./middleware');
const authenticateToken = middleware.authenticateToken;

const PORT = process.env.PORT || 3001;

console.log(`Starting server on port ${PORT}`);
console.log('Starting SalesBase API...');
console.log('PORT:', process.env.PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('FRONTEND_URL:', process.env.FRONTEND_URL);
console.log('PGHOST:', process.env.PGHOST);
console.log('PGPORT:', process.env.PGPORT);
console.log('PGDATABASE:', process.env.PGDATABASE);
console.log('PGUSER:', process.env.PGUSER);
console.log('PGPASSWORD:', process.env.PGPASSWORD);
console.log('JWT_SECRET:', process.env.JWT_SECRET);
console.log('JWT_EXPIRES_IN:', process.env.JWT_EXPIRES_IN);
console.log('RATE_LIMIT_WINDOW_MS:', process.env.RATE_LIMIT_WINDOW_MS);
console.log('RATE_LIMIT_MAX_REQUESTS:', process.env.RATE_LIMIT_MAX_REQUESTS);
console.log('LOG_LEVEL:', process.env.LOG_LEVEL);

const app = express();

const contactsRoutes = require('./routes/contacts');
const pipelineAnalyticsRoutes = require('./routes/pipelineAnalytics');
const salesPerformanceRoutes = require('./routes/salesPerformance');

app.use('/api/contacts', contactsRoutes);
app.use('/api/pipeline/analytics', pipelineAnalyticsRoutes);
app.use('/api/sales-performance', salesPerformanceRoutes);
app.use('/auth', require('./routes/auth'));
app.use('/crud', crudRoutes);
app.use('/contacts', require('./routes/contacts'));
app.use('/pipeline', require('./routes/pipelineAnalytics'));
app.use('/sales-performance', require('./routes/salesPerformance'));
const authRoutes = require('./routes/auth');
app.use('/auth', authRoutes);
app.use('/auth/change-password', require('./routes/authChangePassword'));
app.use('/companies', require('./routes/companies'));
app.use('/deals', require('./routes/deals'));
app.use('/integrations', require('./routes/integrations'));

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
  'https://salesbase-backend.onrender.com',
  'https://salesbase-frontend-qhm9pz19v-kypythons-projects.vercel.app' // <-- Add this line
];

app.use((req, res, next) => {
  console.log('CORS Origin:', req.headers.origin);
  next();
});

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

// Handle preflight requests for all routes
app.options('*', cors(corsOptions));

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

// CORS error handler (add BEFORE global error handler)
app.use((err, req, res, next) => {
  if (err && err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS Error', message: err.message });
  }
  next(err);
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