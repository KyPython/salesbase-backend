#!/usr/bin/env node

/**
 * Database Backup Script
 * 
 * This script creates a backup of the PostgreSQL database using pg_dump.
 * 
 * Usage:
 *   node backup-db.js [output-directory]
 * 
 * Options:
 *   output-directory: Directory to store the backup file (default: ./backups)
 */

require('dotenv').config();
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Parse command line arguments
const outputDir = process.argv[2] || path.join(__dirname, '..', 'backups');

// Create output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Extract database connection details from DATABASE_URL
const parseDbUrl = (url) => {
  const regex = /postgres:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/;
  const match = url.match(regex);
  
  if (!match) {
    throw new Error('Invalid DATABASE_URL format');
  }
  
  return {
    user: match[1],
    password: match[2],
    host: match[3],
    port: match[4],
    database: match[5]
  };
};

// Get database connection info
let dbInfo;
try {
  dbInfo = parseDbUrl(process.env.DATABASE_URL);
} catch (error) {
  console.error('Error parsing DATABASE_URL:', error.message);
  process.exit(1);
}

// Generate backup filename with timestamp
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = path.join(outputDir, `backup-${dbInfo.database}-${timestamp}.sql`);

console.log(`Creating backup of ${dbInfo.database} database to ${backupFile}`);

// Spawn pg_dump process
const pgDump = spawn('pg_dump', [
  '-h', dbInfo.host,
  '-p', dbInfo.port,
  '-U', dbInfo.user,
  '-F', 'c', // Custom format (compressed)
  '-b', // Include large objects
  '-v', // Verbose
  '-f', backupFile,
  dbInfo.database
], {
  env: {
    ...process.env,
    PGPASSWORD: dbInfo.password
  }
});

pgDump.stdout.on('data', (data) => {
  console.log(data.toString().trim());
});

pgDump.stderr.on('data', (data) => {
  const msg = data.toString().trim();
  // pg_dump sends progress information to stderr, so we need to check if it's an actual error
  if (msg.includes('ERROR:') || msg.includes('FATAL:')) {
    console.error(msg);
  } else {
    console.log(msg);
  }
});

pgDump.on('close', (code) => {
  if (code === 0) {
    console.log(`Backup completed successfully: ${backupFile}`);
    
    // Get file size
    const stats = fs.statSync(backupFile);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`Backup size: ${fileSizeMB} MB`);
  } else {
    console.error(`pg_dump process exited with code ${code}`);
    process.exit(1);
  }
});
