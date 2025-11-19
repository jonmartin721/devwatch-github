export default {
  testEnvironment: 'jsdom',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'background.js',
    'popup/*.js',
    'popup/controllers/*.js',
    'popup/views/*.js',
    'options/*.js',
    'options/controllers/*.js',
    'options/views/*.js',
    'shared/*.js',
    'shared/api/*.js',
    'shared/ui/*.js',
    '!**/*.test.js'
  ],
  coverageThreshold: {
    global: {
      branches: 46,
      functions: 44,
      lines: 47
    }
  },
  transform: {},
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js']
};
