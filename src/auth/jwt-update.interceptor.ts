import {
    NestInterceptor,
    ExecutionContext,
    CallHandler,
    Injectable,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuthService } from './auth.service';

const MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

@Injectable()
export class JwtUpdate implements NestInterceptor {
    constructor(private authService: AuthService) {}

    async intercept(
        context: ExecutionContext,
        next: CallHandler
    ): Promise<Observable<any>> {
        const request = context.switchToHttp().getRequest();
        const response = context.switchToHttp().getResponse();

        const accessToken = request['user']
            ? await this.authService.createAccessToken(
                  request['user'].email,
                  request['user'].isEditAccess,
                  request['user'].accesses,
                  request['user'].csrf,
                  MAX_AGE
              )
            : null;

        return next.handle().pipe(
            tap(() => {
                const request = context.switchToHttp().getRequest();

                if (accessToken) {
                    response.cookie('access_token', accessToken, {
                        httpOnly: true,
                        sameSite: 'none',
                        secure: true,
                        maxAge: MAX_AGE,
                    });
                }
            })
        );
    }
}
