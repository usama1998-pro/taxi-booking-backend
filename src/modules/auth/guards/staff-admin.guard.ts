import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth.types';

/** Staff JWT (`typ: user`) with `is_admin` — includes super admins. */
@Injectable()
export class StaffAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const user = req.user;
    if (!user || user.typ !== 'user' || !user.is_admin) {
      throw new ForbiddenException('Staff admin access required');
    }
    return true;
  }
}
