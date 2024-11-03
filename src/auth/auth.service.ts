import { LoginTicket, OAuth2Client } from 'google-auth-library';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

const CLIENT_ID =
    '306312319198-u9h4e07khciuet8hnj00b8fvmq25rlj0.apps.googleusercontent.com';

@Injectable()
export class AuthService {
    private readonly client = new OAuth2Client();

    constructor(private jwtService: JwtService) {}

    generateCSRF(length: number) {
        let result = '';

        const characters =
            'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

        while (result.length < length) {
            result += characters.charAt(
                Math.floor(Math.random() * characters.length)
            );
        }

        return result;
    }

    async verifyAndDecodeGoogleToken(token: string): Promise<string> {
        let ticket: LoginTicket;

        try {
            ticket = process.env.DEVELOPMENT
                ? ({
                      getPayload: () => ({ email: 'zinovik@gmail.com' }),
                  } as LoginTicket)
                : await this.client.verifyIdToken({
                      idToken: token,
                      audience: CLIENT_ID,
                  });
        } catch (error) {
            throw new UnauthorizedException();
        }

        const payload = ticket.getPayload();

        return payload.email;
    }

    async createAccessToken(
        email: string,
        isEditAccess: boolean,
        accesses: string[],
        csrf: string,
        expiresIn: string | number
    ): Promise<string> {
        return await this.jwtService.signAsync(
            {
                email,
                isEditAccess,
                accesses,
                csrf,
            },
            { expiresIn }
        );
    }
}
