/**
 * Error handling tests
 */

import { jest } from '@jest/globals';
import {
  classifyError,
  getUserFriendlyError,
  showError,
  clearError,
  showSuccess,
  handleApiResponse
} from '../shared/error-handler.js';

// Mock DOM
document.body.innerHTML = `
  <div id="errorMessage" style="display: none;"></div>
  <div id="statusMessage" style="display: none;"></div>
`;

describe('Error Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearError('errorMessage');
    clearError('statusMessage');
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  describe('classifyError', () => {
    it('should classify authentication errors', () => {
      expect(classifyError(new Error('Invalid token'))).toBe('auth');
      expect(classifyError('unauthorized', { status: 401 })).toBe('auth');
    });

    it('should classify rate limit errors', () => {
      expect(classifyError(new Error('rate limit exceeded'))).toBe('rate_limit');
      expect(classifyError('API rate limit', { status: 429 })).toBe('rate_limit');
    });

    it('should classify network errors', () => {
      expect(classifyError(new Error('fetch failed'))).toBe('network');
      expect(classifyError(new Error('network error'))).toBe('network');
    });

    it('should classify not found errors', () => {
      expect(classifyError(new Error('not found'))).toBe('not_found');
      expect(classifyError('Repository not found', { status: 404 })).toBe('not_found');
    });

    it('should classify permission errors', () => {
      expect(classifyError(new Error('permission denied'))).toBe('permission');
      expect(classifyError('Access denied', { status: 403 })).toBe('permission');
    });

    it('should classify validation errors', () => {
      expect(classifyError(new Error('validation failed'))).toBe('validation');
      expect(classifyError('Invalid input', { status: 422 })).toBe('validation');
    });

    it('should classify storage errors', () => {
      expect(classifyError(new Error('storage quota exceeded'))).toBe('storage');
      expect(classifyError(new Error('quota exceeded'))).toBe('storage');
    });

    it('should classify unknown errors', () => {
      expect(classifyError(new Error('random error'))).toBe('unknown');
      expect(classifyError('some weird error')).toBe('unknown');
    });
  });

  describe('getUserFriendlyError', () => {
    it('should return user-friendly authentication error', () => {
      const error = getUserFriendlyError(new Error('Invalid token'));

      expect(error.type).toBe('auth');
      expect(error.title).toBe('Authentication Error');
      expect(error.message).toContain('invalid or has expired');
      expect(error.action).toBe('Update Token');
    });

    it('should return user-friendly network error', () => {
      const error = getUserFriendlyError(new Error('fetch failed'));

      expect(error.type).toBe('network');
      expect(error.title).toBe('Network Error');
      expect(error.message).toContain('internet connection');
      expect(error.action).toBe('Try Again');
    });

    it('should include repository context when provided', () => {
      const error = getUserFriendlyError(
        new Error('not found'),
        null,
        { repo: 'facebook/react' }
      );

      expect(error.message).toContain('repository \'facebook/react\'');
    });

    it('should include action context when provided', () => {
      const error = getUserFriendlyError(
        new Error('rate limit exceeded'),
        null,
        { action: 'refresh activities' }
      );

      expect(error.message).toContain('Failed to refresh activities');
    });

    it('should include rate limit reset time when available', () => {
      const futureTime = Math.floor(Date.now() / 1000) + 300; // 5 minutes from now
      const mockResponse = {
        headers: {
          get: jest.fn((header) => {
            if (header === 'X-RateLimit-Reset') return futureTime.toString();
            return null;
          })
        }
      };

      const error = getUserFriendlyError(
        new Error('rate limit exceeded'),
        mockResponse
      );

      expect(error.message).toContain('approximately 5 minutes');
    });

    it('should preserve technical error details', () => {
      const originalError = new Error('Technical details here');
      const error = getUserFriendlyError(originalError);

      expect(error.technical).toBe('Technical details here');
    });
  });

  describe('showError', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should display error message in element', () => {
      const error = new Error('Test error');
      showError('errorMessage', error);

      const element = document.getElementById('errorMessage');
      expect(element.style.display).toBe('block');
      expect(element.innerHTML).toContain('Unexpected Error');
      expect(element.innerHTML).toContain('Something went wrong');
      // ARIA attributes are on the inner error-toast div, not the container
      expect(element.innerHTML).toContain('role="alert"');
      expect(element.innerHTML).toContain('aria-live="assertive"');
    });

    it('should auto-hide after duration', () => {
      const error = new Error('Test error');
      showError('errorMessage', error, null, {}, 1000);

      const element = document.getElementById('errorMessage');
      expect(element.style.display).toBe('block');

      jest.advanceTimersByTime(1000);
      expect(element.style.display).toBe('none');
    });

    it('should not auto-hide if duration is 0', () => {
      const error = new Error('Test error');
      showError('errorMessage', error, null, {}, 0);

      const element = document.getElementById('errorMessage');
      expect(element.style.display).toBe('block');

      jest.advanceTimersByTime(10000);
      expect(element.style.display).toBe('block');
    });

    it('should include dismiss button', () => {
      const error = new Error('Invalid token');
      showError('errorMessage', error);

      const element = document.getElementById('errorMessage');
      expect(element.innerHTML).toContain('Dismiss');
      expect(element.innerHTML).toContain('error-dismiss');
      expect(element.innerHTML).toContain('error-actions');
    });

    it('should log technical details', () => {
      const error = new Error('Technical details');
      showError('errorMessage', error);

      expect(console.error).toHaveBeenCalledWith('[Error Details]', 'Technical details');
    });

    it('should handle missing element gracefully', () => {
      expect(() => {
        showError('nonexistent', new Error('test'));
      }).not.toThrow();
    });
  });

  describe('clearError', () => {
    it('should clear error message', () => {
      // First show an error
      showError('errorMessage', new Error('test'));
      let element = document.getElementById('errorMessage');
      expect(element.style.display).toBe('block');

      // Then clear it
      clearError('errorMessage');
      element = document.getElementById('errorMessage');
      expect(element.style.display).toBe('none');
      expect(element.innerHTML).toBe('');
      expect(element).not.toHaveAttribute('role');
      expect(element).not.toHaveAttribute('aria-live');
    });

    it('should handle missing element gracefully', () => {
      expect(() => {
        clearError('nonexistent');
      }).not.toThrow();
    });
  });

  describe('showSuccess', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should display success message', () => {
      showSuccess('statusMessage', 'Operation completed successfully');

      const element = document.getElementById('statusMessage');
      expect(element.style.display).toBe('block');
      expect(element.innerHTML).toContain('Success');
      expect(element.innerHTML).toContain('Operation completed successfully');
      expect(element).toHaveAttribute('role', 'status');
      expect(element).toHaveAttribute('aria-live', 'polite');
    });

    it('should auto-hide after duration', () => {
      showSuccess('statusMessage', 'Success!', 1000);

      const element = document.getElementById('statusMessage');
      expect(element.style.display).toBe('block');

      jest.advanceTimersByTime(1000);
      expect(element.style.display).toBe('none');
    });

    it('should handle missing element gracefully', () => {
      expect(() => {
        showSuccess('nonexistent', 'test');
      }).not.toThrow();
    });
  });

  describe('handleApiResponse', () => {
    it('should return response for successful requests', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ data: 'success' })
      };

      const result = await handleApiResponse(mockResponse, 'test operation');
      expect(result).toBe(mockResponse);
    });

    it('should throw error for failed requests', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        text: jest.fn().mockResolvedValue('Not found'),
        json: jest.fn().mockRejectedValue(new Error('Invalid JSON'))
      };

      await expect(handleApiResponse(mockResponse, 'test operation')).rejects.toThrow('Not found');
    });

    it('should use JSON error message if available', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        text: jest.fn().mockResolvedValue('{"message":"JSON error message"}')
      };

      await expect(handleApiResponse(mockResponse, 'test operation')).rejects.toThrow('JSON error message');
    });

    it('should include response and context in error', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue('Server error')
      };

      try {
        await handleApiResponse(mockResponse, 'fetch data');
      } catch (error) {
        expect(error.response).toBe(mockResponse);
        expect(error.context).toBe('fetch data');
      }
    });
  });
});

export {};