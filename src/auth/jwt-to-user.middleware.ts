import { Injectable, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { User } from '../common/user.type';
import { ConfigService } from '@nestjs/config';
import { Configuration } from '../app/configuration';

@Injectable()
export class JwtToUserMiddleware implements NestMiddleware {
    constructor(
        private jwtService: JwtService,
        private authService: AuthService,
        private configService: ConfigService<Configuration, true>
    ) {}

    async use(
        request: Request & { user: User; token: string },
        _response: Response,
        next: NextFunction
    ) {
        const token =
            request.headers['authorization'] &&
            request.headers['authorization'].split(' ')[1] &&
            request.headers['authorization'].split(' ')[1].length > 100
                ? request.headers['authorization'].split(' ')[1]
                : request.cookies['access_token']; // DEPRECATED

        if (!token) {
            next();
            return;
        }

        try {
            const payload = await this.jwtService.verifyAsync(token, {
                secret: this.configService.getOrThrow('jwtSecret', {
                    infer: true,
                }),
            });

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
