import { Module } from '@nestjs/common';
import { ReunionesService } from './reuniones.service';
import { ReunionesController } from './reuniones.controller';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { GoogleModule } from '../google/google.module';

@Module({
  imports: [NotificacionesModule, GoogleModule],
  controllers: [ReunionesController],
  providers: [ReunionesService],
})
export class ReunionesModule {}
