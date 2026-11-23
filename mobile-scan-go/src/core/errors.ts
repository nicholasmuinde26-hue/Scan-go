import { ApiError } from './api/client';
export function friendlyError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof TypeError) return 'Could not reach the store. Check your connection and try again.';
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
