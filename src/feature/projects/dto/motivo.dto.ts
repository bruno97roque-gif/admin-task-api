import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Cuerpo compartido por las acciones que solo necesitan una nota para el
 * historial: archivar, reactivar y registrar una ronda de cambios.
 */
export class MotivoDto {
  @ApiPropertyOptional({
    description:
      'Nota que queda en la fila del historial, junto con quién hizo el cambio y cuándo.',
    example: 'El cliente confirmó por WhatsApp',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}
