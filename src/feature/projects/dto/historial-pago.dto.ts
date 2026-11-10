import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Registra un pago: cambia `estadoPago` del proyecto y deja la fila. */
export class CrearHistorialPagoDto {
  @ApiProperty({
    description: 'El nuevo estado de pago, texto libre como en el proyecto.',
    example: '80%',
    maxLength: 20,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  estadoPago: string;

  @ApiPropertyOptional({
    description: 'Detalle del pago (medio, número de operación, etc.).',
    example: 'Transferencia BCP, op. 123456',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  nota?: string;
}

/** Solo la nota se corrige: los valores son la traza y no se reescriben. */
export class EditarHistorialPagoDto {
  @ApiProperty({
    description: 'Nota del pago. `null` la borra.',
    example: 'Transferencia BCP, op. 123456',
    maxLength: 500,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  nota: string | null;
}

export class HistorialPagoDto {
  @ApiProperty({ example: 12 })
  id: number;

  @ApiProperty({ example: 3 })
  proyectoId: number;

  @ApiProperty({
    description: '`null` en la fila del alta del proyecto.',
    example: '50%',
    nullable: true,
    type: String,
  })
  estadoAnterior: string | null;

  @ApiProperty({ example: '80%' })
  estadoNuevo: string;

  @ApiProperty({
    nullable: true,
    type: String,
    example: 'Transferencia BCP, op. 123456',
  })
  nota: string | null;

  @ApiProperty({
    description: 'Quién lo cambió. `null` si después se borra el usuario.',
    nullable: true,
    type: Number,
  })
  usuarioId: number | null;

  @ApiProperty({
    description: 'El usuario que lo cambió (`id`, `name`, `user`).',
    nullable: true,
    example: { id: 2, name: 'Carlos', user: 'carlos' },
  })
  usuario: { id: number; name: string; user: string } | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;
}
