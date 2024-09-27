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

@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) {}

    @Public()
    @HttpCode(HttpStatus.OK)
    @Post('login')
    async login(
        @Res({ passthrough: true }) response: Response,
        @Body() { token }: { token: string }
    ) {
        const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

        const { accessToken, csrf } = await this.authService.signIn(
            token,
            maxAge
        );

        response.cookie('access_token', accessToken, {
            httpOnly: true,
            sameSite: 'none',
            secure: true,
            maxAge,
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
