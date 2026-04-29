import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth.types';

const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * - Passengers may **read** any driver (`GET` with `:driverId` or list).
 * - Passengers may not **write** another driver's profile or car.
 * - A driver may only access resources where `:driverId` matches their JWT `sub`.
 * - Unauthenticated requests (e.g. public register) pass through.
 */
@Injectable()
export class DriverSelfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      method: string;
      user?: AuthenticatedUser;
      params: Record<string, string>;
    }>();
    const user = request.user;
    if (!user) {
      return true;
    }
    if (user.typ === 'user' && user.is_admin) {
      return true;
    }

    const method = request.method.toUpperCase();
    const driverId = request.params['driverId'];
    const isWrite = WRITE_METHODS.has(method);

    if (user.typ === 'user') {
      if (driverId && isWrite) {
        throw new ForbiddenException(
          'Passengers cannot modify driver profiles or cars',
        );
      }
      return true;
    }

    if (!driverId) {
      return true;
    }
    if (driverId !== user.sub) {
      throw new ForbiddenException(
        'You may only access your own driver profile and car',
      );
    }
    return true;
  }
}
