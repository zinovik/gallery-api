import {
    Injectable,
    CanActivate,
    ExecutionContext,
    UnauthorizedException,
} from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';

const ALLOWED_SERVICE_ACCOUNTS = [
    'zinovik-project@appspot.gserviceaccount.com',
];

@Injectable()
export class GoogleAuthGuard implements CanActivate {
    constructor() {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const authorizationHeader = request.headers['authorization'];

        if (!authorizationHeader) {
            throw new UnauthorizedException();
        }

        const [_, idToken] = authorizationHeader.split(' ');

        if (!idToken) {
            throw new UnauthorizedException();
        }

        let payload;

        try {
            const client = new OAuth2Client();
            const ticket = await client.verifyIdToken({ idToken });
            payload = ticket.getPayload();
        } catch {
            throw new UnauthorizedException();
        }

        if (!ALLOWED_SERVICE_ACCOUNTS.includes(payload?.email)) {
            throw new UnauthorizedException();
        }

        console.log(payload.email);

        return true;
    }
}
