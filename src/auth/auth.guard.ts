import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SHOULD_SKIP_AUTH_GUARD_KEY } from '../common/skip-auth-guard.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(private reflector: Reflector) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const shouldSkipAuthGuardKey =
            this.reflector.getAllAndOverride<boolean>(
                SHOULD_SKIP_AUTH_GUARD_KEY,
                [context.getHandler(), context.getClass()]
            );

        if (shouldSkipAuthGuardKey) {
            return true;
        }

        const request = context.switchToHttp().getRequest();

        return Boolean(request['user']);
    }
}
