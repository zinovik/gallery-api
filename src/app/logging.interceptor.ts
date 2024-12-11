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

        console.log(
            `[${now}] request started | email: ${request.user?.email} | url: ${
                request.url
            } | body: ${JSON.stringify(request.body)}`
        );

        return next
            .handle()
            .pipe(
                tap(() =>
                    console.log(
                        `[${now}] request finished in ${Date.now() - now} ms`
                    )
                )
            );
    }
}
