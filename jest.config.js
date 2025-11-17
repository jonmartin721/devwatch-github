export default {
  testEnvironment: 'jsdom',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'popup/*.js',
    'popup/controllers/*.js',
    'options/*.js',
    'options/controllers/*.js',
    'shared/*.js',
    'shared/api/*.js',
    '!**/*.test.js'
  ],
  coverageThreshold: {
    global: {
      branches: 45,
      functions: 40,
      lines: 50
    }
  },
  transform: {},
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js']
};
