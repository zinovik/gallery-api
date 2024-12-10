import {
    NestInterceptor,
    ExecutionContext,
    CallHandler,
    Injectable,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtUpdate implements NestInterceptor {
    constructor(
        private configService: ConfigService,
        private authService: AuthService
    ) {}

    async intercept(
        context: ExecutionContext,
        next: CallHandler
    ): Promise<Observable<unknown>> {
        const maxAge = this.configService.getOrThrow<number>('maxAge');

        const request = context.switchToHttp().getRequest();

        const accessToken = request['user']
            ? await this.authService.createAccessToken(
                  request['user'].email,
                  request['user'].isEditAccess,
                  request['user'].accesses,
                  request['user'].csrf,
                  maxAge
              )
            : null;

        return next.handle().pipe(
            tap(() => {
                if (accessToken) {
                    const response = context.switchToHttp().getResponse();

                    response.cookie('access_token', accessToken, {
                        httpOnly: true,
                        sameSite: 'none',
                        secure: true,
                        maxAge,
                    });
                }
            })
        );
    }
}
