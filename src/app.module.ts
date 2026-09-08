import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { LibModule } from './lib/lib.module';
import { RolModule } from './feature/rol/rol.module';
import { UserModule } from './feature/user/user.module';
import { AuthModule } from './feature/auth/auth.module';
import { SeguimientoModule } from './feature/seguimiento/seguimiento.module';
import { ProjectsModule } from './feature/projects/projects.module';
import { NotificacionesModule } from './feature/notificaciones/notificaciones.module';
import { ReunionesModule } from './feature/reuniones/reuniones.module';
import { NotasModule } from './feature/notas/notas.module';
import { JwtAuthGuard } from './feature/auth/guards/jwt-auth.guard';
import { RolesGuard } from './feature/auth/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Habilita los @Cron: hoy, el aviso previo de las reuniones.
    ScheduleModule.forRoot(),
    LibModule,
    RolModule,
    UserModule,
    AuthModule,
    SeguimientoModule,
    ProjectsModule,
    NotificacionesModule,
    ReunionesModule,
    NotasModule,
  ],
  // El orden importa: JwtAuthGuard deja el payload en request.usuario y
  // RolesGuard lo lee. Invertidos, RolesGuard no encontraría el rol.
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
