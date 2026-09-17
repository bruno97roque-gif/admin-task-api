import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AUTH_BEARER, TAGS } from '../../swagger';
import { Public } from '../auth/decorators/public.decorator';
import {
  Roles,
  ROLES_ADMINISTRACION,
} from '../auth/decorators/roles.decorator';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator';
import { ComunicadosService } from './comunicados.service';
import { CreateComunicadoDto } from './dto/create-comunicado.dto';
import { UpdateComunicadoDto } from './dto/update-comunicado.dto';

@ApiTags(TAGS.comunicados)
@ApiBearerAuth(AUTH_BEARER)
@Controller('comunicados')
export class ComunicadosController {
  constructor(private readonly comunicados: ComunicadosService) {}

  // Segmentos fijos antes de `:id`.

  @Public()
  @Get('login')
  @ApiOperation({
    summary: 'Comunicados de la página de login',
    description: 'Pública. Solo los vigentes marcados para el login.',
  })
  paraLogin() {
    return this.comunicados.paraLogin();
  }

  @Get('activos')
  @ApiOperation({
    summary: 'Mis comunicados pendientes',
    description:
      'Los vigentes dentro del sistema que el usuario no cerró (los urgentes siempre).',
  })
  activos(@UsuarioActual('sub') usuarioId: number) {
    return this.comunicados.activos(usuarioId);
  }

  @Roles(...ROLES_ADMINISTRACION)
  @Get()
  @ApiOperation({ summary: 'Todos los comunicados (administración)' })
  @ApiForbiddenResponse({ description: 'Solo administración.' })
  findAll() {
    return this.comunicados.findAll();
  }

  @Roles(...ROLES_ADMINISTRACION)
  @Post()
  @ApiOperation({
    summary: 'Publicar un comunicado',
    description:
      'Con `notificar: true` además deja una notificación a cada usuario activo.',
  })
  @ApiBadRequestResponse({
    description: 'No se muestra en ningún lado o el fin es anterior al inicio.',
  })
  @ApiForbiddenResponse({ description: 'Solo administración.' })
  create(
    @Body() dto: CreateComunicadoDto,
    @UsuarioActual('sub') creadorId: number,
  ) {
    return this.comunicados.create(dto, creadorId);
  }

  @Post(':id/cerrar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cerrar un comunicado para mí' })
  @ApiParam({ name: 'id', example: 1 })
  @ApiNoContentResponse({ description: 'No se le vuelve a mostrar.' })
  @ApiConflictResponse({ description: 'Los urgentes no se cierran.' })
  @ApiNotFoundResponse({ description: 'No existe.' })
  cerrar(
    @Param('id', ParseIntPipe) id: number,
    @UsuarioActual('sub') usuarioId: number,
  ) {
    return this.comunicados.cerrar(id, usuarioId);
  }

  @Roles(...ROLES_ADMINISTRACION)
  @Post(':id/finalizar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Finalizar ya un comunicado' })
  @ApiParam({ name: 'id', example: 1 })
  @ApiConflictResponse({ description: 'Ya había terminado.' })
  @ApiForbiddenResponse({ description: 'Solo administración.' })
  finalizar(@Param('id', ParseIntPipe) id: number) {
    return this.comunicados.finalizar(id);
  }

  @Roles(...ROLES_ADMINISTRACION)
  @Patch(':id')
  @ApiOperation({ summary: 'Editar un comunicado' })
  @ApiParam({ name: 'id', example: 1 })
  @ApiForbiddenResponse({ description: 'Solo administración.' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateComunicadoDto,
  ) {
    return this.comunicados.update(id, dto);
  }

  @Roles(...ROLES_ADMINISTRACION)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un comunicado' })
  @ApiParam({ name: 'id', example: 1 })
  @ApiForbiddenResponse({ description: 'Solo administración.' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.comunicados.remove(id);
  }
}
