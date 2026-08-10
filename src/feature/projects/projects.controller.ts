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
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { AsignarUsuariosDto } from './dto/asignar-usuarios.dto';
import { DefinirPlanCobrosDto } from './dto/plan-cobros.dto';
import { MarcarCobroDto } from './dto/marcar-cobro.dto';
import { MotivoDto } from './dto/motivo.dto';
import { ObservacionesDto } from './dto/observaciones.dto';
import { BloqueoClienteDto } from './dto/bloqueo-cliente.dto';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator';
import {
  Roles,
  ROLES_ADMINISTRACION,
} from '../auth/decorators/roles.decorator';
import { HitoCobro } from '../../lib/generated/prisma/client';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  create(
    @Body() createProjectDto: CreateProjectDto,
    @UsuarioActual('sub') actorId: number,
  ) {
    return this.projectsService.create(createProjectDto, actorId);
  }

  @Get()
  findAll() {
    return this.projectsService.findAll();
  }

  // Las rutas con segmento fijo deben declararse antes de @Get(':id'), o
  // Express interpreta 'programador' / 'diseno' / 'admin' como un id de
  // proyecto. Cualquier ruta estática nueva va también arriba de :id.
  @Get('programador')
  findByProgramer(
    @Query('id', new ParseIntPipe({ optional: true }))
    idProgramador?: number,
  ) {
    return this.projectsService.findByProgramer(idProgramador);
  }

  @Get('diseno')
  findByDiseno(
    @Query('id', new ParseIntPipe({ optional: true }))
    idDisenador?: number,
  ) {
    return this.projectsService.findByDiseno(idDisenador);
  }

  @Get('admin')
  findByAdmin() {
    return this.projectsService.findByAdmin();
  }

  @Get('archivados')
  findArchivados() {
    return this.projectsService.findArchivados();
  }

  /** Los que ya cumplieron los 3 meses sin moverse y toca archivar. */
  @Get('por-archivar')
  findPorArchivar() {
    return this.projectsService.findPorArchivar();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.projectsService.findOne(id);
  }

  @Get(':id/historial')
  findHistorial(@Param('id', ParseIntPipe) id: number) {
    return this.projectsService.findHistorial(id);
  }

  /** Los cinco recordatorios del flujo, abiertos y ya resueltos. */
  @Get(':id/recordatorios')
  findRecordatorios(@Param('id', ParseIntPipe) id: number) {
    return this.projectsService.findRecordatorios(id);
  }

  @Patch(':id')
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
  definirPlanDeCobros(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DefinirPlanCobrosDto,
    @UsuarioActual('sub') actorId: number,
  ) {
    return this.projectsService.definirPlanDeCobros(id, dto, actorId);
  }

  @Roles(...ROLES_ADMINISTRACION)
  @Patch(':id/cobros/:hito')
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
  registrarFactibilidad(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoDto,
    @UsuarioActual('sub') actorId: number,
  ) {
    return this.projectsService.registrarFactibilidad(id, dto.motivo, actorId);
  }

  @Post(':id/aprobar-diseno')
  aprobarDiseno(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoDto,
    @UsuarioActual('sub') actorId: number,
  ) {
    return this.projectsService.aprobarDiseno(id, dto.motivo, actorId);
  }

  @Post(':id/cargar-productos')
  cargarProductos(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoDto,
    @UsuarioActual('sub') actorId: number,
  ) {
    return this.projectsService.cargarProductos(id, dto.motivo, actorId);
  }

  @Post(':id/presentar')
  presentarWeb(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoDto,
    @UsuarioActual('sub') actorId: number,
  ) {
    return this.projectsService.presentarWeb(id, dto.motivo, actorId);
  }

  /** Fuera del alcance genera cotización, pero el proyecto continúa igual. */
  @Post(':id/observaciones')
  registrarObservaciones(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ObservacionesDto,
    @UsuarioActual('sub') actorId: number,
  ) {
    return this.projectsService.registrarObservaciones(id, dto, actorId);
  }

  @Post(':id/produccion')
  subirAProduccion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoDto,
    @UsuarioActual('sub') actorId: number,
  ) {
    return this.projectsService.subirAProduccion(id, dto.motivo, actorId);
  }

  @Post(':id/capacitacion')
  registrarCapacitacion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoDto,
    @UsuarioActual('sub') actorId: number,
  ) {
    return this.projectsService.registrarCapacitacion(id, dto.motivo, actorId);
  }

  @Post(':id/rondas-cambio')
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
  archivar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoDto,
    @UsuarioActual('sub') actorId: number,
  ) {
    return this.projectsService.archivar(id, dto.motivo, actorId);
  }

  @Roles(...ROLES_ADMINISTRACION)
  @Post(':id/reactivar')
  reactivar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoDto,
    @UsuarioActual('sub') actorId: number,
  ) {
    return this.projectsService.reactivar(id, dto.motivo, actorId);
  }

  @Post(':id/usuarios')
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
  quitarUsuario(
    @Param('id', ParseIntPipe) id: number,
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
  ) {
    return this.projectsService.quitarUsuario(id, usuarioId);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.projectsService.remove(id);
  }
}
