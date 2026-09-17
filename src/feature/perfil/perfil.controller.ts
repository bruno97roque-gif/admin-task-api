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
  Put,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AUTH_BEARER, TAGS } from '../../swagger';
import { Public } from '../auth/decorators/public.decorator';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator';
import { ActualizarPerfilDto } from './dto/actualizar-perfil.dto';
import { CambiarContrasenaDto } from './dto/cambiar-contrasena.dto';
import { FotoPerfilDto } from './dto/foto-perfil.dto';
import { PerfilRespuestaDto } from './dto/perfil-respuesta.dto';
import { PerfilService } from './perfil.service';

@ApiTags(TAGS.perfil)
@ApiBearerAuth(AUTH_BEARER)
@Controller()
export class PerfilController {
  constructor(private readonly perfil: PerfilService) {}

  @Get('perfil')
  @ApiOperation({ summary: 'Ver mi perfil' })
  @ApiOkResponse({ type: PerfilRespuestaDto })
  obtener(@UsuarioActual('sub') usuarioId: number) {
    return this.perfil.obtener(usuarioId);
  }

  @Patch('perfil')
  @ApiOperation({ summary: 'Cambiar mi nombre' })
  @ApiOkResponse({ type: PerfilRespuestaDto })
  actualizar(
    @UsuarioActual('sub') usuarioId: number,
    @Body() dto: ActualizarPerfilDto,
  ) {
    return this.perfil.actualizar(usuarioId, dto);
  }

  @Put('perfil/contrasena')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cambiar mi contraseña',
    description:
      'Pide la contraseña actual. Cinco fallos en 15 minutos bloquean la ruta un rato. La sesión abierta sigue valiendo.',
  })
  @ApiNoContentResponse({ description: 'Contraseña cambiada.' })
  @ApiBadRequestResponse({
    description:
      'La actual no es correcta, la nueva es igual a la actual o no cumple el largo.',
  })
  @ApiTooManyRequestsResponse({ description: 'Demasiados intentos.' })
  cambiarContrasena(
    @UsuarioActual('sub') usuarioId: number,
    @Body() dto: CambiarContrasenaDto,
  ) {
    return this.perfil.cambiarContrasena(usuarioId, dto);
  }

  @Put('perfil/foto')
  @ApiOperation({ summary: 'Subir o reemplazar mi foto' })
  @ApiOkResponse({ type: PerfilRespuestaDto })
  @ApiBadRequestResponse({
    description: 'No es WebP, JPG ni PNG, pesa de más o está dañada.',
  })
  guardarFoto(
    @UsuarioActual('sub') usuarioId: number,
    @Body() dto: FotoPerfilDto,
  ) {
    return this.perfil.guardarFoto(usuarioId, dto.imagen);
  }

  @Delete('perfil/foto')
  @ApiOperation({ summary: 'Quitar mi foto' })
  @ApiOkResponse({ type: PerfilRespuestaDto })
  borrarFoto(@UsuarioActual('sub') usuarioId: number) {
    return this.perfil.borrarFoto(usuarioId);
  }

  /**
   * Pública a propósito: un `<img src>` no manda el token. Solo sirve la foto
   * que la persona eligió mostrar en el sistema, y la URL lleva `?v=` para
   * poder guardarla en caché mucho tiempo sin quedarse con una vieja.
   */
  @Public()
  @Get('user/:id/foto')
  @ApiOperation({
    summary: 'Foto de perfil de un usuario',
    description:
      'Pública (la usa `<img>`, que no manda token). Se cachea: el front agrega `?v=fotoVersion`.',
  })
  @ApiParam({ name: 'id', description: 'Id del usuario.', example: 4 })
  @ApiProduces('image/webp', 'image/jpeg', 'image/png')
  @ApiOkResponse({ description: 'La imagen.' })
  @ApiNotFoundResponse({ description: 'No tiene foto.' })
  async foto(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ): Promise<void> {
    const { tipo, datos } = await this.perfil.foto(id);
    res
      .set({
        'Content-Type': tipo,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(datos);
  }
}
