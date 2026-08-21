import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Marca si el cliente ya entregó lo que se le estaba esperando. Cada uno de
 * estos campos abre o cierra el recordatorio correspondiente y puede mover el
 * grupo del proyecto, por eso no se tocan con un `PATCH` genérico.
 */
export class BloqueoClienteDto {
  @ApiProperty({
    description:
      '`true` cuando el cliente ya entregó. Cada cambio recalcula el grupo y abre o cierra el recordatorio que corresponda.',
    example: true,
  })
  @IsBoolean()
  recibido: boolean;

  @ApiPropertyOptional({
    description: 'Nota para el historial.',
    example: 'Mandó el logo en SVG y las fotos de la sucursal',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}
