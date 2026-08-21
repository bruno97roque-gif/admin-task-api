import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsISO8601, IsOptional } from 'class-validator';

export class MarcarCobroDto {
  @ApiProperty({
    description:
      '`true` marca el hito como cobrado; `false` lo revierte y vuelve a cerrar la compuerta que ese hito habilitaba.',
    example: true,
  })
  @IsBoolean()
  cobrado: boolean;

  // String ISO-8601: el ValidationPipe global no transforma, el servicio la
  // convierte a Date. Si se omite y `cobrado` es true, se usa la fecha de hoy.
  @ApiPropertyOptional({
    description:
      'Fecha del cobro en ISO-8601. Si se omite y `cobrado` es `true`, se usa la de hoy.',
    example: '2026-08-19',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsISO8601()
  fechaCobro?: string | null;
}
