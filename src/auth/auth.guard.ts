import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../common/public';
import { AuthService } from './auth.service';

const MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(
        private jwtService: JwtService,
        private authService: AuthService,
        private reflector: Reflector
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const isPublic = this.reflector.getAllAndOverride<boolean>(
            IS_PUBLIC_KEY,
            [context.getHandler(), context.getClass()]
        );

        const request = context.switchToHttp().getRequest();
        const token = request.cookies['access_token'];

        if (!token) {
            return isPublic;
        }

        try {
            const payload = await this.jwtService.verifyAsync(token, {
                secret: process.env.DEVELOPMENT
                    ? 'local-development-secret'
                    : process.env['JWT_SECRET'],
            });

            const csrf = this.extractCSRFTokenFromHeader(request);

            if (csrf !== payload.csrf) {
                return isPublic;
            }

            request['user'] = payload;
        } catch {
            return isPublic;
        }

        const accessToken = await this.authService.createAccessToken(
            request['user'].email,
            request['user'].isEditAccess,
            request['user'].accesses,
            request['user'].csrf,
            MAX_AGE
        );

        context
            .switchToHttp()
            .getResponse()
            .cookie('access_token', accessToken, {
                httpOnly: true,
                sameSite: 'none',
                secure: true,
                maxAge: MAX_AGE,
            });

        return true;
    }

    private extractCSRFTokenFromHeader(request: Request): string | undefined {
        return (request.headers as any).authorization;
    }
}
