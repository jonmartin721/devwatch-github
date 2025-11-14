export default {
  testEnvironment: 'jsdom',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'popup/*.js',
    'options/*.js',
    'shared/*.js',
    '!**/*.test.js'
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50
    }
  },
  transform: {},
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js']
};
