import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { Argon2Service } from '../../lib/argon2/argon2.service';
import { AuthController } from './auth.controller';
import { AUTH, crearAuth } from './better-auth';

/**
 * Global: el guard (registrado en `AppModule`) y `main.ts` necesitan la
 * instancia de better-auth.
 */
@Global()
@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: AUTH,
      inject: [PrismaService, Argon2Service],
      useFactory: (prisma: PrismaService, argon2: Argon2Service) =>
        crearAuth({ prisma, argon2, env: process.env }),
    },
  ],
  exports: [AUTH],
})
export class AuthModule {}
