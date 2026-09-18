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
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AUTH_BEARER, TAGS } from '../../swagger';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator';
import { ActualizarPendienteDto } from './dto/actualizar-pendiente.dto';
import { CrearPendienteDto } from './dto/crear-pendiente.dto';
import { PendientesService } from './pendientes.service';

@ApiTags(TAGS.pendientes)
@ApiBearerAuth(AUTH_BEARER)
@Controller()
export class PendientesController {
  constructor(private readonly pendientes: PendientesService) {}

  @Get('pendientes/resumen')
  @ApiOperation({
    summary: 'Contadores para las tarjetas',
    description:
      'Por proyecto y persona: `total` y `hechos`. Los propios; administración recibe los de todos.',
  })
  resumen(@UsuarioActual('sub') actorId: number) {
    return this.pendientes.resumen(actorId);
  }

  @Get('projects/:proyectoId/pendientes')
  @ApiOperation({
    summary: 'Pendientes de un proyecto',
    description:
      'La lista propia. Administración puede pedir la de otra persona con `?usuarioId=` (solo lectura).',
  })
  @ApiParam({ name: 'proyectoId', example: 12 })
  @ApiQuery({ name: 'usuarioId', required: false, example: 4 })
  @ApiForbiddenResponse({ description: 'La lista es de otra persona.' })
  @ApiNotFoundResponse({ description: 'No existe el proyecto.' })
  listar(
    @Param('proyectoId', ParseIntPipe) proyectoId: number,
    @UsuarioActual('sub') actorId: number,
    @Query('usuarioId', new ParseIntPipe({ optional: true }))
    usuarioId?: number,
  ) {
    return this.pendientes.listar(proyectoId, actorId, usuarioId);
  }

  @Post('projects/:proyectoId/pendientes')
  @ApiOperation({ summary: 'Agregar un pendiente a mi lista' })
  @ApiParam({ name: 'proyectoId', example: 12 })
  @ApiForbiddenResponse({ description: 'No está asignado al proyecto.' })
  crear(
    @Param('proyectoId', ParseIntPipe) proyectoId: number,
    @UsuarioActual('sub') actorId: number,
    @Body() dto: CrearPendienteDto,
  ) {
    return this.pendientes.crear(proyectoId, actorId, dto);
  }

  @Patch('pendientes/:id')
  @ApiOperation({ summary: 'Editar o marcar un pendiente propio' })
  @ApiParam({ name: 'id', example: 1 })
  @ApiForbiddenResponse({ description: 'No es de su lista.' })
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @UsuarioActual('sub') actorId: number,
    @Body() dto: ActualizarPendienteDto,
  ) {
    return this.pendientes.actualizar(id, actorId, dto);
  }

  @Delete('pendientes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Borrar un pendiente propio' })
  @ApiParam({ name: 'id', example: 1 })
  @ApiNoContentResponse({ description: 'Borrado.' })
  @ApiForbiddenResponse({ description: 'No es de su lista.' })
  borrar(
    @Param('id', ParseIntPipe) id: number,
    @UsuarioActual('sub') actorId: number,
  ) {
    return this.pendientes.borrar(id, actorId);
  }
}
