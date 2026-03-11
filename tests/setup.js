import { jest } from '@jest/globals';
import { inspect } from 'node:util';
import '@testing-library/jest-dom';

function createStorageArea() {
  return {
    get: jest.fn((keys, callback) => {
      const result = {};
      if (callback) callback(result);
      return Promise.resolve(result);
    }),
    set: jest.fn((items, callback) => {
      if (callback) callback();
      return Promise.resolve();
    }),
    remove: jest.fn((keys, callback) => {
      if (callback) callback();
      return Promise.resolve();
    })
  };
}

// Mock Chrome APIs globally
global.chrome = {
  storage: {
    local: createStorageArea(),
    sync: createStorageArea(),
    session: createStorageArea()
  },
  runtime: {
    sendMessage: jest.fn(),
    openOptionsPage: jest.fn(),
    lastError: null,
    onInstalled: {
      addListener: jest.fn()
    },
    onStartup: {
      addListener: jest.fn()
    },
    onMessage: {
      addListener: jest.fn()
    }
  },
  alarms: {
    clear: jest.fn(),
    create: jest.fn(),
    onAlarm: {
      addListener: jest.fn()
    }
  },
  notifications: {
    create: jest.fn(),
    clear: jest.fn(),
    onClicked: {
      addListener: jest.fn()
    }
  },
  tabs: {
    create: jest.fn()
  },
  action: {
    setBadgeText: jest.fn(),
    setBadgeBackgroundColor: jest.fn()
  }
};

// Mock fetch API
global.fetch = jest.fn();

// Mock navigator.onLine
Object.defineProperty(navigator, 'onLine', {
  writable: true,
  value: true
});

function formatConsoleArgs(args) {
  return args.map(arg => inspect(arg, { depth: 3, breakLength: 120 })).join(' ');
}

const consoleGuardState = {};

function installConsoleGuard(method) {
  const guard = jest.spyOn(console, method).mockImplementation((...args) => {
    consoleGuardState[method].calls.push(args);
  });

  consoleGuardState[method] = {
    allowed: false,
    calls: [],
    guard,
    initialImplementation: guard.getMockImplementation()
  };
}

global.allowUnexpectedConsole = (...methods) => {
  methods.forEach((method) => {
    if (consoleGuardState[method]) {
      consoleGuardState[method].allowed = true;
    }
  });
};

// Setup mocks reset for each test
beforeEach(() => {
  jest.clearAllMocks();
  if (chrome.runtime) {
    chrome.runtime.lastError = null;
  }

  installConsoleGuard('error');
  installConsoleGuard('warn');
});

afterEach(() => {
  const guardViolations = ['error', 'warn']
    .flatMap((method) => {
      const state = consoleGuardState[method];
      if (!state) {
        return [];
      }

      if (console[method] !== state.guard || state.guard.getMockImplementation() !== state.initialImplementation) {
        return [
          `console.${method} guard was overridden during the test. Use allowUnexpectedConsole('${method}') instead of replacing console.${method}.`
        ];
      }

      return [];
    });

  const unexpectedMessages = ['error', 'warn']
    .flatMap((method) => {
      const state = consoleGuardState[method];
      if (!state) {
        return [];
      }

      if (state.allowed || state.calls.length === 0) {
        return [];
      }

      return state.calls.map(args => `console.${method}: ${formatConsoleArgs(args)}`);
    });

  ['error', 'warn'].forEach((method) => {
    const state = consoleGuardState[method];
    if (state) {
      state.guard.mockRestore();
      delete consoleGuardState[method];
    }
  });

  if (guardViolations.length > 0 || unexpectedMessages.length > 0) {
    throw new Error(
      [
        ...guardViolations,
        unexpectedMessages.length > 0
          ? `Unexpected console output. Allow console.${unexpectedMessages.length > 1 ? 'error/console.warn' : unexpectedMessages[0].includes('console.error') ? 'error' : 'warn'} in the test.\n${unexpectedMessages.join('\n')}`
          : null
      ].filter(Boolean).join('\n')
    );
  }
});
