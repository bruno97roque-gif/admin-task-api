import { ApiProperty } from '@nestjs/swagger';

class UsuarioResumenDto {
  @ApiProperty({ example: 4 })
  id: number;

  @ApiProperty({ example: 'Ana Pérez' })
  name: string;

  @ApiProperty({ example: 'ana' })
  user: string;

  @ApiProperty({ example: 3 })
  roleId: number;
}

class ProyectoResumenDto {
  @ApiProperty({ example: 12 })
  id: number;

  @ApiProperty({ example: 'Tienda Don Pepe' })
  name: string;
}

/** Solo documentación. */
export class NotaRespuestaDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 12 })
  proyectoId: number;

  @ApiProperty({ type: ProyectoResumenDto })
  proyecto: ProyectoResumenDto;

  @ApiProperty({ nullable: true, example: 4 })
  autorId: number | null;

  @ApiProperty({ type: UsuarioResumenDto, nullable: true })
  autor: UsuarioResumenDto | null;

  @ApiProperty({
    example:
      'El cliente pidió cambiar el logo del header, ¿lo cotizamos aparte?',
  })
  contenido: string;

  @ApiProperty({
    description: 'Nulo mientras administración no la haya leído.',
    nullable: true,
    example: null,
  })
  leidaAt: Date | null;

  @ApiProperty({ example: '2026-09-07T15:00:00.000Z' })
  createdAt: Date;
}
