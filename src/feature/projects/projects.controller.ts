import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Put,
  ParseIntPipe,
  ParseEnumPipe,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { AsignarUsuariosDto } from './dto/asignar-usuarios.dto';
import { AsignarResponsablesDto } from './dto/asignar-responsables.dto';
import { DefinirPlanCobrosDto } from './dto/plan-cobros.dto';
import { MarcarCobroDto } from './dto/marcar-cobro.dto';
import { MotivoDto } from './dto/motivo.dto';
import { ObservacionesDto } from './dto/observaciones.dto';
import { BloqueoClienteDto } from './dto/bloqueo-cliente.dto';
import {
  HistorialEtapaDto,
  ProyectoRespuestaDto,
  RecordatorioProyectoDto,
  ResumenReactivacionDto,
  ResumenRondasDto,
} from './dto/proyecto-respuesta.dto';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator';
import {
  Roles,
  ROLES_ADMINISTRACION,
} from '../auth/decorators/roles.decorator';
import { HitoCobro } from '../../lib/generated/prisma/client';
import { AUTH_BEARER, TAGS } from '../../swagger';

const PARAM_ID = {
  name: 'id',
  description: 'Id del proyecto.',
  example: 3,
} as const;

const NO_ENCONTRADO = {
  description: 'No existe ese proyecto, o está borrado.',
} as const;

/** Solo administración («Admin» u «Owner») entra a esta ruta. */
const SIN_PERMISO = {
  description: 'El rol no alcanza: la ruta es solo de administración.',
} as const;

@ApiBearerAuth(AUTH_BEARER)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @ApiTags(TAGS.proyectos)
  @ApiOperation({
    summary: 'Dar de alta un proyecto',
    description:
      'Nodo «Registro» del diagrama: crea el proyecto, asigna diseñador y desarrollador, y puede definir el plan de cobros y marcar el abono inicial en la misma llamada. Sin `estadoProyecto` arranca en `Registro`; si se pide una etapa más adelantada se verifican sus compuertas.',
  })
  @ApiCreatedResponse({ type: ProyectoRespuestaDto })
  @ApiBadRequestResponse({
    description:
      'El cuerpo está mal, o el seguimiento / los usuarios indicados no existen.',
  })
  @ApiConflictResponse({
    description:
      'El plan de cobros no cierra (no suma 100, o el abono inicial baja de 30 sin aprobación de jefatura), o la etapa pedida tiene compuertas sin cumplir.',
  })
  create(
    @Body() createProjectDto: CreateProjectDto,
    @UsuarioActual('sub') actorId: number,
  ) {
    return this.projectsService.create(createProjectDto, actorId);
  }

  @Get()
  @ApiTags(TAGS.proyectos)
  @ApiOperation({
    summary: 'Listar todos los proyectos',
    description: 'Sin filtrar por grupo ni por etapa. Excluye los borrados.',
  })
  @ApiOkResponse({ type: ProyectoRespuestaDto, isArray: true })
  findAll() {
    return this.projectsService.findAll();
  }

  // Las rutas con segmento fijo deben declararse antes de @Get(':id'), o
  // Express interpreta 'programador' / 'diseno' / 'admin' como un id de
  // proyecto. Cualquier ruta estática nueva va también arriba de :id.
  @Get('programador')
  @ApiTags(TAGS.proyectos)
  @ApiOperation({
    summary: 'Tablero de desarrollo',
    description:
      'Grupo A, sin los finalizados ni los archivados. Con `?id=` devuelve lo que la persona tiene asignado como `desarrolladorId` **o** por la tabla de asignación.',
  })
  @ApiQuery({
    name: 'id',
    required: false,
    description: 'Id del desarrollador. Sin esto devuelve el tablero completo.',
    example: 7,
  })
  @ApiOkResponse({ type: ProyectoRespuestaDto, isArray: true })
  findByProgramer(
    @Query('id', new ParseIntPipe({ optional: true }))
    idProgramador?: number,
  ) {
    return this.projectsService.findByProgramer(idProgramador);
  }

  @Get('diseno')
  @ApiTags(TAGS.proyectos)
  @ApiOperation({
    summary: 'Tablero de diseño',
    description:
      'Grupo A y el tramo de diseño **entero** (`Diseno`, `AvanceDiseno`, `DisenoFinalizado`). Con `?id=` filtra solo por `disenadorId`.',
  })
  @ApiQuery({
    name: 'id',
    required: false,
    description: 'Id del diseñador. Sin esto devuelve el tablero completo.',
    example: 4,
  })
  @ApiOkResponse({ type: ProyectoRespuestaDto, isArray: true })
  findByDiseno(
    @Query('id', new ParseIntPipe({ optional: true }))
    idDisenador?: number,
  ) {
    return this.projectsService.findByDiseno(idDisenador);
  }

  @Get('admin')
  @ApiTags(TAGS.proyectos)
  @ApiOperation({
    summary: 'Cola de administración',
    description:
      'Grupos B y C, o sea todo lo que **no** está en producción: falta plata, hosting o material del cliente. Incluye los finalizados a propósito; deja afuera los archivados, que ya no se persiguen.',
  })
  @ApiOkResponse({ type: ProyectoRespuestaDto, isArray: true })
  findByAdmin() {
    return this.projectsService.findByAdmin();
  }

  @Get('archivados')
  @ApiTags(TAGS.proyectos)
  @ApiOperation({
    summary: 'Listar los archivados',
    description:
      'Van aparte para que no ensucien la métrica: `Archivado` es distinto de `Proyecto Finalizado`.',
  })
  @ApiOkResponse({ type: ProyectoRespuestaDto, isArray: true })
  findArchivados() {
    return this.projectsService.findArchivados();
  }

  /** Los que ya cumplieron los 3 meses sin moverse y toca archivar. */
  @Get('por-archivar')
  @ApiTags(TAGS.flujo)
  @ApiOperation({
    summary: 'Candidatos a archivar',
    description:
      'Los que llevan 90 días o más con un recordatorio abierto. La API **no archiva sola**: esto deja la lista y `POST /projects/:id/archivar` ejecuta.',
  })
  @ApiOkResponse({ type: ProyectoRespuestaDto, isArray: true })
  findPorArchivar() {
    return this.projectsService.findPorArchivar();
  }

  @Get(':id')
  @ApiTags(TAGS.proyectos)
  @ApiOperation({ summary: 'Ver un proyecto' })
  @ApiParam(PARAM_ID)
  @ApiOkResponse({ type: ProyectoRespuestaDto })
  @ApiNotFoundResponse(NO_ENCONTRADO)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.projectsService.findOne(id);
  }

  @Get(':id/historial')
  @ApiTags(TAGS.flujo)
  @ApiOperation({
    summary: 'Historial de cambios',
    description:
      'Cada cambio de etapa, grupo, bloqueo, hito o plan de cobros, ascendente y con quién lo hizo. No es solo auditoría: de acá lee `reactivar()` para saber a qué etapa volver.',
  })
  @ApiParam(PARAM_ID)
  @ApiOkResponse({ type: HistorialEtapaDto, isArray: true })
  @ApiNotFoundResponse(NO_ENCONTRADO)
  findHistorial(@Param('id', ParseIntPipe) id: number) {
    return this.projectsService.findHistorial(id);
  }

  /** Los cinco recordatorios del flujo, abiertos y ya resueltos. */
  @Get(':id/recordatorios')
  @ApiTags(TAGS.flujo)
  @ApiOperation({
    summary: 'Recordatorios del proyecto',
    description:
      'Los cinco del flujo, abiertos **y** resueltos. El proyecto en sí solo trae los abiertos.',
  })
  @ApiParam(PARAM_ID)
  @ApiOkResponse({ type: RecordatorioProyectoDto, isArray: true })
  @ApiNotFoundResponse(NO_ENCONTRADO)
  findRecordatorios(@Param('id', ParseIntPipe) id: number) {
    return this.projectsService.findRecordatorios(id);
  }

  @Patch(':id')
  @ApiTags(TAGS.proyectos)
  @ApiOperation({
    summary: 'Modificar un proyecto',
    description:
      'El único camino que valida la máquina de estados: se avanza de a una etapa, se puede retroceder, no se puede saltear. `Archivado` no se entra ni se sale por acá. Omitir una clave la deja como está; mandarla en `null` la limpia. Mandar `usuariosIds` **reemplaza** la lista entera.',
  })
  @ApiParam(PARAM_ID)
  @ApiOkResponse({ type: ProyectoRespuestaDto })
  @ApiBadRequestResponse({
    description:
      'El cuerpo está mal, o el seguimiento / los usuarios no existen.',
  })
  @ApiNotFoundResponse(NO_ENCONTRADO)
  @ApiConflictResponse({
    description:
      'La transición no es válida (saltea etapas, o intenta entrar o salir de `Archivado`), o la etapa destino tiene compuertas sin cumplir.',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProjectDto: UpdateProjectDto,
    @UsuarioActual('sub') actorId: number,
  ) {
    return this.projectsService.update(id, updateProjectDto, actorId);
  }

  // El plan de cobros y los hitos los carga administración a mano: el resto
  // del equipo no toca dinero. Igual que archivar y reactivar.
  @Roles(...ROLES_ADMINISTRACION)
  @Put(':id/plan-cobros')
  @ApiTags(TAGS.cobros)
  @ApiOperation({
    summary: 'Definir o redefinir el plan de cobros',
    description:
      'Los tres hitos de una. Es un `upsert`: lo que ya estaba cobrado se respeta, solo cambia el porcentaje. Recalcula el grupo al terminar.',
  })
  @ApiParam(PARAM_ID)
  @ApiOkResponse({ type: ProyectoRespuestaDto })
  @ApiForbiddenResponse(SIN_PERMISO)
  @ApiNotFoundResponse(NO_ENCONTRADO)
  @ApiConflictResponse({
    description:
      'Faltan hitos, los porcentajes no suman 100, o el abono inicial baja de 30 sin `aprobadoPorJefatura`.',
  })
  definirPlanDeCobros(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DefinirPlanCobrosDto,
    @UsuarioActual('sub') actorId: number,
  ) {
    return this.projectsService.definirPlanDeCobros(id, dto, actorId);
  }

  @Roles(...ROLES_ADMINISTRACION)
  @Patch(':id/cobros/:hito')
  @ApiTags(TAGS.cobros)
  @ApiOperation({
    summary: 'Marcar un hito como cobrado (o revertirlo)',
    description:
      'Cada hito abre la compuerta de una etapa: `AbonoInicial` el brief, `AprobacionDiseno` el desarrollo, `Entrega` el cierre. Recalcula el grupo.',
  })
  @ApiParam(PARAM_ID)
  @ApiParam({
    name: 'hito',
    description: 'Cuál de los tres momentos de cobro.',
    enum: HitoCobro,
    enumName: 'HitoCobro',
  })
  @ApiOkResponse({ type: ProyectoRespuestaDto })
  @ApiBadRequestResponse({ description: 'El `:hito` de la URL no es válido.' })
  @ApiForbiddenResponse(SIN_PERMISO)
  @ApiNotFoundResponse({
    description:
      'No existe el proyecto, o no tiene ese hito en su plan de cobros.',
  })
  marcarCobro(
    @Param('id', ParseIntPipe) id: number,
    @Param('hito', new ParseEnumPipe(HitoCobro)) hito: HitoCobro,
    @Body() dto: MarcarCobroDto,
    @UsuarioActual('sub') actorId: number,
  ) {
    return this.projectsService.marcarCobro(id, hito, dto, actorId);
  }

  // --- Bloqueos del cliente (nodos A6, C1, B11) ---------------------------

  /** Material de marca: logo y fotos. Frena el paso a diseño. */
  @Patch(':id/material-marca')
  @ApiTags(TAGS.flujo)
  @ApiOperation({
    summary: 'Material de marca recibido',
    description:
      'Logo y fotos de banners y secciones. Destraba las tres etapas de diseño y saca al proyecto del Grupo B.',
  })
  @ApiParam(PARAM_ID)
  @ApiOkResponse({ type: ProyectoRespuestaDto })
  @ApiNotFoundResponse(NO_ENCONTRADO)
  marcarMaterialDeMarca(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: BloqueoClienteDto,
    @UsuarioActual('sub') actorId: number,
  ) {
    return this.projectsService.marcarMaterialDeMarca(
      id,
      dto.recibido,
      dto.motivo,
      actorId,
    );
  }

  /** Catálogo de productos: solo frena la carga, no el desarrollo. */
  @Patch(':id/catalogo')
  @ApiTags(TAGS.flujo)
  @ApiOperation({
    summary: 'Catálogo de productos recibido',
    description:
      'Solo e-commerce. Destraba la carga de productos; el desarrollo nunca se detuvo por esto, así que el proyecto sigue en Grupo A.',
  })
  @ApiParam(PARAM_ID)
  @ApiOkResponse({ type: ProyectoRespuestaDto })
  @ApiNotFoundResponse(NO_ENCONTRADO)
  @ApiConflictResponse({ description: 'El proyecto no es e-commerce.' })
  marcarCatalogo(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: BloqueoClienteDto,
    @UsuarioActual('sub') actorId: number,
  ) {
    return this.projectsService.marcarCatalogo(
      id,
      dto.recibido,
      dto.motivo,
      actorId,
    );
  }

  /** Hosting: se persigue al final, antes de subir a producción. */
  @Patch(':id/hosting')
  @ApiTags(TAGS.flujo)
  @ApiOperation({
    summary: 'Hosting contratado',
    description:
      'Va al final del flujo a propósito, para que el cliente aproveche al máximo su servicio. Destraba la subida a producción y lo saca del Grupo C.',
  })
  @ApiParam(PARAM_ID)
  @ApiOkResponse({ type: ProyectoRespuestaDto })
  @ApiNotFoundResponse(NO_ENCONTRADO)
  marcarHosting(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: BloqueoClienteDto,
    @UsuarioActual('sub') actorId: number,
  ) {
    return this.projectsService.marcarHosting(
      id,
      dto.recibido,
      dto.motivo,
      actorId,
    );
  }

  // --- Hitos del recorrido (nodos F1, A9, C3, B4, B5, B13, B14) -----------

  /** Revisión de factibilidad del desarrollador. No bloquea el flujo. */
  @Post(':id/factibilidad')
  @ApiTags(TAGS.flujo)
  @ApiOperation({
    summary: 'Registrar la revisión de factibilidad',
    description:
      'Nodo F1. **No bloquea nada**: se registra solo para poder auditar que el desarrollador revisó antes de presentar.',
  })
  @ApiParam(PARAM_ID)
  @ApiOkResponse({ type: ProyectoRespuestaDto })
  @ApiNotFoundResponse(NO_ENCONTRADO)
  registrarFactibilidad(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoDto,
    @UsuarioActual('sub') actorId: number,
  ) {
    return this.projectsService.registrarFactibilidad(id, dto.motivo, actorId);
  }

  @Post(':id/aprobar-diseno')
  @ApiTags(TAGS.flujo)
  @ApiOperation({
    summary: 'Aprobar el diseño',
    description:
      'Sirve en cualquiera de las tres etapas de diseño, no solo en la última.',
  })
  @ApiParam(PARAM_ID)
  @ApiOkResponse({ type: ProyectoRespuestaDto })
  @ApiNotFoundResponse(NO_ENCONTRADO)
  @ApiConflictResponse({
    description: 'El proyecto no está en ninguna de las tres etapas de diseño.',
  })
  aprobarDiseno(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoDto,
    @UsuarioActual('sub') actorId: number,
  ) {
    return this.projectsService.aprobarDiseno(id, dto.motivo, actorId);
  }

  @Post(':id/cargar-productos')
  @ApiTags(TAGS.flujo)
  @ApiOperation({
    summary: 'Marcar los productos como cargados',
    description: 'Solo e-commerce, y solo con el catálogo ya recibido.',
  })
  @ApiParam(PARAM_ID)
  @ApiOkResponse({ type: ProyectoRespuestaDto })
  @ApiNotFoundResponse(NO_ENCONTRADO)
  @ApiConflictResponse({
    description: 'El proyecto no es e-commerce, o todavía falta el catálogo.',
  })
  cargarProductos(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoDto,
    @UsuarioActual('sub') actorId: number,
  ) {
    return this.projectsService.cargarProductos(id, dto.motivo, actorId);
  }

  @Post(':id/presentar')
  @ApiTags(TAGS.flujo)
  @ApiOperation({
    summary: 'Presentar la web al cliente',
    description:
      'Sella `presentadoAt`, que es lo que habilita cargar observaciones.',
  })
  @ApiParam(PARAM_ID)
  @ApiOkResponse({ type: ProyectoRespuestaDto })
  @ApiNotFoundResponse(NO_ENCONTRADO)
  presentarWeb(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoDto,
    @UsuarioActual('sub') actorId: number,
  ) {
    return this.projectsService.presentarWeb(id, dto.motivo, actorId);
  }

  /** Fuera del alcance genera cotización, pero el proyecto continúa igual. */
  @Post(':id/observaciones')
  @ApiTags(TAGS.flujo)
  @ApiOperation({
    summary: 'Registrar observaciones del cliente',
    description:
      'Nodos B5 y B6, contra la web ya desarrollada (distinto de las rondas de cambios, que son contra el diseño). Dentro del alcance limpia `presentadoAt` para volver a presentar; fuera del alcance abre una cotización adicional y **el proyecto igual continúa**.',
  })
  @ApiParam(PARAM_ID)
  @ApiOkResponse({ type: ProyectoRespuestaDto })
  @ApiNotFoundResponse(NO_ENCONTRADO)
  @ApiConflictResponse({ description: 'La web todavía no se presentó.' })
  registrarObservaciones(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ObservacionesDto,
    @UsuarioActual('sub') actorId: number,
  ) {
    return this.projectsService.registrarObservaciones(id, dto, actorId);
  }

  @Post(':id/produccion')
  @ApiTags(TAGS.flujo)
  @ApiOperation({
    summary: 'Subir a producción',
    description: 'Exige el hosting contratado.',
  })
  @ApiParam(PARAM_ID)
  @ApiOkResponse({ type: ProyectoRespuestaDto })
  @ApiNotFoundResponse(NO_ENCONTRADO)
  @ApiConflictResponse({
    description: 'Todavía no está contratado el hosting.',
  })
  subirAProduccion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoDto,
    @UsuarioActual('sub') actorId: number,
  ) {
    return this.projectsService.subirAProduccion(id, dto.motivo, actorId);
  }

  @Post(':id/capacitacion')
  @ApiTags(TAGS.flujo)
  @ApiOperation({
    summary: 'Registrar la capacitación',
    description:
      'Último paso antes de dar por entregado. Exige que ya se haya subido a producción.',
  })
  @ApiParam(PARAM_ID)
  @ApiOkResponse({ type: ProyectoRespuestaDto })
  @ApiNotFoundResponse(NO_ENCONTRADO)
  @ApiConflictResponse({ description: 'Todavía no se subió a producción.' })
  registrarCapacitacion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoDto,
    @UsuarioActual('sub') actorId: number,
  ) {
    return this.projectsService.registrarCapacitacion(id, dto.motivo, actorId);
  }

  @Post(':id/rondas-cambio')
  @ApiTags(TAGS.flujo)
  @ApiOperation({
    summary: 'Registrar una ronda de cambios de diseño',
    description:
      'El precio incluye 2. Pasadas las incluidas **no se bloquea nada**: devuelve `requiereCotizacionAdicional: true`, deja la fila en cotizaciones y el caso se maneja internamente.',
  })
  @ApiParam(PARAM_ID)
  @ApiOkResponse({ type: ResumenRondasDto })
  @ApiNotFoundResponse(NO_ENCONTRADO)
  registrarRondaDeCambios(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoDto,
    @UsuarioActual('sub') actorId: number,
  ) {
    return this.projectsService.registrarRondaDeCambios(
      id,
      dto.motivo,
      actorId,
    );
  }

  @Roles(...ROLES_ADMINISTRACION)
  @Post(':id/archivar')
  @ApiTags(TAGS.flujo)
  @ApiOperation({
    summary: 'Archivar un proyecto',
    description:
      'Terminal y distinto de «Proyecto Finalizado», para que no se mezclen en la misma métrica. Cierra los recordatorios abiertos. Los candidatos salen por `GET /projects/por-archivar`.',
  })
  @ApiParam(PARAM_ID)
  @ApiOkResponse({ type: ProyectoRespuestaDto })
  @ApiForbiddenResponse(SIN_PERMISO)
  @ApiNotFoundResponse(NO_ENCONTRADO)
  @ApiConflictResponse({ description: 'Ya está archivado, o está finalizado.' })
  archivar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoDto,
    @UsuarioActual('sub') actorId: number,
  ) {
    return this.projectsService.archivar(id, dto.motivo, actorId);
  }

  @Roles(...ROLES_ADMINISTRACION)
  @Post(':id/reactivar')
  @ApiTags(TAGS.flujo)
  @ApiOperation({
    summary: 'Reactivar un proyecto archivado',
    description:
      'Vuelve a la etapa que tenía al archivarse, leída del historial. Cobra 25% si volvió antes del año y 50% si llegó al año o lo pasó; con 50% se rehacen inicio y diseño y vuelve a `Brief`.',
  })
  @ApiParam(PARAM_ID)
  @ApiOkResponse({ type: ResumenReactivacionDto })
  @ApiForbiddenResponse(SIN_PERMISO)
  @ApiNotFoundResponse(NO_ENCONTRADO)
  @ApiConflictResponse({ description: 'El proyecto no está archivado.' })
  reactivar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoDto,
    @UsuarioActual('sub') actorId: number,
  ) {
    return this.projectsService.reactivar(id, dto.motivo, actorId);
  }

  @Patch(':id/responsables')
  @ApiTags(TAGS.proyectos)
  @ApiOperation({
    summary: 'Reasignar diseñador y/o desarrollador',
    description:
      'Cambia `disenadorId` / `desarrolladorId` y deja la tabla de equipo (`usuarios_proyectos`) en sincronía en la misma transacción: el responsable saliente se desengancha y el entrante se engancha. Al resto del equipo no lo toca. Omitir una clave la deja como está; mandarla en `null` deja el puesto vacante y saca a esa persona del equipo.',
  })
  @ApiParam(PARAM_ID)
  @ApiOkResponse({ type: ProyectoRespuestaDto })
  @ApiBadRequestResponse({
    description: 'Alguno de los usuarios indicados no existe.',
  })
  @ApiNotFoundResponse(NO_ENCONTRADO)
  asignarResponsables(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AsignarResponsablesDto,
    @UsuarioActual('sub') actorId: number,
  ) {
    return this.projectsService.asignarResponsables(id, dto, actorId);
  }

  @Post(':id/usuarios')
  @ApiTags(TAGS.proyectos)
  @ApiOperation({
    summary: 'Asignar usuarios al proyecto',
    description:
      'Aditivo: suma sin sacar a los que ya estaban y sin tocar `disenadorId` ni `desarrolladorId`. Para reemplazar la lista entera va `usuariosIds` por `PATCH /projects/:id`.',
  })
  @ApiParam(PARAM_ID)
  @ApiCreatedResponse({ type: ProyectoRespuestaDto })
  @ApiBadRequestResponse({ description: 'Alguno de los usuarios no existe.' })
  @ApiNotFoundResponse(NO_ENCONTRADO)
  asignarUsuarios(
    @Param('id', ParseIntPipe) id: number,
    @Body() asignarUsuariosDto: AsignarUsuariosDto,
  ) {
    return this.projectsService.asignarUsuarios(
      id,
      asignarUsuariosDto.usuariosIds,
    );
  }

  @Delete(':id/usuarios/:usuarioId')
  @ApiTags(TAGS.proyectos)
  @ApiOperation({
    summary: 'Sacar un usuario del proyecto',
    description: 'Solo lo desengancha de la tabla de asignación.',
  })
  @ApiParam(PARAM_ID)
  @ApiParam({
    name: 'usuarioId',
    description: 'Id del usuario a desenganchar.',
    example: 7,
  })
  @ApiOkResponse({ type: ProyectoRespuestaDto })
  @ApiNotFoundResponse(NO_ENCONTRADO)
  quitarUsuario(
    @Param('id', ParseIntPipe) id: number,
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
  ) {
    return this.projectsService.quitarUsuario(id, usuarioId);
  }

  @Delete(':id')
  @ApiTags(TAGS.proyectos)
  @ApiOperation({
    summary: 'Eliminar un proyecto',
    description:
      'Borrado lógico: sella `deletedAt` y el proyecto deja de aparecer en las consultas, pero conserva cobros, historial, recordatorios y cotizaciones.',
  })
  @ApiParam(PARAM_ID)
  @ApiOkResponse({ type: ProyectoRespuestaDto })
  @ApiNotFoundResponse(NO_ENCONTRADO)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.projectsService.remove(id);
  }
}
