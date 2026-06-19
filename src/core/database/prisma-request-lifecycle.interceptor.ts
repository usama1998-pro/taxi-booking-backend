import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, defer, from } from 'rxjs';
import { finalize, mergeMap } from 'rxjs/operators';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaRequestLifecycleInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    return defer(() => from(this.prisma.acquireRequestConnection())).pipe(
      mergeMap(() =>
        next.handle().pipe(
          finalize(() => {
            void this.prisma.releaseRequestConnection();
          }),
        ),
      ),
    );
  }
}
