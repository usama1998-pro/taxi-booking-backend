import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth.types';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const user = req.user;
    if (!user || user.typ !== 'user' || !user.is_admin) {
      throw new ForbiddenException('Super admin access required');
    }
    if (!user.is_super_admin) {
      throw new ForbiddenException('Super admin access required');
    }
    return true;
  }
}
