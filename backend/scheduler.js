/**
 * Scheduler process for handling background tasks and scheduled reports
 * 
 * This is a separate process that should be run alongside the main server
 * to handle resource-intensive or scheduled tasks without affecting API performance.
 */
require('dotenv').config();
const taskScheduler = require('./services/taskScheduler');
const logger = require('./utils/logger');

// Catch unhandled exceptions and rejections
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the task scheduler
logger.info('Starting scheduler process...');

taskScheduler.start();

logger.info('Scheduler process started successfully');

// Handle termination signals
const shutdown = () => {
  logger.info('Shutting down scheduler process...');
  
  taskScheduler.stop();
  
  logger.info('Scheduler process shut down successfully');
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
