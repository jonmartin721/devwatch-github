/**
 * User-friendly error handling utilities
 * Converts technical errors into helpful user messages
 */

import { escapeHtml } from './sanitize.js';

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
    title: 'GitHub Sign-In Needed',
    message: 'Your GitHub sign-in expired or was revoked. Reconnect GitHub in settings to keep monitoring repositories.',
    action: 'Open Settings'
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
  if (
    errorMessage.includes('token')
    || errorMessage.includes('auth')
    || errorMessage.includes('sign-in')
    || errorMessage.includes('revoked')
    || errorMessage.includes('unauthorized')
    || errorMessage.includes('expired')
  ) {
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

  // Ensure technical details are always a string
  let technical = '';
  if (error) {
    if (typeof error === 'string') {
      technical = error;
    } else if (error.message) {
      technical = error.message;
    } else if (error.toString && error.toString() !== '[object Object]') {
      technical = error.toString();
    } else {
      technical = JSON.stringify(error);
    }
  }

  return {
    type: errorType,
    title: baseMessage.title,
    message,
    action: baseMessage.action,
    technical
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

  // Ensure all fields are strings before sanitizing
  const title = String(userError.title || 'Error');
  const message = String(userError.message || 'An unexpected error occurred');
  const technical = userError.technical
    ? (typeof userError.technical === 'object' ? JSON.stringify(userError.technical) : String(userError.technical))
    : '';

  // Sanitize all user-provided content to prevent XSS
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const safeTechnical = technical ? escapeHtml(technical) : '';

  // Create clickable toast-style error notification
  element.innerHTML = `
    <div class="error-toast" id="${errorId}" role="alert" aria-live="assertive">
      <div class="error-summary" data-details-id="${errorId}-details">
        <svg class="error-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>
        </svg>
        <span class="error-brief">${safeTitle}</span>
        <span class="error-expand">›</span>
      </div>
      <div class="error-details" id="${errorId}-details">
        <p>${safeMessage}</p>
        ${safeTechnical ? `<small class="error-technical">Details: ${safeTechnical}</small>` : ''}
        <div class="error-actions">
          ${userError.type === ERROR_TYPES.AUTHENTICATION ? '<button class="error-action-btn" id="openSettingsBtn">Open Settings</button>' : ''}
          <button class="error-dismiss" data-element-id="${elementId}">Dismiss</button>
        </div>
      </div>
    </div>
  `;

  element.style.display = 'block';
  element.classList.add('toast-notification');

  // Add event listeners (CSP-compliant)
  const summary = element.querySelector('.error-summary');
  const dismissBtn = element.querySelector('.error-dismiss');

  if (summary) {
    summary.addEventListener('click', () => {
      const detailsId = summary.dataset.detailsId;
      const details = document.getElementById(detailsId);
      if (details) {
        details.classList.toggle('visible');
      }
    });
  }

  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      const elId = dismissBtn.dataset.elementId;
      const el = document.getElementById(elId);
      if (el) {
        el.style.display = 'none';
      }
    });
  }

  // Add settings button listener for auth errors
  const settingsBtn = element.querySelector('#openSettingsBtn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

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
  console.error('[Error Handler]', userError.title + ':', userError.message);
  if (userError.technical) {
    console.error('[Error Details]', userError.technical);
  }
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

  const safeMessage = escapeHtml(message);

  element.innerHTML = `
    <div class="success-content">
      <strong>Success</strong>
      <p>${safeMessage}</p>
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
    let errorMessage = 'Unknown error';

    try {
      // Read the response body as text first
      const responseText = await response.text();

      // Try to parse as JSON to extract message
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.message || responseText || errorMessage;
      } catch {
        // If not valid JSON, use the text directly
        errorMessage = responseText || errorMessage;
      }
    } catch {
      // If reading the response fails, use default message
      errorMessage = 'Unknown error';
    }

    const error = new Error(errorMessage);
    error.response = response;
    error.context = context;
    throw error;
  }

  return response;
}
