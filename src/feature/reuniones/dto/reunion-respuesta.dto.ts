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

  @ApiProperty({
    description: 'Correo corporativo, para armar la invitación de calendario.',
    example: 'ana@websydev.site',
    nullable: true,
  })
  email: string | null;
}

class ProyectoResumenDto {
  @ApiProperty({ example: 12 })
  id: number;

  @ApiProperty({ example: 'Tienda Don Pepe' })
  name: string;
}

/** Solo documentación. */
export class ReunionRespuestaDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Presentación de avance de diseño' })
  titulo: string;

  @ApiProperty({
    nullable: true,
    example: 'Mostrar las dos propuestas de home.',
  })
  descripcion: string | null;

  @ApiProperty({ example: '2026-09-10T15:00:00.000Z' })
  fecha: Date;

  @ApiProperty({
    example: 'https://meet.google.com/abc-defg-hij',
    description: 'Cadena vacía mientras no haya link.',
  })
  linkMeet: string;

  @ApiProperty({
    example: true,
    description: 'Si el Meet arranca grabando y transcribiendo.',
  })
  grabarReunion: boolean;

  @ApiProperty({
    type: [String],
    example: ['cliente@empresa.com'],
    description:
      'Correos de afuera del sistema que se suman a la invitación de Google Calendar.',
  })
  invitadosExternos: string[];

  @ApiProperty({
    nullable: true,
    example: 'abc123def456',
    description:
      'Id del evento en Google Calendar. `null` mientras no se haya enviado.',
  })
  googleEventId: string | null;

  @ApiProperty({
    nullable: true,
    example: '2026-09-09T15:00:00.000Z',
    description: 'Cuándo administración la envió a Google Calendar.',
  })
  enviadaAt: Date | null;

  @ApiProperty({ nullable: true, example: 12 })
  proyectoId: number | null;

  @ApiProperty({ type: ProyectoResumenDto, nullable: true })
  proyecto: ProyectoResumenDto | null;

  @ApiProperty({ nullable: true, example: 1 })
  creadorId: number | null;

  @ApiProperty({ type: UsuarioResumenDto, nullable: true })
  creador: UsuarioResumenDto | null;

  @ApiProperty({
    type: UsuarioResumenDto,
    isArray: true,
    description: 'Convocados, ya aplanados (sin la fila del join).',
  })
  participantes: UsuarioResumenDto[];

  @ApiProperty({ example: '2026-09-07T15:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-09-07T15:00:00.000Z' })
  updatedAt: Date;
}
