import { Module } from '@nestjs/common';
import { PendientesController } from './pendientes.controller';
import { PendientesService } from './pendientes.service';

@Module({
  controllers: [PendientesController],
  providers: [PendientesService],
})
export class PendientesModule {}
