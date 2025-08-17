const { Pool } = require('pg');
require('dotenv').config();
const winston = require('winston');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // required for Render
  }
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

module.exports = { pool, logger };