import { Module } from '@nestjs/common';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { ComunicadosController } from './comunicados.controller';
import { ComunicadosService } from './comunicados.service';

@Module({
  imports: [NotificacionesModule],
  controllers: [ComunicadosController],
  providers: [ComunicadosService],
})
export class ComunicadosModule {}
