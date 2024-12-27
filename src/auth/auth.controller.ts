import { Controller, Post, Body, Res, Req } from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { SkipAuthGuard } from '../common/skip-auth-guard.decorator';
import { UsersService } from '../users/users.service';
import { User } from '../common/user.type';
import { ConfigService } from '@nestjs/config';
import { SkipJwtUpdateInterceptor } from '../common/skip-jwt-update-interceptor.decorator';

@Controller('auth')
@SkipJwtUpdateInterceptor()
export class AuthController {
    constructor(
        private configService: ConfigService,
        private authService: AuthService,
        private userService: UsersService
    ) {}

    @SkipAuthGuard()
    @Post('login')
    async login(
        @Res({ passthrough: true }) response: Response,
        @Body() { token }: { token: string }
    ) {
        const maxAge = this.configService.getOrThrow<number>('maxAge');
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

        response.cookie('access_token', accessToken, {
            httpOnly: true,
            sameSite: 'none',
            secure: true,
            maxAge,
            partitioned: true,
        });

        return { csrf };
    }

    @Post('logout')
    async logout(
        @Req() request: Request & { user?: User; token?: string },
        @Res({ passthrough: true }) response: Response
    ) {
        response.clearCookie('access_token');

        if (request.token) {
            await this.authService.updateInvalidated();
            await this.authService.invalidateToken(request.token);
        }

        return { success: true };
    }
}
