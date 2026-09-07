import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
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
  ApiTags,
} from '@nestjs/swagger';
import { NotasService } from './notas.service';
import { CreateNotaDto } from './dto/create-nota.dto';
import { NotaRespuestaDto } from './dto/nota-respuesta.dto';
import {
  Roles,
  ROLES_ADMINISTRACION,
} from '../auth/decorators/roles.decorator';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator';
import { AUTH_BEARER, TAGS } from '../../swagger';

/**
 * El equipo escribe, administración lee. `POST` y `mias` son para cualquier
 * usuario logueado; el panel completo, marcar leída y borrar llevan `@Roles`.
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
    summary: 'Panel de mensajes',
    description:
      'Solo administración. No leídas primero, después más nuevas primero.',
  })
  @ApiOkResponse({ type: NotaRespuestaDto, isArray: true })
  @ApiForbiddenResponse({ description: 'Solo administración.' })
  findAll() {
    return this.notas.findAll();
  }

  // Segmento fijo antes de :id, como en /projects.
  @Get('mias')
  @ApiOperation({
    summary: 'Mis notas enviadas',
    description: 'Las que mandó el usuario logueado, más nuevas primero.',
  })
  @ApiOkResponse({ type: NotaRespuestaDto, isArray: true })
  findMias(@UsuarioActual('sub') autorId: number) {
    return this.notas.findMias(autorId);
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
