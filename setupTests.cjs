// Set up test environment variables manually
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'salesbase_test';
process.env.DB_USER = 'testuser';
process.env.DB_PASSWORD = 'testpass';
process.env.JWT_SECRET = 'VerySecure123!@#Complex';
process.env.JWT_EXPIRES_IN = '1h';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.FRONTEND_URL = 'https://localhost:3000';

// Make sure JWT_SECRET is defined for tests
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-tests-only';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';