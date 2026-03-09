# Test Suite

This directory contains the test suite for the GitHub Devwatch Chrome extension.

Most tests here are unit-level or DOM-focused integration tests running under Jest with jsdom and mocked Chrome APIs. They are useful for regression coverage, but they do not replace manual testing in a loaded extension or a full browser-level end-to-end pass.

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm test -- --coverage

# Run specific test file
npm test -- background.test.js
```

## Test Structure

Tests are organized by feature and component:

### Core Functionality Tests
- `background.test.js` - Background service worker and API integration
- `github-api.test.js` - GitHub API helpers and response handling
- `storage-helpers.test.js` - Chrome storage API wrappers

### Feature Tests
- `accessibility.test.js` - ARIA labels and keyboard navigation
- `error-handler.test.js` - Error display and handling
- `offline.test.js` - Offline mode and caching
- `onboarding.test.js` - Onboarding wizard flow
- `phase1.test.js` - UI features (dark mode, filtering, activity grouping)
- `security.test.js` - XSS prevention and HTML sanitization

### Controller Tests
- `popup-*.test.js` - Popup UI controller tests
- `options-*.test.js` - Settings page controller tests
- `npm-api.test.js` - NPM package integration tests

### Utility Tests
- `utils.test.js` - Utility functions

## Coverage Thresholds

Jest enforces the following global minimum coverage thresholds:
- **Lines**: 47%
- **Branches**: 46%
- **Functions**: 44%

Current thresholds are defined in `jest.config.js`. They are guardrails for CI, not a statement that every extension path is covered.

Current coverage can be viewed by running `npm test -- --coverage`.

## Writing Tests

Tests use Jest with jsdom for DOM testing. Key patterns:

### Basic Test Structure
```javascript
import { jest, describe, test, beforeEach, expect } from '@jest/globals';

describe('Feature Name', () => {
  beforeEach(() => {
    // Setup
  });

  test('should do something', () => {
    // Test implementation
  });
});
```

### Mocking Chrome APIs
```javascript
beforeEach(() => {
  global.chrome = {
    storage: {
      sync: {
        get: jest.fn(() => Promise.resolve({})),
        set: jest.fn(() => Promise.resolve())
      }
    }
  };
});
```

### Async/Await Testing
```javascript
test('async operation', async () => {
  const result = await someAsyncFunction();
  expect(result).toBe(expected);
});
```

## CI/CD

Tests run automatically on every push and pull request via GitHub Actions:
- Linting
- Type checking
- Test execution
- Coverage enforcement
- Build validation

## Test Setup

Global test setup is in `setup.js`, which provides:
- Chrome API mocks
- jsdom environment configuration
- Common test utilities

## Adding New Tests

1. Create a new test file matching the pattern `*.test.js`
2. Import necessary dependencies from `@jest/globals`
3. Write descriptive test cases
4. Ensure tests are isolated and don't depend on external state
5. Run tests locally before committing

## Debugging Tests

To debug a specific test:
```bash
# Run with verbose output
npm test -- --verbose

# Run only one test file
npm test -- mytest.test.js

# Use console.log in tests (will be visible in output)
```
