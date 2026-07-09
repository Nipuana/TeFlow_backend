import type { AuthUser } from '../shared/types';

/**
 * Augment Express's Request with the fields our middleware attaches, so
 * controllers get full type-safety on `req.user`, `req.id`, `req.validatedQuery`.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id?: string;
      user?: AuthUser;
      validatedQuery?: unknown;
    }
  }
}

export {};
