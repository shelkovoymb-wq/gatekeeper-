import { Global, Module } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { SecretBox } from './crypto.js';

export const SECRET_BOX = Symbol('SECRET_BOX');

@Global()
@Module({
  providers: [
    {
      provide: SECRET_BOX,
      useFactory: (env: Env) => new SecretBox(env.SECRET_ENCRYPTION_KEY),
      inject: [ENV],
    },
  ],
  exports: [SECRET_BOX],
})
export class CryptoModule {}
