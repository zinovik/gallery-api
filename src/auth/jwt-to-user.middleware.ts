import { Injectable, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { User } from '../common/user.type';

@Injectable()
export class JwtToUserMiddleware implements NestMiddleware {
    constructor(
        private jwtService: JwtService,
        private authService: AuthService
    ) {}

    async use(
        request: Request & { user: User; token: string },
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

            const csrf = request.headers.authorization;

            if (csrf !== payload.csrf) {
                next();
                return;
            }

            await this.authService.updateInvalidated();
            if (await this.authService.isInvalidated(token)) {
                next();
                return;
            }

            request['user'] = payload;
            request['token'] = token;
        } catch (error: unknown) {
            next();
            return;
        }

        next();
    }
}
