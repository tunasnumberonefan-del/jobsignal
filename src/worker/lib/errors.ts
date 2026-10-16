// One error type for anything we expect to show the user. Everything else becomes a 500
// with a request id, and the details go to the log, not the response.

export type ErrorCode =
  | 'bad_request' | 'unauthorized' | 'forbidden' | 'not_found' | 'conflict'
  | 'rate_limited' | 'quota_exceeded' | 'plan_required' | 'unsupported_url'
  | 'upstream_unavailable' | 'disabled' | 'internal';

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400, unauthorized: 401, forbidden: 403, not_found: 404, conflict: 409,
  rate_limited: 429, quota_exceeded: 429, plan_required: 402, unsupported_url: 422,
  upstream_unavailable: 502, disabled: 503, internal: 500,
};

export class AppError extends Error {
  readonly status: number;
  constructor(readonly code: ErrorCode, message: string, readonly extra?: Record<string, unknown>) {
    super(message);
    this.status = STATUS[code];
  }
}

export const badRequest = (m: string, extra?: Record<string, unknown>) => new AppError('bad_request', m, extra);
export const notFound = (m = "That doesn't exist, or you don't have access to it.") => new AppError('not_found', m);
export const unauthorized = (m = 'Please sign in first.') => new AppError('unauthorized', m);
export const forbidden = (m = "You don't have access to that.") => new AppError('forbidden', m);
export const planRequired = (feature: string) =>
  new AppError('plan_required', `${feature} is part of Pro.`, { feature });
