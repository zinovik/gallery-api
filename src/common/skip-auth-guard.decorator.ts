import { SetMetadata } from '@nestjs/common';

export const SHOULD_SKIP_AUTH_GUARD_KEY = Symbol();
export const SkipAuthGuard = () =>
    SetMetadata(SHOULD_SKIP_AUTH_GUARD_KEY, true);
