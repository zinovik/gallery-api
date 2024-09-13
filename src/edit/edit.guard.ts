import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../common/public';
import { Reflector } from '@nestjs/core';

@Injectable()
export class EditGuard implements CanActivate {
    constructor(private reflector: Reflector) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const isPublic = this.reflector.getAllAndOverride<boolean>(
            IS_PUBLIC_KEY,
            [context.getHandler(), context.getClass()]
        );

        if (isPublic) return true;

        const request = context.switchToHttp().getRequest();

        return request['user']?.isEditAccess;
    }
}
