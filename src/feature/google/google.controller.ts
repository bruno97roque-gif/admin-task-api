import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import {
  Roles,
  ROLES_ADMINISTRACION,
} from '../auth/decorators/roles.decorator';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator';
import { AUTH_BEARER, TAGS } from '../../swagger';
import { GoogleService } from './google.service';

/** Lo que vuelve al front en `?google=`. Nunca el mensaje crudo de Google. */
type ResultadoDeConexion = 'conectado' | 'cancelado' | 'vencido' | 'error';

/**
 * Conectar, consultar y desconectar la cuenta de Google de administración.
 *
 * `callback` es la única ruta pública: la llama el navegador al volver de
 * Google, sin token de sesión. Quién pidió la conexión lo dice el `state`
 * firmado, no una cabecera.
 */
@ApiTags(TAGS.integraciones)
@ApiBearerAuth(AUTH_BEARER)
@Controller('integraciones/google')
export class GoogleController {
  private readonly logger = new Logger(GoogleController.name);

  constructor(private readonly google: GoogleService) {}

  @Roles(...ROLES_ADMINISTRACION)
  @Get('estado')
  @ApiOperation({
    summary: 'Estado de la conexión con Google',
    description:
      'Si el servidor tiene las credenciales, si hay una cuenta conectada, cuál y quién la conectó, y qué permisos faltan.',
  })
  @ApiOkResponse({ description: 'El estado de la integración.' })
  @ApiForbiddenResponse({ description: 'Solo administración.' })
  estado() {
    return this.google.estado();
  }

  @Roles(...ROLES_ADMINISTRACION)
  @Post('conexion')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Empezar a conectar Google',
    description:
      'Devuelve la URL de Google a la que hay que mandar el navegador. El enlace vence a los 10 minutos.',
  })
  @ApiOkResponse({ description: '`{ url }` para redirigir al navegador.' })
  @ApiServiceUnavailableResponse({
    description: 'Faltan las variables GOOGLE_* en el servidor.',
  })
  async conexion(@UsuarioActual('sub') usuarioId: number) {
    return { url: await this.google.urlDeConexion(usuarioId) };
  }

  @Public()
  @Get('callback')
  @ApiOperation({
    summary: 'Vuelta desde Google',
    description:
      'La llama el navegador al terminar la autorización. Guarda el acceso y redirige a `/reuniones?google=<resultado>` en el front.',
  })
  @ApiQuery({ name: 'code', required: false })
  @ApiQuery({ name: 'state', required: false })
  @ApiQuery({ name: 'error', required: false })
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    let resultado: ResultadoDeConexion;

    if (error) {
      resultado = error === 'access_denied' ? 'cancelado' : 'error';
    } else if (!code || !state) {
      resultado = 'error';
    } else {
      try {
        await this.google.completarConexion(code, state);
        resultado = 'conectado';
      } catch (e) {
        resultado = e instanceof ForbiddenException ? 'vencido' : 'error';
        this.logger.warn(`No se pudo conectar Google: ${String(e)}`);
      }
    }

    const front = this.google.frontUrl();
    if (front) {
      res.redirect(`${front}/reuniones?google=${resultado}`);
      return;
    }

    // Sin front configurado no hay a dónde volver: una página mínima.
    const texto =
      resultado === 'conectado'
        ? 'Google Calendar quedó conectado. Ya puedes cerrar esta pestaña.'
        : 'No se pudo conectar Google Calendar. Vuelve a intentarlo desde el sistema.';
    res
      .status(resultado === 'conectado' ? 200 : 400)
      .type('html')
      .send(
        `<!doctype html><meta charset="utf-8"><title>Google Calendar</title><p style="font-family:sans-serif">${texto}</p>`,
      );
  }

  @Roles(...ROLES_ADMINISTRACION)
  @Delete()
  @HttpCode(204)
  @ApiOperation({
    summary: 'Desconectar Google',
    description:
      'Revoca el acceso en Google y lo borra del sistema. Las reuniones ya enviadas siguen en el calendario.',
  })
  @ApiNoContentResponse({ description: 'Desconectado.' })
  async desconectar() {
    await this.google.desconectar();
  }
}
