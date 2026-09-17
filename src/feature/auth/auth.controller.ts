import {
  Controller,
  GoneException,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiGoneResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { TAGS } from '../../swagger';
import { Public } from './decorators/public.decorator';

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
