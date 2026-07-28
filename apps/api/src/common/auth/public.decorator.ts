import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:public';

/** Marks an endpoint as exempt from the global JWT guard (register, login, refresh, forgot-password). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
