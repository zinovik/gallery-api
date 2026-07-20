import { NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

export class LoggingInterceptor implements NestInterceptor {
    intercept(
        context: ExecutionContext,
        next: CallHandler
    ): Observable<unknown> {
        const request = context.switchToHttp().getRequest();

        const now = Date.now();

        return next.handle().pipe(
            tap(() => {
                const userPart = request.user
                    ? ` user: ${request.user?.email} (${
                          request.user?.sessionId
                      })`
                    : '';
                const urlPart = request.url;
                const bodyPart = request.body
                    ? ` | body: ${JSON.stringify(request.body)}`
                    : '';

                console.log(
                    `[${Date.now() - now} ms] ${urlPart}${userPart}${bodyPart}`
                );
            })
        );
    }
}
