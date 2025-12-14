import { LoginTicket, OAuth2Client } from 'google-auth-library';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Configuration } from '../app/configuration';

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
        private configService: ConfigService<Configuration, true>,
        private jwtService: JwtService
    ) {}

    async verifyAndDecodeGoogleToken(token: string): Promise<string> {
        const clientId = this.configService.getOrThrow('clientId', {
            infer: true,
        });
        let ticket: LoginTicket;

        try {
            ticket = this.configService.getOrThrow('isDevelopment', {
                infer: true,
            })
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
        sessionId: number,
        expiresIn: number
    ): Promise<string> {
        return await this.jwtService.signAsync(
            {
                email,
                isEditAccess,
                accesses,
                sessionId,
            },
            { expiresIn }
        );
    }

    async getSharedAlbumToken(path: string, expiresIn: number) {
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
        const maxAge = this.configService.getOrThrow('maxAge', { infer: true });
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
