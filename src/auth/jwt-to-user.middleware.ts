import { Injectable, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class JwtToUserMiddleware implements NestMiddleware {
    constructor(private jwtService: JwtService) {}

    async use(
        request: Request & { user: any },
        _response: Response,
        next: NextFunction
    ) {
        const token = request.cookies['access_token'];

        if (!token) {
            next();
            return;
        }

        try {
            const payload = await this.jwtService.verifyAsync(token, {
                secret: process.env.DEVELOPMENT
                    ? 'local-development-secret'
                    : process.env['JWT_SECRET'],
            });

            const csrf = this.extractCSRFTokenFromHeader(request);

            if (csrf !== payload.csrf) {
                next();
                return;
            }

            request['user'] = payload;
        } catch (error: unknown) {
            next();
            return;
        }

        next();
    }

    private extractCSRFTokenFromHeader(request: Request): string | undefined {
        return request.headers.authorization;
    }
}
