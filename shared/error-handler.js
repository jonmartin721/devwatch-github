/**
 * User-friendly error handling utilities
 * Converts technical errors into helpful user messages
 */

/**
 * Error types with user-friendly messages
 */
const ERROR_TYPES = {
  NETWORK: 'network',
  AUTHENTICATION: 'auth',
  RATE_LIMIT: 'rate_limit',
  NOT_FOUND: 'not_found',
  PERMISSION: 'permission',
  STORAGE: 'storage',
  VALIDATION: 'validation',
  UNKNOWN: 'unknown'
};

/**
 * Maps technical errors to user-friendly messages
 */
const ERROR_MESSAGES = {
  [ERROR_TYPES.NETWORK]: {
    title: 'Network Error',
    message: 'Unable to connect to GitHub. Please check your internet connection and try again.',
    action: 'Try Again'
  },
  [ERROR_TYPES.AUTHENTICATION]: {
    title: 'Authentication Error',
    message: 'Your GitHub token appears to be invalid or has expired. Please update your token in settings.',
    action: 'Update Token'
  },
  [ERROR_TYPES.RATE_LIMIT]: {
    title: 'Rate Limit Exceeded',
    message: 'GitHub API rate limit exceeded. Please wait a few minutes before trying again.',
    action: 'Try Again Later'
  },
  [ERROR_TYPES.NOT_FOUND]: {
    title: 'Not Found',
    message: 'The requested repository or resource could not be found on GitHub.',
    action: 'Check Repository Name'
  },
  [ERROR_TYPES.PERMISSION]: {
    title: 'Permission Error',
    message: 'You don\'t have permission to access this repository or resource.',
    action: 'Check Permissions'
  },
  [ERROR_TYPES.STORAGE]: {
    title: 'Storage Error',
    message: 'Unable to save data locally. This might be due to storage quota being exceeded.',
    action: 'Clear Cache'
  },
  [ERROR_TYPES.VALIDATION]: {
    title: 'Invalid Input',
    message: 'Please check your input and try again.',
    action: 'Correct Input'
  },
  [ERROR_TYPES.UNKNOWN]: {
    title: 'Unexpected Error',
    message: 'Something went wrong. Please try again or contact support if the problem persists.',
    action: 'Try Again'
  }
};

/**
 * Determines error type from error message or status
 * @param {Error|string} error - The error to classify
 * @param {Response} response - Optional fetch response
 * @returns {string} Error type
 */
export function classifyError(error, response = null) {
  if (response) {
    switch (response.status) {
      case 401:
        return ERROR_TYPES.AUTHENTICATION;
      case 403:
        return response.headers?.get('X-RateLimit-Remaining') === '0'
          ? ERROR_TYPES.RATE_LIMIT
          : ERROR_TYPES.PERMISSION;
      case 404:
        return ERROR_TYPES.NOT_FOUND;
      case 422:
        return ERROR_TYPES.VALIDATION;
      default:
        if (response.status >= 500) {
          return ERROR_TYPES.NETWORK;
        }
    }
  }

  const errorMessage = error?.message || error || '';

  if (errorMessage.includes('fetch') || errorMessage.includes('network')) {
    return ERROR_TYPES.NETWORK;
  }
  if (errorMessage.includes('token') || errorMessage.includes('auth')) {
    return ERROR_TYPES.AUTHENTICATION;
  }
  if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
    return ERROR_TYPES.RATE_LIMIT;
  }
  if (errorMessage.includes('not found') || errorMessage.includes('404')) {
    return ERROR_TYPES.NOT_FOUND;
  }
  if (errorMessage.includes('permission') || errorMessage.includes('403')) {
    return ERROR_TYPES.PERMISSION;
  }
  if (errorMessage.includes('storage') || errorMessage.includes('quota')) {
    return ERROR_TYPES.STORAGE;
  }
  if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
    return ERROR_TYPES.VALIDATION;
  }

  return ERROR_TYPES.UNKNOWN;
}

/**
 * Gets a user-friendly error message
 * @param {Error|string} error - The error to convert
 * @param {Response} response - Optional fetch response
 * @param {Object} context - Additional context for the error
 * @returns {Object} User-friendly error object with title, message, and action
 */
export function getUserFriendlyError(error, response = null, context = {}) {
  const errorType = classifyError(error, response);
  const baseMessage = ERROR_MESSAGES[errorType];

  let message = baseMessage.message;

  // Add context-specific details
  if (context.repo) {
    message = message.replace('repository or resource', `repository '${context.repo}'`);
  }
  if (context.action) {
    message = `Failed to ${context.action}. ${message}`;
  }

  // Add rate limit reset time if available
  if (errorType === ERROR_TYPES.RATE_LIMIT && response?.headers) {
    const resetTime = response.headers.get('X-RateLimit-Reset');
    if (resetTime) {
      const resetDate = new Date(parseInt(resetTime) * 1000);
      const timeRemaining = Math.ceil((resetDate - new Date()) / 1000 / 60);
      if (timeRemaining > 0) {
        message += ` Rate limit resets in approximately ${timeRemaining} minutes.`;
      }
    }
  }

  return {
    type: errorType,
    title: baseMessage.title,
    message,
    action: baseMessage.action,
    technical: error?.message || error
  };
}

/**
 * Displays an error message to the user
 * @param {string} elementId - ID of the element to show error in
 * @param {Error|string} error - The error to display
 * @param {Response} response - Optional fetch response
 * @param {Object} context - Additional context for the error
 * @param {number} duration - How long to show the error (ms), 0 for persistent
 */
export function showError(elementId, error, response = null, context = {}, duration = 5000) {
  const element = document.getElementById(elementId);
  if (!element) return;

  const userError = getUserFriendlyError(error, response, context);
  const errorId = `error-${Date.now()}`;

  // Create clickable toast-style error notification
  element.innerHTML = `
    <div class="error-toast" id="${errorId}" role="alert" aria-live="assertive">
      <div class="error-summary" onclick="document.getElementById('${errorId}-details').classList.toggle('visible')">
        <svg class="error-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0114.082 15H1.918a1.75 1.75 0 01-1.543-2.575zm1.763.707a.25.25 0 00-.44 0L1.698 13.132a.25.25 0 00.22.368h12.164a.25.25 0 00.22-.368zm.53 3.996v2.5a.75.75 0 11-1.5 0v-2.5a.75.75 0 111.5 0zM9 11a1 1 0 11-2 0 1 1 0 012 0z"/>
        </svg>
        <span class="error-brief">${userError.title}</span>
        <span class="error-expand">›</span>
      </div>
      <div class="error-details" id="${errorId}-details">
        <p>${userError.message}</p>
        ${userError.technical ? `<small class="error-technical">Details: ${userError.technical}</small>` : ''}
        <div class="error-actions">
          <button class="error-dismiss" onclick="document.getElementById('${elementId}').style.display='none'">Dismiss</button>
        </div>
      </div>
    </div>
  `;

  element.style.display = 'block';
  element.classList.add('toast-notification');

  // Auto-hide after duration if specified
  if (duration > 0) {
    setTimeout(() => {
      if (element.style.display !== 'none') {
        element.style.display = 'none';
        element.classList.remove('toast-notification');
      }
    }, duration);
  }

  // Log technical details for debugging
  console.error('User-friendly error displayed:', {
    type: userError.type,
    title: userError.title,
    message: userError.message,
    technical: userError.technical
  });
}

/**
 * Clears an error message
 * @param {string} elementId - ID of the element to clear
 */
export function clearError(elementId) {
  const element = document.getElementById(elementId);
  if (element) {
    element.style.display = 'none';
    element.innerHTML = '';
    element.classList.remove('toast-notification');
    element.removeAttribute('role');
    element.removeAttribute('aria-live');
  }
}

/**
 * Shows a success message
 * @param {string} elementId - ID of the element to show success in
 * @param {string} message - Success message to display
 * @param {number} duration - How long to show the message (ms)
 */
export function showSuccess(elementId, message, duration = 3000) {
  const element = document.getElementById(elementId);
  if (!element) return;

  element.innerHTML = `
    <div class="success-content">
      <strong>Success</strong>
      <p>${message}</p>
    </div>
  `;

  element.style.display = 'block';
  element.setAttribute('role', 'status');
  element.setAttribute('aria-live', 'polite');

  setTimeout(() => {
    if (element.style.display !== 'none') {
      element.style.display = 'none';
    }
  }, duration);
}

/**
 * Handles API responses and throws appropriate errors
 * @param {Response} response - Fetch response
 * @param {string} context - Context for the error (e.g., 'fetch repository')
 * @throws {Error} Detailed error with context
 */
export async function handleApiResponse(response, context = 'API request') {
  if (!response.ok) {
    let errorMessage = await response.text().catch(() => 'Unknown error');

    try {
      const errorData = await response.json();
      errorMessage = errorData.message || errorMessage;
    } catch {
      // Keep the text error if JSON parsing fails
    }

    const error = new Error(errorMessage);
    error.response = response;
    error.context = context;
    throw error;
  }

  return response;
}