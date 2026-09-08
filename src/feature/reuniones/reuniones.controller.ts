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
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ReunionesService } from './reuniones.service';
import { CreateReunionDto } from './dto/create-reunion.dto';
import { UpdateReunionDto } from './dto/update-reunion.dto';
import { ReunionRespuestaDto } from './dto/reunion-respuesta.dto';
import {
  Roles,
  ROLES_ADMINISTRACION,
} from '../auth/decorators/roles.decorator';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator';
import { AUTH_BEARER, TAGS } from '../../swagger';

/**
 * Cualquiera del equipo agenda sus reuniones; administración además ve y
 * ordena las de todos.
 *
 * Solo `GET /` (el historial completo) lleva `@Roles`. Editar y borrar están
 * abiertos en el router y acotados en el servicio: administración toca
 * cualquiera, el resto solo las que agendó.
 */
@ApiTags(TAGS.reuniones)
@ApiBearerAuth(AUTH_BEARER)
@Controller('reuniones')
export class ReunionesController {
  constructor(private readonly reuniones: ReunionesService) {}

  @Post()
  @ApiOperation({
    summary: 'Agendar una reunión',
    description:
      'Cualquier usuario logueado. El link de Google Meet es obligatorio. Cada convocado recibe una notificación interna con fecha y link, y si quien agenda no es administración, también se le avisa a ella.',
  })
  @ApiCreatedResponse({ type: ReunionRespuestaDto })
  @ApiBadRequestResponse({
    description:
      'Cuerpo inválido, link que no es de Meet, proyecto inexistente o participante inexistente/desactivado.',
  })
  create(
    @Body() dto: CreateReunionDto,
    @UsuarioActual('sub') creadorId: number,
  ) {
    return this.reuniones.create(dto, creadorId);
  }

  @Roles(...ROLES_ADMINISTRACION)
  @Get()
  @ApiOperation({
    summary: 'Historial de reuniones',
    description:
      'Todas las reuniones del equipo, las pasadas incluidas, ordenadas por fecha ascendente. Solo administración: es la vista para saber quién agendó qué.',
  })
  @ApiOkResponse({ type: ReunionRespuestaDto, isArray: true })
  @ApiForbiddenResponse({ description: 'Solo administración.' })
  findAll() {
    return this.reuniones.findAll();
  }

  // Segmento fijo antes de :id, como en /projects.
  @Get('mias')
  @ApiOperation({
    summary: 'Mis reuniones',
    description:
      'Las que convocan al usuario logueado **o que él agendó**, ordenadas por fecha ascendente. El front separa próximas de pasadas.',
  })
  @ApiOkResponse({ type: ReunionRespuestaDto, isArray: true })
  findMias(@UsuarioActual('sub') usuarioId: number) {
    return this.reuniones.findMias(usuarioId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ver una reunión' })
  @ApiParam({ name: 'id', description: 'Id de la reunión.', example: 1 })
  @ApiOkResponse({ type: ReunionRespuestaDto })
  @ApiNotFoundResponse({ description: 'No existe esa reunión.' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.reuniones.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Modificar una reunión',
    description:
      'Administración modifica cualquiera; el resto, solo las que agendó. Si cambia la fecha o el link se avisa a todos los convocados; si solo se suman participantes, se avisa a los nuevos.',
  })
  @ApiParam({ name: 'id', description: 'Id de la reunión.', example: 1 })
  @ApiOkResponse({ type: ReunionRespuestaDto })
  @ApiNotFoundResponse({ description: 'No existe esa reunión.' })
  @ApiForbiddenResponse({
    description:
      'La reunión la agendó otra persona y quien pide no es administración.',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateReunionDto,
    @UsuarioActual('sub') actorId: number,
  ) {
    return this.reuniones.update(id, dto, actorId);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Eliminar una reunión',
    description:
      'Administración borra cualquiera; el resto, solo las que agendó.',
  })
  @ApiParam({ name: 'id', description: 'Id de la reunión.', example: 1 })
  @ApiOkResponse({ type: ReunionRespuestaDto })
  @ApiNotFoundResponse({ description: 'No existe esa reunión.' })
  @ApiForbiddenResponse({
    description:
      'La reunión la agendó otra persona y quien pide no es administración.',
  })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @UsuarioActual('sub') actorId: number,
  ) {
    return this.reuniones.remove(id, actorId);
  }
}
