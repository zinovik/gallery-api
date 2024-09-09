import { LoginTicket, OAuth2Client } from 'google-auth-library';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { User } from '../common/user';

const CLIENT_ID =
    '306312319198-u9h4e07khciuet8hnj00b8fvmq25rlj0.apps.googleusercontent.com';

@Injectable()
export class AuthService {
    private readonly client = new OAuth2Client();

    constructor(
        private usersService: UsersService,
        private jwtService: JwtService
    ) {}

    private generateCSRF(length: number) {
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

    async signIn(
        token: string
    ): Promise<{ accessToken: string; user: User; csrf: string }> {
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

        const user = await this.usersService.findOne(payload.email);
        const csrf = this.generateCSRF(32);

        return {
            accessToken: await this.jwtService.signAsync(
                {
                    email: user.email,
                    isEditAccess: user.isEditAccess,
                    accesses: user.accesses,
                    csrf,
                },
                { expiresIn: `24h` }
            ),
            user,
            csrf,
        };
    }
}
