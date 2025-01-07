import { Injectable, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request, Response, NextFunction } from 'express';
import { User } from '../common/user.type';
import { ConfigService } from '@nestjs/config';
import { Configuration } from '../app/configuration';

@Injectable()
export class JwtParamToAccessedPathMiddleware implements NestMiddleware {
    constructor(
        private jwtService: JwtService,
        private configService: ConfigService<Configuration, true>
    ) {}

    async use(
        request: Request & {
            user?: User;
            token?: string;
            accessedPath?: string;
        },
        _response: Response,
        next: NextFunction
    ) {
        const token = request.query['token'] as string;

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

            request['accessedPath'] = payload.path;
        } catch (error: unknown) {
            next();
            return;
        }

        next();
    }
}
