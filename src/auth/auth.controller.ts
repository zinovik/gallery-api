import {
    Controller,
    Post,
    HttpCode,
    HttpStatus,
    Body,
    UseGuards,
    Get,
    Request,
    Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { User } from '../common/user';
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
        const { accessToken, user, csrf } = await this.authService.signIn(
            token
        );

        response.cookie('access_token', accessToken, {
            httpOnly: true,
            sameSite: 'none',
            secure: true,
            maxAge: 24 * 60 * 60 * 1000,
        });

        return { user, csrf };
    }

    @UseGuards(AuthGuard)
    @Get('profile')
    getProfile(@Request() req: { user: User }) {
        return req.user;
    }
}
