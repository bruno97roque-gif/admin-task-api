import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { NotificacionesService } from './notificaciones.service';
import {
  BandejaRespuestaDto,
  NotificacionRespuestaDto,
} from './dto/notificacion-respuesta.dto';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator';
import { AUTH_BEARER, TAGS } from '../../swagger';

/**
 * Bandeja de avisos internos del usuario logueado. Todas las rutas se acotan
 * al `sub` del token: no hay forma de leer ni marcar las de otro.
 */
@ApiTags(TAGS.notificaciones)
@ApiBearerAuth(AUTH_BEARER)
@Controller('notificaciones')
export class NotificacionesController {
  constructor(private readonly notificaciones: NotificacionesService) {}

  @Get()
  @ApiOperation({
    summary: 'Mi bandeja',
    description:
      'Las últimas 50 notificaciones del usuario logueado y cuántas faltan leer. Pensada para consultarse cada tanto desde el front.',
  })
  @ApiOkResponse({ type: BandejaRespuestaDto })
  bandeja(@UsuarioActual('sub') usuarioId: number) {
    return this.notificaciones.bandeja(usuarioId);
  }

  // Segmento fijo antes de :id, como en /projects.
  @Post('leer-todas')
  @ApiOperation({ summary: 'Marcar todas como leídas' })
  @ApiOkResponse({
    schema: { example: { marcadas: 3 } },
    description: 'Cuántas cambiaron de estado.',
  })
  leerTodas(@UsuarioActual('sub') usuarioId: number) {
    return this.notificaciones.marcarTodasLeidas(usuarioId);
  }

  @Patch(':id/leer')
  @ApiOperation({ summary: 'Marcar una como leída' })
  @ApiParam({ name: 'id', description: 'Id de la notificación.', example: 1 })
  @ApiOkResponse({ type: NotificacionRespuestaDto })
  @ApiNotFoundResponse({ description: 'No existe o no es del usuario.' })
  leer(
    @Param('id', ParseIntPipe) id: number,
    @UsuarioActual('sub') usuarioId: number,
  ) {
    return this.notificaciones.marcarLeida(id, usuarioId);
  }
}
