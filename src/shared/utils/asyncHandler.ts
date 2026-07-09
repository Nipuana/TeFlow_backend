import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wraps an async route/controller so rejected promises are forwarded to the
 * centralised error handler instead of crashing the process or hanging the
 * request. Keeps controllers free of repetitive try/catch.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown,
): RequestHandler {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
