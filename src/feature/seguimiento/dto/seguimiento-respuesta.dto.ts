import { ApiProperty } from '@nestjs/swagger';

/** Solo documentación. */
export class SeguimientoRespuestaDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ description: 'Acción de hoy.', example: 'Llamar' })
  name: string;

  @ApiProperty({
    description:
      'Código estable, pensado para automatizaciones que no pueden depender del nombre. Hoy no lo escribe ni lo lee ninguna ruta.',
    example: null,
    nullable: true,
    type: String,
  })
  codigo: string | null;
}
