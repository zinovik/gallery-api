import {
    NestInterceptor,
    ExecutionContext,
    CallHandler,
    Injectable,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { SHOULD_SKIP_JWT_UPDATE_INTERCEPTOR_KEY } from '../common/skip-jwt-update-interceptor.decorator';
import { Configuration } from '../app/configuration';
import { checkIsCookieRestrictedBrowser } from './check-is-cookie-restricted-browser';

@Injectable()
export class JwtUpdateInterceptor implements NestInterceptor {
    constructor(
        private reflector: Reflector,
        private configService: ConfigService<Configuration, true>,
        private authService: AuthService
    ) {}

    async intercept(
        context: ExecutionContext,
        next: CallHandler
    ): Promise<Observable<unknown>> {
        const shouldSkipJwtUpdateInterceptor =
            this.reflector.getAllAndOverride<boolean>(
                SHOULD_SKIP_JWT_UPDATE_INTERCEPTOR_KEY,
                [context.getHandler(), context.getClass()]
            );

        const maxAge = this.configService.getOrThrow('maxAge', { infer: true });

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
            map((responseBody) => {
                if (!shouldSkipJwtUpdateInterceptor && accessToken) {
                    const response = context.switchToHttp().getResponse();

                    if (
                        checkIsCookieRestrictedBrowser(
                            request.headers['user-agent']
                        )
                    ) {
                        return { ...responseBody, accessToken };
                    } else {
                        response.cookie('access_token', accessToken, {
                            httpOnly: true,
                            sameSite: 'none',
                            secure: true,
                            maxAge,
                            partitioned: true,
                        });
                    }
                }

                return responseBody;
            })
        );
    }
}
