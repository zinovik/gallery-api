import { Injectable, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request, Response, NextFunction } from 'express';
import { User } from '../common/user.type';
import { ConfigService } from '@nestjs/config';
import { Configuration } from '../app/configuration';
import { TokenAccess } from '../common/album-file.types';

@Injectable()
export class JwtParamToTokenAccessMiddleware implements NestMiddleware {
    constructor(
        private jwtService: JwtService,
        private configService: ConfigService<Configuration, true>
    ) {}

    async use(
        request: Request & {
            user?: User;
            token?: string;
            tokenAccess?: TokenAccess;
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

            request['tokenAccess'] = {
                path: payload.path,
                dateRanges: payload.dateRanges,
                tags: payload.tags,
            };
        } catch {
            next();
            return;
        }

        next();
    }
}
