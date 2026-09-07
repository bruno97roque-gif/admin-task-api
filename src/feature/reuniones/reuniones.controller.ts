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
 * Administración agenda; diseñadores y desarrolladores consultan las suyas.
 * La escritura y el listado completo llevan `@Roles`; `mias` es para todos.
 */
@ApiTags(TAGS.reuniones)
@ApiBearerAuth(AUTH_BEARER)
@Controller('reuniones')
export class ReunionesController {
  constructor(private readonly reuniones: ReunionesService) {}

  @Roles(...ROLES_ADMINISTRACION)
  @Post()
  @ApiOperation({
    summary: 'Agendar una reunión',
    description:
      'Solo administración. El link de Google Meet es obligatorio. Cada convocado recibe una notificación interna con fecha y link.',
  })
  @ApiCreatedResponse({ type: ReunionRespuestaDto })
  @ApiBadRequestResponse({
    description:
      'Cuerpo inválido, link que no es de Meet, proyecto inexistente o participante inexistente/desactivado.',
  })
  @ApiForbiddenResponse({ description: 'Solo administración.' })
  create(
    @Body() dto: CreateReunionDto,
    @UsuarioActual('sub') creadorId: number,
  ) {
    return this.reuniones.create(dto, creadorId);
  }

  @Roles(...ROLES_ADMINISTRACION)
  @Get()
  @ApiOperation({
    summary: 'Listar todas las reuniones',
    description: 'Solo administración. Ordenadas por fecha ascendente.',
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
      'Las que convocan al usuario logueado, ordenadas por fecha ascendente. El front separa próximas de pasadas.',
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

  @Roles(...ROLES_ADMINISTRACION)
  @Patch(':id')
  @ApiOperation({
    summary: 'Modificar una reunión',
    description:
      'Solo administración. Si cambia la fecha o el link se avisa a todos los convocados; si solo se suman participantes, se avisa a los nuevos.',
  })
  @ApiParam({ name: 'id', description: 'Id de la reunión.', example: 1 })
  @ApiOkResponse({ type: ReunionRespuestaDto })
  @ApiNotFoundResponse({ description: 'No existe esa reunión.' })
  @ApiForbiddenResponse({ description: 'Solo administración.' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateReunionDto) {
    return this.reuniones.update(id, dto);
  }

  @Roles(...ROLES_ADMINISTRACION)
  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar una reunión' })
  @ApiParam({ name: 'id', description: 'Id de la reunión.', example: 1 })
  @ApiOkResponse({ type: ReunionRespuestaDto })
  @ApiNotFoundResponse({ description: 'No existe esa reunión.' })
  @ApiForbiddenResponse({ description: 'Solo administración.' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.reuniones.remove(id);
  }
}
