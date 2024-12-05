import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';

const ALLOWED_SERVICE_ACCOUNTS = [
    'gallery@zinovik-project.iam.gserviceaccount.com',
    'storage-tools@zinovik-project.iam.gserviceaccount.com',
];

@Injectable()
export class GoogleAuthGuard implements CanActivate {
    constructor() {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const authorizationHeader = request.headers['authorization'];

        if (!authorizationHeader) {
            return false;
        }

        const [_, idToken] = authorizationHeader.split(' ');

        if (!idToken) {
            return false;
        }

        let payload;

        try {
            const client = new OAuth2Client();
            const ticket = await client.verifyIdToken({ idToken });
            payload = ticket.getPayload();
        } catch {
            return false;
        }

        if (!ALLOWED_SERVICE_ACCOUNTS.includes(payload?.email)) {
            return false;
        }

        request['user'] = payload;

        return true;
    }
}
