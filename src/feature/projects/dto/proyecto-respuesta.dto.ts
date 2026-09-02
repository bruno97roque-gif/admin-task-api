import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  EstadoProyecto,
  Grupo,
  HitoCobro,
  Tecnologia,
  TipoProyecto,
  TipoRecordatorio,
} from '../../../lib/generated/prisma/client';

/**
 * Clases de documentación: describen lo que devuelve `ProjectsService`, pero no
 * se instancian en tiempo de ejecución (las respuestas salen directo de Prisma
 * pasadas por `aplanar()`). Si cambia el `proyectoInclude` del servicio o el
 * schema, hay que tocarlas acá también.
 */
export class UsuarioResumenDto {
  @ApiProperty({ example: 4 })
  id: number;

  @ApiProperty({ example: 'Aaron Jauregui' })
  name: string;

  @ApiProperty({ example: 'aaron' })
  user: string;

  @ApiProperty({ example: 1 })
  roleId: number;
}

export class SeguimientoResumenDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ description: 'La acción de hoy.', example: 'Llamar' })
  name: string;
}

export class CobroDto {
  @ApiProperty({ example: 12 })
  id: number;

  @ApiProperty({ example: 3 })
  proyectoId: number;

  @ApiProperty({ enum: HitoCobro, enumName: 'HitoCobro' })
  hito: HitoCobro;

  @ApiProperty({ description: 'Porcentaje del total.', example: 50 })
  porcentaje: number;

  @ApiProperty({ example: true })
  cobrado: boolean;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  fechaCobro: Date | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;
}

export class RecordatorioProyectoDto {
  @ApiProperty({ example: 8 })
  id: number;

  @ApiProperty({ example: 3 })
  proyectoId: number;

  @ApiProperty({
    description: 'Cuál de los cinco recordatorios del flujo.',
    enum: TipoRecordatorio,
    enumName: 'TipoRecordatorio',
  })
  tipo: TipoRecordatorio;

  @ApiProperty({
    description:
      'Nulo mientras el bloqueo siga vigente. Un recordatorio abierto es lo que define «el proyecto está esperando al cliente».',
    nullable: true,
    type: String,
    format: 'date-time',
  })
  resueltoAt: Date | null;

  @ApiProperty({
    description: 'Quién lo abrió o lo cerró.',
    nullable: true,
    type: Number,
  })
  usuarioId: number | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;

  @ApiPropertyOptional({
    description: 'Solo viene en `GET /projects/:id/recordatorios`.',
    type: UsuarioResumenDto,
    nullable: true,
  })
  usuario?: UsuarioResumenDto | null;
}

export class CotizacionAdicionalDto {
  @ApiProperty({ example: 2 })
  id: number;

  @ApiProperty({ example: 3 })
  proyectoId: number;

  @ApiProperty({
    description:
      'Por qué se generó: rondas agotadas u observación fuera del alcance.',
    example: 'Ronda de cambios 3 (las 2 incluidas ya estaban usadas)',
  })
  motivo: string;

  @ApiProperty({
    description: 'Arranca en `false` para que administración la persiga.',
    example: false,
  })
  aprobada: boolean;

  @ApiProperty({ example: false })
  cobrada: boolean;

  @ApiProperty({ nullable: true, type: Number })
  usuarioId: number | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;
}

export class ProyectoRespuestaDto {
  @ApiProperty({ example: 3 })
  id: number;

  @ApiProperty({ example: 'Panadería La Espiga' })
  name: string;

  @ApiProperty({
    description: 'Texto libre heredado de la planilla.',
    example: '50%',
  })
  estadoPago: string;

  @ApiProperty({
    description: 'Etapa actual del pipeline.',
    enum: EstadoProyecto,
    enumName: 'EstadoProyecto',
  })
  estadoProyecto: EstadoProyecto;

  @ApiProperty({ example: 'Tienda online con catálogo de 120 productos.' })
  descripcion: string;

  @ApiProperty({
    enum: Tecnologia,
    enumName: 'Tecnologia',
    nullable: true,
  })
  tecnologia: Tecnologia | null;

  @ApiProperty({
    enum: TipoProyecto,
    enumName: 'TipoProyecto',
    nullable: true,
  })
  tipoProyecto: TipoProyecto | null;

  @ApiProperty({
    description:
      'A produce, B espera material del cliente, C no pagó / sin hosting / no responde. Derivado, no elegido.',
    enum: Grupo,
    enumName: 'Grupo',
  })
  grupo: Grupo;

  @ApiProperty({ example: 1 })
  seguimientoId: number;

  @ApiProperty({
    example: 'El cliente prefiere que lo llamemos después de las 15h.',
  })
  comentario: string;

  @ApiProperty({
    description: 'El valor que carga administración a mano.',
    nullable: true,
    type: String,
    example: '3',
  })
  diasSinResponder: string | null;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  fechaEntrega: Date | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;

  @ApiProperty({
    description:
      'Marca de borrado lógico. Las consultas solo traen los que la tienen en `null`.',
    nullable: true,
    type: String,
    format: 'date-time',
  })
  deletedAt: Date | null;

  @ApiProperty({
    description: 'Logo y fotos. Frena el diseño.',
    example: false,
  })
  materialMarcaRecibido: boolean;

  @ApiProperty({
    description: 'Solo frena la carga de productos, no el desarrollo.',
    example: false,
  })
  catalogoRecibido: boolean;

  @ApiProperty({
    description:
      'Rondas de cambios de diseño ya consumidas, contra las 2 incluidas.',
    example: 1,
  })
  rondasCambiosUsadas: number;

  @ApiProperty({
    description:
      'Frena la subida a producción y manda al Grupo C mientras falte.',
    example: false,
  })
  hostingContratado: boolean;

  @ApiProperty({
    description:
      'Revisión del desarrollador. No bloquea: se registra para auditar.',
    nullable: true,
    type: String,
    format: 'date-time',
  })
  factibilidadRevisadaAt: Date | null;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  disenoAprobadoAt: Date | null;

  @ApiProperty({ example: false })
  productosCargados: boolean;

  @ApiProperty({
    description:
      'Se limpia si el cliente hace observaciones dentro del alcance.',
    nullable: true,
    type: String,
    format: 'date-time',
  })
  presentadoAt: Date | null;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  subidoProduccionAt: Date | null;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  capacitacionAt: Date | null;

  @ApiProperty({
    description:
      'Se reinicia en cada cambio de etapa. De acá sale el contador de los 3 meses para archivar.',
    nullable: true,
    type: String,
    format: 'date-time',
  })
  fechaUltimoCambioEstado: Date | null;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  archivadoAt: Date | null;

  @ApiProperty({ nullable: true, type: Number, example: 4 })
  disenadorId: number | null;

  @ApiProperty({ nullable: true, type: Number, example: 7 })
  desarrolladorId: number | null;

  @ApiProperty({ type: SeguimientoResumenDto })
  seguimiento: SeguimientoResumenDto;

  @ApiProperty({
    description:
      'Los enganchados por la tabla de asignación, ya aplanados. No incluye al diseñador ni al desarrollador del registro salvo que también estén asignados.',
    type: UsuarioResumenDto,
    isArray: true,
  })
  usuarios: UsuarioResumenDto[];

  @ApiProperty({ type: UsuarioResumenDto, nullable: true })
  disenador: UsuarioResumenDto | null;

  @ApiProperty({ type: UsuarioResumenDto, nullable: true })
  desarrollador: UsuarioResumenDto | null;

  @ApiProperty({
    description: 'Los tres hitos, si el proyecto tiene plan de cobros cargado.',
    type: CobroDto,
    isArray: true,
  })
  cobros: CobroDto[];

  @ApiProperty({
    description:
      'Solo los **abiertos**, y como mucho uno. Los resueltos salen por `GET /projects/:id/recordatorios`.',
    type: RecordatorioProyectoDto,
    isArray: true,
  })
  recordatorios: RecordatorioProyectoDto[];

  @ApiProperty({ type: CotizacionAdicionalDto, isArray: true })
  cotizaciones: CotizacionAdicionalDto[];

  @ApiProperty({
    description:
      'Calculado, no guardado: Grupo B o C siempre es `administracion`; en Grupo A sale de la etapa.',
    enum: ['administracion', 'disenador', 'desarrollador'],
    example: 'disenador',
  })
  responsable: string;

  @ApiProperty({
    description:
      'Días desde que se abrió el recordatorio pendiente más viejo. `null` si la pelota está en Websy. Es el contador automático, distinto de `diasSinResponder`.',
    nullable: true,
    type: Number,
    example: 12,
  })
  diasEsperandoAlCliente: number | null;
}

export class ProyectoArchivadoDto extends ProyectoRespuestaDto {
  @ApiProperty({
    description:
      'Etapa en la que estaba justo antes de archivarse (leída del historial). `null` si no hay fila de historial para reconstruirla.',
    enum: EstadoProyecto,
    enumName: 'EstadoProyecto',
    nullable: true,
  })
  etapaAlArchivar: EstadoProyecto | null;
}

export class HistorialEtapaDto {
  @ApiProperty({ example: 41 })
  id: number;

  @ApiProperty({ example: 3 })
  proyectoId: number;

  @ApiProperty({
    enum: EstadoProyecto,
    enumName: 'EstadoProyecto',
    nullable: true,
  })
  estadoAnterior: EstadoProyecto | null;

  @ApiProperty({ enum: EstadoProyecto, enumName: 'EstadoProyecto' })
  estadoNuevo: EstadoProyecto;

  @ApiProperty({ enum: Grupo, enumName: 'Grupo', nullable: true })
  grupoAnterior: Grupo | null;

  @ApiProperty({ enum: Grupo, enumName: 'Grupo' })
  grupoNuevo: Grupo;

  @ApiProperty({
    description: 'La nota que se mandó en la acción.',
    nullable: true,
    type: String,
    example: 'El cliente confirmó por WhatsApp',
  })
  motivo: string | null;

  @ApiProperty({
    description:
      'Quién lo movió. Queda en `null` si después se borra el usuario.',
    nullable: true,
    type: Number,
  })
  usuarioId: number | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: UsuarioResumenDto, nullable: true })
  usuario: UsuarioResumenDto | null;
}

export class ResumenRondasDto {
  @ApiProperty({ description: 'Rondas consumidas contando esta.', example: 3 })
  rondasUsadas: number;

  @ApiProperty({
    description: 'Las que entran en el precio cerrado.',
    example: 2,
  })
  rondasIncluidas: number;

  @ApiProperty({
    description:
      'Se agotaron las incluidas. **No bloquea nada**: queda una fila en cotizaciones y el caso se maneja internamente.',
    example: true,
  })
  requiereCotizacionAdicional: boolean;

  @ApiProperty({ type: ProyectoRespuestaDto })
  proyecto: ProyectoRespuestaDto;
}

export class ResumenReactivacionDto {
  @ApiProperty({
    description: '25% si volvió antes del año, 50% si llegó al año o lo pasó.',
    example: 25,
  })
  porcentajeAReactivar: number;

  @ApiProperty({ description: 'Cuánto estuvo archivado.', example: 120 })
  diasArchivado: number;

  @ApiProperty({
    description:
      'Con 50% se rehacen inicio y diseño, y el proyecto vuelve a `Brief`.',
    example: false,
  })
  seRehaceInicioYDiseno: boolean;

  @ApiProperty({ type: ProyectoRespuestaDto })
  proyecto: ProyectoRespuestaDto;
}

// ---------------------------------------------------------------------------
// Analítica
// ---------------------------------------------------------------------------

export class AnaliticaMesDto {
  @ApiProperty({
    description: 'Año y mes, formato `YYYY-MM`.',
    example: '2026-09',
  })
  mes: string;

  @ApiProperty({
    description:
      'Proyectos que llegaron a `DisenoFinalizado` por primera vez en este mes.',
    example: 3,
  })
  disenosFinalizados: number;

  @ApiProperty({
    description:
      'Proyectos que llegaron a `DesarrolloFinalizado` por primera vez en este mes.',
    example: 2,
  })
  desarrollosFinalizados: number;
}

export class AnaliticaPersonaMesDto {
  @ApiProperty({ example: 11 })
  usuarioId: number;

  @ApiProperty({ example: 'Aaron Jauregui' })
  nombre: string;

  @ApiProperty({
    description: 'Año y mes, formato `YYYY-MM`.',
    example: '2026-09',
  })
  mes: string;

  @ApiProperty({ example: 2 })
  cantidad: number;
}

export class AnaliticaProyectoDuracionDto {
  @ApiProperty({ example: 62 })
  proyectoId: number;

  @ApiProperty({ example: '062 - I&N Caprimoda' })
  nombre: string;

  @ApiProperty({
    description:
      'Días corridos desde la primera entrada a la etapa hasta que la cerró.',
    example: 14,
  })
  dias: number;
}

export class AnaliticaDuracionDto {
  @ApiProperty({ enum: ['Diseno', 'Desarrollo'], example: 'Diseno' })
  etapa: 'Diseno' | 'Desarrollo';

  @ApiProperty({
    description:
      'Promedio de días entre la primera entrada a la etapa y la primera vez que llegó a su cierre. Solo cuenta proyectos con ambas marcas de tiempo registradas.',
    example: 12.4,
  })
  promedioDias: number;

  @ApiProperty({
    description: 'Cuántos proyectos entraron en el promedio.',
    example: 8,
  })
  cantidadProyectos: number;

  @ApiProperty({ type: AnaliticaProyectoDuracionDto, isArray: true })
  proyectos: AnaliticaProyectoDuracionDto[];
}

export class AnaliticaRespuestaDto {
  @ApiProperty({
    description:
      'Solo mide lo que pasó desde que existe el estado `DesarrolloFinalizado`/`historial_etapas`: los proyectos que ya habían cerrado esas etapas antes no quedan registrados.',
    type: AnaliticaMesDto,
    isArray: true,
  })
  porMes: AnaliticaMesDto[];

  @ApiProperty({ type: AnaliticaPersonaMesDto, isArray: true })
  disenadoresPorMes: AnaliticaPersonaMesDto[];

  @ApiProperty({ type: AnaliticaPersonaMesDto, isArray: true })
  desarrolladoresPorMes: AnaliticaPersonaMesDto[];

  @ApiProperty({ type: AnaliticaDuracionDto, isArray: true })
  duracionPromedio: AnaliticaDuracionDto[];
}
