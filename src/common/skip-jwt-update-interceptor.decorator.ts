import { SetMetadata } from '@nestjs/common';

export const SHOULD_SKIP_JWT_UPDATE_INTERCEPTOR_KEY = Symbol();
export const SkipJwtUpdateInterceptor = () =>
    SetMetadata(SHOULD_SKIP_JWT_UPDATE_INTERCEPTOR_KEY, true);
