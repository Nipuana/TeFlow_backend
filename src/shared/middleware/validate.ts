import type { Request, Response, NextFunction } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { ApiError } from '../utils/ApiError';

/**
 * Schema validation + field ALLOW-LISTING (API3: Mass Assignment / BOPLA).
 *
 * Each route declares a Zod schema for `body`, `query`, and/or `params`. The
 * parsed, allow-listed result REPLACES the raw request data, so a controller
 * can only ever see fields the schema explicitly permits. A client cannot
 * smuggle extra properties (`role`, `orgId`, `isAdmin`, `id`, …) into a write —
 * they are stripped/rejected before any service logic runs.
 */
export interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

export function validate(schemas: ValidationSchemas = {}) {
  return function validator(req: Request, _res: Response, next: NextFunction): void {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) {
        // req.query is a read-only getter on newer Express — store the parsed
        // copy on a field the controllers read instead.
        req.validatedQuery = schemas.query.parse(req.query);
      }
      if (schemas.body) req.body = schemas.body.parse(req.body);
      return next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
        return next(ApiError.badRequest('Validation failed', details));
      }
      return next(err);
    }
  };
}
