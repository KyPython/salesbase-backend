module.exports = {
  apps: [
    {
      name: 'salesbase-api',
      script: './backend/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      combine_logs: true,
      out_file: './logs/app.log',
      error_file: './logs/error.log',
      merge_logs: true
    },
    {
      name: 'salesbase-backup',
      script: './backend/scripts/automated-backup.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: false,
      watch: false,
      cron_restart: '0 2 * * *', // Run daily at 2 AM
      env: {
        NODE_ENV: 'production'
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: './logs/backup.log',
      error_file: './logs/backup-error.log'
    },
    {
      name: 'salesbase-scheduler',
      script: './backend/scheduler.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production'
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: './logs/scheduler.log',
      error_file: './logs/scheduler-error.log'
    }
  ]
};
