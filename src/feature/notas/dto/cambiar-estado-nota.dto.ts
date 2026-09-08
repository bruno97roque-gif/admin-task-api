import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { EstadoNota } from '../../../lib/generated/prisma/client';

export class CambiarEstadoNotaDto {
  @ApiProperty({
    description:
      'En qué va el ticket. Sacarlo de `Pendiente` cuenta como haberlo visto.',
    enum: EstadoNota,
    enumName: 'EstadoNota',
    example: EstadoNota.EnCurso,
  })
  @IsEnum(EstadoNota)
  estado: EstadoNota;
}
