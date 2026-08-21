import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService, LoginResponse, SesionCreada } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginRespuestaDto } from './dto/login-respuesta.dto';
import { Public } from './decorators/public.decorator';
import {
  COOKIE_PATH,
  REFRESH_COOKIE,
  opcionesCookieRefresh,
} from './auth.cookie';
import { AUTH_COOKIE_REFRESH, TAGS } from '../../swagger';

@ApiTags(TAGS.auth)
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Iniciar sesión',
    description:
      'Devuelve el access token en el cuerpo y deja el refresh token en una cookie httpOnly acotada a `Path=/auth`. Requiere `credentials: "include"` desde el navegador.',
  })
  @ApiOkResponse({
    description:
      'Sesión creada. La cookie `refreshToken` viaja en `Set-Cookie`.',
    type: LoginRespuestaDto,
  })
  @ApiUnauthorizedResponse({
    description: '`Credenciales inválidas` o `El usuario está desactivado`.',
  })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    return this.enviarSesion(await this.authService.login(loginDto), res);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(AUTH_COOKIE_REFRESH)
  @ApiOperation({
    summary: 'Renovar el access token',
    description:
      'Lee el refresh token de la cookie, relee al usuario de la base (así un cambio de rol o una baja pegan en el próximo refresh) y emite un par nuevo. No lleva cuerpo.',
  })
  @ApiOkResponse({
    description: 'Mismo formato que el login.',
    type: LoginRespuestaDto,
  })
  @ApiUnauthorizedResponse({
    description:
      '`Refresh token no proporcionado`, `Refresh token inválido o expirado`, `El usuario ya no existe` o `El usuario está desactivado`.',
  })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const refreshToken = req.cookies?.[REFRESH_COOKIE] as string | undefined;

    return this.enviarSesion(await this.authService.refresh(refreshToken), res);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cerrar sesión',
    description:
      'Borra la cookie del refresh token. El access token que ya se emitió sigue siendo válido hasta que expire: no hay revocación del lado del servidor.',
  })
  @ApiNoContentResponse({
    description:
      'Cookie borrada. **No devuelve cuerpo**: no lo parsees como JSON.',
  })
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
  }

  /** Deja el refresh token en la cookie httpOnly y devuelve solo el access token. */
  private enviarSesion(
    { respuesta, refreshToken }: SesionCreada,
    res: Response,
  ): LoginResponse {
    res.cookie(
      REFRESH_COOKIE,
      refreshToken,
      opcionesCookieRefresh(
        this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '5d',
      ),
    );

    return respuesta;
  }
}
