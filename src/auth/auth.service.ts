import { LoginTicket, OAuth2Client } from 'google-auth-library';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

const MOCK_DB: {
    invalidatedTokens: {
        token: string;
        invalidatedAt: Date;
    }[];
} = {
    invalidatedTokens: [],
};

@Injectable()
export class AuthService {
    private readonly client = new OAuth2Client();

    constructor(
        private configService: ConfigService,
        private jwtService: JwtService
    ) {}

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
        const clientId = this.configService.getOrThrow<string>('clientId');
        let ticket: LoginTicket;

        try {
            ticket = this.configService.getOrThrow<boolean>('isDevelopment')
                ? ({
                      getPayload: () => ({ email: 'zinovik@gmail.com' }),
                  } as LoginTicket)
                : await this.client.verifyIdToken({
                      idToken: token,
                      audience: clientId,
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

    async getSharedAlbumToken(path: string, expiresIn: string | number) {
        return await this.jwtService.signAsync({ path }, { expiresIn });
    }

    async invalidateToken(token: string): Promise<void> {
        if (
            MOCK_DB.invalidatedTokens.every(
                (invalidatedToken) => invalidatedToken.token !== token
            )
        ) {
            MOCK_DB.invalidatedTokens.push({
                token,
                invalidatedAt: new Date(),
            });
        }
    }

    async updateInvalidated(): Promise<void> {
        const maxAge = this.configService.getOrThrow<number>('maxAge');
        const nowMinusMaxAge = new Date(Date.now() - maxAge);

        MOCK_DB.invalidatedTokens = MOCK_DB.invalidatedTokens.filter(
            (invalidatedToken) =>
                invalidatedToken.invalidatedAt > nowMinusMaxAge
        );
    }

    async isInvalidated(token: string): Promise<boolean> {
        return MOCK_DB.invalidatedTokens.some(
            (invalidatedToken) => invalidatedToken.token === token
        );
    }
}
