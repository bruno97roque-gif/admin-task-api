import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
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
import { NotasService } from './notas.service';
import { CreateNotaDto } from './dto/create-nota.dto';
import { CreateRespuestaDto } from './dto/create-respuesta.dto';
import { CambiarEstadoNotaDto } from './dto/cambiar-estado-nota.dto';
import {
  NotaRespuestaDto,
  PaginaNotasRespuestaDto,
} from './dto/nota-respuesta.dto';
import { EstadoNota } from '../../lib/generated/prisma/client';
import {
  Roles,
  ROLES_ADMINISTRACION,
} from '../auth/decorators/roles.decorator';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator';
import { AUTH_BEARER, TAGS } from '../../swagger';

const QUERY_PAGINA = {
  name: 'pagina',
  required: false,
  type: Number,
  description: 'Página, empezando en 1.',
  example: 1,
} as const;

const QUERY_POR_PAGINA = {
  name: 'porPagina',
  required: false,
  type: Number,
  description: 'Cuántos por página. Por defecto 10, máximo 50.',
  example: 10,
} as const;

const QUERY_ABIERTOS = {
  name: 'abiertos',
  required: false,
  type: Boolean,
  description: 'Con `true` esconde los resueltos.',
  example: true,
} as const;

const QUERY_ESTADO = {
  name: 'estado',
  required: false,
  enum: EstadoNota,
  enumName: 'EstadoNota',
  description: 'Filtra por un estado puntual.',
} as const;

/**
 * El equipo abre tickets, administración los atiende. Abrir uno, responder el
 * propio y `mias` son para cualquier usuario logueado; la bandeja completa,
 * el cambio de estado y borrar llevan `@Roles`.
 */
@ApiTags(TAGS.notas)
@ApiBearerAuth(AUTH_BEARER)
@Controller('notas')
export class NotasController {
  constructor(private readonly notas: NotasService) {}

  @Post()
  @ApiOperation({
    summary: 'Dejar una nota a administración',
    description:
      'El autor tiene que estar asignado al proyecto. Administración recibe una notificación interna.',
  })
  @ApiCreatedResponse({ type: NotaRespuestaDto })
  @ApiBadRequestResponse({
    description: 'Cuerpo inválido o proyecto inexistente.',
  })
  @ApiConflictResponse({
    description: 'El autor no está asignado a ese proyecto.',
  })
  create(@Body() dto: CreateNotaDto, @UsuarioActual('sub') autorId: number) {
    return this.notas.create(dto, autorId);
  }

  @Roles(...ROLES_ADMINISTRACION)
  @Get()
  @ApiOperation({
    summary: 'Bandeja de tickets',
    description:
      'Solo administración. Paginada en la base: primero lo que sigue abierto y, dentro de eso, lo que se movió más recientemente. `abiertos=true` esconde los resueltos; `estado` filtra por uno puntual.',
  })
  @ApiQuery(QUERY_PAGINA)
  @ApiQuery(QUERY_POR_PAGINA)
  @ApiQuery(QUERY_ABIERTOS)
  @ApiQuery(QUERY_ESTADO)
  @ApiOkResponse({ type: PaginaNotasRespuestaDto })
  @ApiForbiddenResponse({ description: 'Solo administración.' })
  findAll(
    @Query('pagina', new ParseIntPipe({ optional: true })) pagina?: number,
    @Query('porPagina', new ParseIntPipe({ optional: true }))
    porPagina?: number,
    @Query('abiertos') abiertos?: string,
    @Query('estado', new ParseEnumPipe(EstadoNota, { optional: true }))
    estado?: EstadoNota,
  ) {
    return this.notas.findAll({
      pagina,
      porPagina,
      abiertos: abiertos === 'true',
      estado,
    });
  }

  @Roles(...ROLES_ADMINISTRACION)
  @Patch(':id/estado')
  @ApiOperation({
    summary: 'Cambiar el estado de un ticket',
    description:
      'Solo administración. Sacarlo de `Pendiente` cuenta como leído. El autor recibe una notificación con el cambio.',
  })
  @ApiParam({ name: 'id', description: 'Id del ticket.', example: 1 })
  @ApiOkResponse({ type: NotaRespuestaDto })
  @ApiNotFoundResponse({ description: 'No existe ese ticket.' })
  @ApiForbiddenResponse({ description: 'Solo administración.' })
  cambiarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CambiarEstadoNotaDto,
  ) {
    return this.notas.cambiarEstado(id, dto);
  }

  @Post(':id/respuestas')
  @ApiOperation({
    summary: 'Responder un ticket',
    description:
      'Su autor o administración. Si responde administración, el ticket pasa a `EnCurso` y se avisa al autor; si responde el autor, se avisa a administración.',
  })
  @ApiParam({ name: 'id', description: 'Id del ticket.', example: 1 })
  @ApiCreatedResponse({ type: NotaRespuestaDto })
  @ApiNotFoundResponse({ description: 'No existe ese ticket.' })
  @ApiForbiddenResponse({ description: 'El ticket no es tuyo.' })
  @ApiConflictResponse({ description: 'El ticket está resuelto.' })
  responder(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateRespuestaDto,
    @UsuarioActual('sub') usuarioId: number,
  ) {
    return this.notas.responder(id, dto, usuarioId);
  }

  // Segmento fijo antes de :id, como en /projects.
  @Get('mias')
  @ApiOperation({
    summary: 'Mis tickets',
    description:
      'Los que abrió el usuario logueado, más nuevos primero. Paginados igual que la bandeja.',
  })
  @ApiQuery(QUERY_PAGINA)
  @ApiQuery(QUERY_POR_PAGINA)
  @ApiQuery(QUERY_ABIERTOS)
  @ApiQuery(QUERY_ESTADO)
  @ApiOkResponse({ type: PaginaNotasRespuestaDto })
  findMias(
    @UsuarioActual('sub') autorId: number,
    @Query('pagina', new ParseIntPipe({ optional: true })) pagina?: number,
    @Query('porPagina', new ParseIntPipe({ optional: true }))
    porPagina?: number,
    @Query('abiertos') abiertos?: string,
    @Query('estado', new ParseEnumPipe(EstadoNota, { optional: true }))
    estado?: EstadoNota,
  ) {
    return this.notas.findMias(autorId, {
      pagina,
      porPagina,
      abiertos: abiertos === 'true',
      estado,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Ver un ticket con su hilo',
    description: 'Su autor o administración.',
  })
  @ApiParam({ name: 'id', description: 'Id del ticket.', example: 1 })
  @ApiOkResponse({ type: NotaRespuestaDto })
  @ApiNotFoundResponse({ description: 'No existe ese ticket.' })
  @ApiForbiddenResponse({ description: 'El ticket no es tuyo.' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @UsuarioActual('sub') usuarioId: number,
  ) {
    return this.notas.findOne(id, usuarioId);
  }

  @Roles(...ROLES_ADMINISTRACION)
  @Patch(':id/leer')
  @ApiOperation({ summary: 'Marcar una nota como leída' })
  @ApiParam({ name: 'id', description: 'Id de la nota.', example: 1 })
  @ApiOkResponse({ type: NotaRespuestaDto })
  @ApiNotFoundResponse({ description: 'No existe esa nota.' })
  @ApiForbiddenResponse({ description: 'Solo administración.' })
  leer(@Param('id', ParseIntPipe) id: number) {
    return this.notas.marcarLeida(id);
  }

  @Roles(...ROLES_ADMINISTRACION)
  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar una nota' })
  @ApiParam({ name: 'id', description: 'Id de la nota.', example: 1 })
  @ApiOkResponse({ type: NotaRespuestaDto })
  @ApiNotFoundResponse({ description: 'No existe esa nota.' })
  @ApiForbiddenResponse({ description: 'Solo administración.' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.notas.remove(id);
  }
}
