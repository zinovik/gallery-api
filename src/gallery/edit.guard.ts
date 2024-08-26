import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class GalleryGuard implements CanActivate {
    constructor() {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();

        return request['user'].isEditAccess;
    }
}
