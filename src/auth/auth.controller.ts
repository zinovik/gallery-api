import {
    Controller,
    Post,
    HttpCode,
    HttpStatus,
    Body,
    UseGuards,
    Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { Public } from '../common/public';
import { UsersService } from '../users/users.service';

const MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

@Controller('auth')
export class AuthController {
    constructor(
        private authService: AuthService,
        private userService: UsersService
    ) {}

    @Public()
    @HttpCode(HttpStatus.OK)
    @Post('login')
    async login(
        @Res({ passthrough: true }) response: Response,
        @Body() { token }: { token: string }
    ) {
        const email = await this.authService.verifyAndDecodeGoogleToken(token);
        const user = await this.userService.findOne(email);
        const csrf = this.authService.generateCSRF(32);
        const accessToken = await this.authService.createAccessToken(
            user.email,
            user.isEditAccess,
            user.accesses,
            csrf,
            MAX_AGE
        );

        response.cookie('access_token', accessToken, {
            httpOnly: true,
            sameSite: 'none',
            secure: true,
            maxAge: MAX_AGE,
        });

        return { csrf };
    }

    @UseGuards(AuthGuard)
    @HttpCode(HttpStatus.OK)
    @Post('logout')
    async logout(@Res({ passthrough: true }) response: Response) {
        response.clearCookie('access_token');

        return { success: true };
    }
}
