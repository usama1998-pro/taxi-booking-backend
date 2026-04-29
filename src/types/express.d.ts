import type { AuthenticatedUser } from '../modules/auth/auth.types';

declare global {
  namespace Express {
    interface User extends AuthenticatedUser {}
  }
}

export {};
