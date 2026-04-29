import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth.types';

/**
 * Drivers cannot use `/users` APIs. Passengers may only access their own `/:id`.
 * Admins (`is_admin`) can access any user resource.
 */
@Injectable()
export class UsersResourceGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
      params: Record<string, string>;
    }>();
    const user = request.user;
    if (!user) {
      return true;
    }
    if (user.is_admin) {
      return true;
    }
    if (user.typ === 'driver') {
      throw new ForbiddenException('Drivers cannot access passenger user APIs');
    }
    const id = request.params['id'];
    if (id && id !== user.sub) {
      throw new ForbiddenException('You may only access your own user profile');
    }
    return true;
  }
}
