import { ApiProperty } from '@nestjs/swagger';

/** Solo documentación. */
export class RecordatorioRespuestaDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({
    description: 'Texto de la nota.',
    example: 'Pedirle al cliente las fotos de la sucursal nueva',
  })
  descripcion: string;

  @ApiProperty({ description: '¿Sigue pendiente?', example: true })
  estado: boolean;
}
