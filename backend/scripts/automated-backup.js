#!/usr/bin/env node

/**
 * Automated Database Backup Script
 * 
 * This script creates automated backups of the PostgreSQL database and manages backup retention.
 * It can be set up as a cron job to run on a schedule.
 * 
 * Usage:
 *   node automated-backup.js [options]
 * 
 * Options:
 *   --output-dir=DIR   Directory to store backups (default: ../backups)
 *   --retention=DAYS   Number of days to keep backups (default: 30)
 *   --prefix=PREFIX    Prefix for backup files (default: 'salesbase')
 */

require('dotenv').config();
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
let outputDir = path.join(__dirname, '..', 'backups');
let retentionDays = 30;
let filePrefix = 'salesbase';

// Parse named arguments
args.forEach(arg => {
  if (arg.startsWith('--output-dir=')) {
    outputDir = arg.split('=')[1];
  } else if (arg.startsWith('--retention=')) {
    retentionDays = parseInt(arg.split('=')[1], 10);
  } else if (arg.startsWith('--prefix=')) {
    filePrefix = arg.split('=')[1];
  }
});

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
const backupFile = path.join(outputDir, `${filePrefix}-backup-${timestamp}.sql`);

console.log(`Creating backup of ${dbInfo.database} database to ${backupFile}`);

// Function to create the backup
const createBackup = () => {
  return new Promise((resolve, reject) => {
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
        resolve(backupFile);
      } else {
        const error = new Error(`pg_dump process exited with code ${code}`);
        console.error(error.message);
        reject(error);
      }
    });
  });
};

// Function to clean up old backups
const cleanupOldBackups = () => {
  console.log(`Cleaning up backups older than ${retentionDays} days...`);
  
  try {
    // Get all backup files
    const files = fs.readdirSync(outputDir)
      .filter(file => file.startsWith(`${filePrefix}-backup-`) && file.endsWith('.sql'))
      .map(file => path.join(outputDir, file));
    
    // Check each file's age
    const now = new Date();
    let deletedCount = 0;
    
    files.forEach(file => {
      const stats = fs.statSync(file);
      const fileAgeDays = (now - stats.mtime) / (1000 * 60 * 60 * 24);
      
      if (fileAgeDays > retentionDays) {
        console.log(`Deleting old backup: ${file} (${Math.floor(fileAgeDays)} days old)`);
        fs.unlinkSync(file);
        deletedCount++;
      }
    });
    
    console.log(`Cleanup completed. Deleted ${deletedCount} old backup${deletedCount !== 1 ? 's' : ''}.`);
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
};

// Main function
const main = async () => {
  try {
    // Create the backup
    await createBackup();
    
    // Clean up old backups
    cleanupOldBackups();
    
    console.log('Automated backup process completed successfully.');
  } catch (error) {
    console.error('Backup process failed:', error);
    process.exit(1);
  }
};

// Run the main function
main();
