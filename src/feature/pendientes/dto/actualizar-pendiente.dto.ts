import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CrearPendienteDto } from './crear-pendiente.dto';

export class ActualizarPendienteDto extends PartialType(CrearPendienteDto) {
  @ApiPropertyOptional({ description: 'Marcarlo hecho o volver a abrirlo.' })
  @IsOptional()
  @IsBoolean()
  hecho?: boolean;
}
