import { ApiProperty } from '@nestjs/swagger';
import {
  CategoriaNota,
  EstadoNota,
} from '../../../lib/generated/prisma/client';

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

/** Una página de la bandeja. Solo documentación. */
export class PaginaNotasRespuestaDto {
  @ApiProperty({ type: () => NotaRespuestaDto, isArray: true })
  items: NotaRespuestaDto[];

  @ApiProperty({
    description:
      'Total de tickets que cumplen el filtro, no solo los de esta página.',
    example: 42,
  })
  total: number;

  @ApiProperty({ example: 1 })
  pagina: number;

  @ApiProperty({ example: 10 })
  porPagina: number;
}

/** Un mensaje del hilo. Solo documentación. */
export class RespuestaNotaDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ nullable: true, example: 4 })
  autorId: number | null;

  @ApiProperty({ type: UsuarioResumenDto, nullable: true })
  autor: UsuarioResumenDto | null;

  @ApiProperty({ example: 'Va dentro del alcance, cambiá el logo.' })
  contenido: string;

  @ApiProperty({ example: '2026-09-08T15:00:00.000Z' })
  createdAt: Date;
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
    description: 'En qué va el ticket.',
    enum: EstadoNota,
    enumName: 'EstadoNota',
    example: EstadoNota.Pendiente,
  })
  estado: EstadoNota;

  @ApiProperty({
    description: 'De qué trata. Las notas anteriores a los tickets son `Otro`.',
    enum: CategoriaNota,
    enumName: 'CategoriaNota',
    example: CategoriaNota.Consulta,
  })
  categoria: CategoriaNota;

  @ApiProperty({
    description: 'Última vez que alguien escribió en el hilo.',
    nullable: true,
    example: null,
  })
  ultimaRespuestaAt: Date | null;

  @ApiProperty({
    type: RespuestaNotaDto,
    isArray: true,
    description: 'El hilo, del más viejo al más nuevo.',
  })
  respuestas: RespuestaNotaDto[];

  @ApiProperty({
    description: 'Nulo mientras administración no la haya leído.',
    nullable: true,
    example: null,
  })
  leidaAt: Date | null;

  @ApiProperty({ example: '2026-09-07T15:00:00.000Z' })
  createdAt: Date;
}
