import {
    Injectable,
    CanActivate,
    ExecutionContext,
    UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../common/public';

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(private jwtService: JwtService, private reflector: Reflector) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const isPublic = this.reflector.getAllAndOverride<boolean>(
            IS_PUBLIC_KEY,
            [context.getHandler(), context.getClass()]
        );

        const request = context.switchToHttp().getRequest();
        const token = request.cookies['access_token'];

        if (!token) {
            if (isPublic) return true;
            throw new UnauthorizedException();
        }

        try {
            const payload = await this.jwtService.verifyAsync(token, {
                secret: process.env.DEVELOPMENT
                    ? 'local-development-secret'
                    : process.env['JWT_SECRET'],
            });

            const csrf = this.extractCSRFTokenFromHeader(request);

            if (csrf !== payload.csrf) {
                if (isPublic) return true;
                throw new UnauthorizedException();
            }

            request['user'] = payload;
        } catch {
            if (isPublic) return true;
            throw new UnauthorizedException();
        }

        return true;
    }

    private extractCSRFTokenFromHeader(request: Request): string | undefined {
        return (request.headers as any).authorization;
    }
}
