import {
  Body,
  Controller,
  GoneException,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiGoneResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { TAGS } from '../../swagger';
import { Public } from './decorators/public.decorator';
import { RecuperarContrasenaDto } from './dto/recuperar-contrasena.dto';
import { RecuperacionService } from './recuperacion.service';

const RECARGA =
  'El sistema se actualizó. Recarga la página (Ctrl + F5) para iniciar sesión.';

/**
 * **RUTAS VIEJAS DEL LOGIN.** El login ahora es de better-auth, en
 * `/api/auth/*` (ver `main.ts`). Estas quedan para que una pestaña abierta
 * con el front anterior no quede muda: le piden recargar.
 */
@ApiTags(TAGS.auth)
@Controller('auth')
export class AuthController {
  constructor(private readonly recuperacion: RecuperacionService) {}

  @Public()
  @Post('recuperar-contrasena')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Olvidé mi contraseña',
    description:
      'Pública. Avisa a administración para que le ponga una contraseña temporal. Responde siempre lo mismo, exista o no el usuario. 5 pedidos por IP cada 15 minutos.',
  })
  @ApiAcceptedResponse({ description: 'Pedido recibido.' })
  @ApiTooManyRequestsResponse({ description: 'Demasiados pedidos.' })
  async recuperarContrasena(
    @Body() dto: RecuperarContrasenaDto,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    return { message: await this.recuperacion.pedir(dto.usuario, req.ip) };
  }

  @Public()
  @Post('login')
  @ApiOperation({
    summary: '(Reemplazada) Iniciar sesión',
    description:
      'Ahora es `POST /api/auth/sign-in/username` con `{ username, password }`. Responde 410 para que el front viejo pida recargar.',
  })
  @ApiGoneResponse({ description: RECARGA })
  login(): never {
    throw new GoneException(RECARGA);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({
    summary: '(Reemplazada) Renovar sesión',
    description:
      'Las sesiones se renuevan solas. Responde 401 para que el front viejo vuelva al login.',
  })
  @ApiUnauthorizedResponse({ description: RECARGA })
  refresh(): never {
    throw new UnauthorizedException(RECARGA);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: '(Reemplazada) Cerrar sesión',
    description: 'Ahora es `POST /api/auth/sign-out`. Esta no hace nada.',
  })
  @ApiNoContentResponse()
  logout(): void {}
}
