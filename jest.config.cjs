module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.js$': ['babel-jest', { configFile: './babel.config.cjs' }]
  },
  moduleFileExtensions: ['js', 'json'],
  testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
  transformIgnorePatterns: [
    'node_modules/(?!(esm-module-name)/)'
  ],
  maxWorkers: '50%',
  testPathIgnorePatterns: ['/node_modules/'],
  collectCoverageFrom: ['backend/**/*.js'],
  setupFilesAfterEnv: ['./setupTests.cjs']
};