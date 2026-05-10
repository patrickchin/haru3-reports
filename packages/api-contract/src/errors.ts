export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Array<{ field: string; message: string; code: string }>;
    requestId?: string;
  };
}

export function isApiError(value: unknown): value is ApiErrorResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as any).error === 'object' &&
    typeof (value as any).error.code === 'string' &&
    typeof (value as any).error.message === 'string'
  );
}

export function getErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    return error.error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 500,
    public readonly details?: Array<{ field: string; message: string; code: string }>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  toJSON(): ApiErrorResponse {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
      },
    };
  }
}
