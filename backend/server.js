const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const winston = require('winston');
const path = require('path');
const authRoutes = require('./routes/auth');
const crudRoutes = require('./crudAPI');
// Import report routes
const reportRoutes = require('./routes/reportRoutes');
const searchRoutes = require('./routes/search');
const pipelineRoutes = require('./routes/pipeline');
const integrationsRouter = require('./routes/integrations');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const healthRoutes = require('./routes/health');

// Load audit routes with CommonJS since the file was created with CommonJS
const auditRoutes = require('./routes/auditRoutes');

dotenv.config();

const app = express(); // Initialize app FIRST
const PORT = process.env.PORT || 3001;

// FIX: Use absolute path for swagger.yaml
const swaggerDocument = YAML.load(path.join(__dirname, 'swagger.yaml'));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use('/api/integrations', integrationsRouter);

app.use(rateLimit({ windowMs: 60000, max: 1000 }));

// Logger configuration
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'salesbase-api' },
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Security middleware
app.use(helmet());
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
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

// Register API routes
console.log('🔧 Registering routes...');
app.use('/api/auth', authRoutes);
console.log('✅ Auth routes registered');
app.use('/api/search', searchRoutes);
console.log('✅ Search routes registered');
app.use('/api/pipeline', pipelineRoutes);
console.log('✅ Pipeline routes registered');
app.use('/api/reports', reportRoutes);
console.log('✅ Report routes registered');
app.use('/api/audit', auditRoutes);
console.log('✅ Audit routes registered');
app.use('/api/health', healthRoutes);
console.log('✅ Health routes registered');
app.use('/api', crudRoutes);
console.log('✅ CRUD routes registered');

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

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Only start the server if not running in test mode
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    logger.info(`🚀 SalesBase API server running on port ${PORT}`);
  });
}

module.exports = app;