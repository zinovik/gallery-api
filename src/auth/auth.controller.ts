import {
    Controller,
    Post,
    Body,
    Res,
    Req,
    UseGuards,
    Get,
    Param,
    Query,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { SkipAuthGuard } from '../common/skip-auth-guard.decorator';
import { UsersService } from '../users/users.service';
import { User } from '../common/user.type';
import { ConfigService } from '@nestjs/config';
import { SkipJwtUpdateInterceptor } from '../common/skip-jwt-update-interceptor.decorator';
import { EditGuard } from './edit.guard';
import { Configuration } from '../app/configuration';
import { ShareQueryInDto } from './dto/share.query.in.dto';
import { JwtService } from '@nestjs/jwt';
import { checkIsCookieRestrictedBrowser } from './check-is-cookie-restricted-browser';

@Controller('auth')
@SkipJwtUpdateInterceptor()
export class AuthController {
    constructor(
        private configService: ConfigService<Configuration, true>,
        private authService: AuthService,
        private jwtService: JwtService,
        private userService: UsersService
    ) {}

    @SkipAuthGuard()
    @Post('login')
    async login(
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
        @Body() { token }: { token: string }
    ) {
        const maxAge = this.configService.getOrThrow('maxAge', { infer: true });
        const email = await this.authService.verifyAndDecodeGoogleToken(token);
        const user = await this.userService.findOne(email);
        const csrf = this.authService.generateCSRF(32);
        const accessToken = await this.authService.createAccessToken(
            user.email,
            user.isEditAccess,
            user.accesses,
            csrf,
            maxAge
        );

        const isCookieRestrictedBrowser = checkIsCookieRestrictedBrowser(
            request.headers['user-agent']
        );

        if (!isCookieRestrictedBrowser) {
            response.cookie('access_token', accessToken, {
                httpOnly: true,
                sameSite: 'none',
                secure: true,
                maxAge,
                partitioned: true,
            });
        }

        return {
            ...(isCookieRestrictedBrowser ? { accessToken } : { csrf }),
            user: await this.jwtService.verifyAsync(accessToken, {
                secret: this.configService.getOrThrow('jwtSecret', {
                    infer: true,
                }),
            }),
        };
    }

    @Get('share/*path')
    @UseGuards(EditGuard)
    async share(
        @Param('path') path: string,
        @Query() { expires_in_h: expiresInH }: ShareQueryInDto
    ) {
        const token = await this.authService.getSharedAlbumToken(
            path,
            `${expiresInH}h`
        );

        return { token };
    }

    @Post('logout')
    async logout(
        @Req() request: Request & { user?: User; token?: string },
        @Res({ passthrough: true }) response: Response
    ) {
        response.clearCookie('access_token', {
            httpOnly: true,
            sameSite: 'none',
            secure: true,
            partitioned: true,
        });

        if (request.token) {
            await this.authService.updateInvalidated();
            await this.authService.invalidateToken(request.token);
        }

        return { success: true };
    }
}
