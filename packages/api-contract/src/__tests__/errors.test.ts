import { describe, it, expect } from 'vitest';
import {
  isApiError,
  getErrorMessage,
  ApiError,
  type ApiErrorResponse,
} from '../errors';

// ---------------------------------------------------------------------------
// isApiError
// ---------------------------------------------------------------------------

describe('isApiError', () => {
  it('returns true for valid ApiErrorResponse', () => {
    const valid: ApiErrorResponse = {
      error: { code: 'not_found', message: 'Resource not found' },
    };
    expect(isApiError(valid)).toBe(true);
  });

  it('returns true when optional fields are present', () => {
    const withDetails: ApiErrorResponse = {
      error: {
        code: 'validation_error',
        message: 'Invalid input',
        details: [{ field: 'email', message: 'Required', code: 'required' }],
        requestId: 'req-123',
      },
    };
    expect(isApiError(withDetails)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isApiError(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isApiError(undefined)).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isApiError('string')).toBe(false);
    expect(isApiError(42)).toBe(false);
    expect(isApiError(true)).toBe(false);
  });

  it('returns false when error.code is missing', () => {
    expect(isApiError({ error: { message: 'oops' } })).toBe(false);
  });

  it('returns false when error.message is missing', () => {
    expect(isApiError({ error: { code: 'err' } })).toBe(false);
  });

  it('returns false when error is not an object', () => {
    expect(isApiError({ error: 'string' })).toBe(false);
  });

  it('returns false for empty object', () => {
    expect(isApiError({})).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getErrorMessage
// ---------------------------------------------------------------------------

describe('getErrorMessage', () => {
  it('extracts message from ApiErrorResponse', () => {
    const err: ApiErrorResponse = {
      error: { code: 'bad_request', message: 'Missing field' },
    };
    expect(getErrorMessage(err)).toBe('Missing field');
  });

  it('extracts message from Error instance', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('returns fallback for unknown values', () => {
    expect(getErrorMessage(null)).toBe('An unexpected error occurred');
    expect(getErrorMessage(undefined)).toBe('An unexpected error occurred');
    expect(getErrorMessage(42)).toBe('An unexpected error occurred');
    expect(getErrorMessage('string')).toBe('An unexpected error occurred');
  });

  it('prefers ApiErrorResponse over Error shape', () => {
    // An object that satisfies both shapes — ApiErrorResponse check comes first
    const hybrid = {
      error: { code: 'hybrid', message: 'api message' },
      message: 'error message',
    };
    expect(getErrorMessage(hybrid)).toBe('api message');
  });
});

// ---------------------------------------------------------------------------
// ApiError class
// ---------------------------------------------------------------------------

describe('ApiError', () => {
  it('extends Error', () => {
    const err = new ApiError('not_found', 'Not found', 404);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
  });

  it('sets name to "ApiError"', () => {
    const err = new ApiError('err', 'msg');
    expect(err.name).toBe('ApiError');
  });

  it('stores code, message, and status', () => {
    const err = new ApiError('forbidden', 'Access denied', 403);
    expect(err.code).toBe('forbidden');
    expect(err.message).toBe('Access denied');
    expect(err.status).toBe(403);
  });

  it('defaults status to 500', () => {
    const err = new ApiError('internal', 'Server error');
    expect(err.status).toBe(500);
  });

  it('stores optional details', () => {
    const details = [{ field: 'email', message: 'Invalid', code: 'invalid_format' }];
    const err = new ApiError('validation', 'Bad input', 422, details);
    expect(err.details).toEqual(details);
  });

  it('details is undefined when not provided', () => {
    const err = new ApiError('err', 'msg');
    expect(err.details).toBeUndefined();
  });

  describe('toJSON', () => {
    it('returns ApiErrorResponse shape', () => {
      const err = new ApiError('not_found', 'Not found', 404);
      const json = err.toJSON();

      expect(json).toEqual({
        error: {
          code: 'not_found',
          message: 'Not found',
        },
      });
    });

    it('includes details when present', () => {
      const details = [{ field: 'name', message: 'Required', code: 'required' }];
      const err = new ApiError('validation', 'Bad input', 422, details);
      const json = err.toJSON();

      expect(json).toEqual({
        error: {
          code: 'validation',
          message: 'Bad input',
          details,
        },
      });
    });

    it('omits details key when not present', () => {
      const err = new ApiError('err', 'msg');
      const json = err.toJSON();
      expect(json.error).not.toHaveProperty('details');
    });

    it('output passes isApiError check', () => {
      const err = new ApiError('test', 'test message', 400);
      expect(isApiError(err.toJSON())).toBe(true);
    });
  });
});
