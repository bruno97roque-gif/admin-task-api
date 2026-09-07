import { ApiProperty } from '@nestjs/swagger';
import { TipoNotificacion } from '../../../lib/generated/prisma/client';

class ProyectoResumenDto {
  @ApiProperty({ example: 12 })
  id: number;

  @ApiProperty({ example: 'Tienda Don Pepe' })
  name: string;
}

/** Solo documentación. */
export class NotificacionRespuestaDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ description: 'Destinatario.', example: 4 })
  usuarioId: number;

  @ApiProperty({
    enum: TipoNotificacion,
    example: TipoNotificacion.ProyectoAsignado,
  })
  tipo: TipoNotificacion;

  @ApiProperty({ example: 'Se te asignó un nuevo proyecto' })
  titulo: string;

  @ApiProperty({
    example:
      'Tienda Don Pepe pasó a Diseño y sos el diseñador asignado. Por favor verificá.',
  })
  mensaje: string;

  @ApiProperty({ nullable: true, example: 12 })
  proyectoId: number | null;

  @ApiProperty({ type: ProyectoResumenDto, nullable: true })
  proyecto: ProyectoResumenDto | null;

  @ApiProperty({
    description: 'Nulo mientras no se haya leído.',
    nullable: true,
    example: null,
  })
  leidaAt: Date | null;

  @ApiProperty({ example: '2026-09-07T15:00:00.000Z' })
  createdAt: Date;
}

/** Solo documentación. */
export class BandejaRespuestaDto {
  @ApiProperty({ description: 'Cuántas faltan leer.', example: 3 })
  noLeidas: number;

  @ApiProperty({
    type: NotificacionRespuestaDto,
    isArray: true,
    description: 'Las últimas 50, más nuevas primero.',
  })
  notificaciones: NotificacionRespuestaDto[];
}
