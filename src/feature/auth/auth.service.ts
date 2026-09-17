import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { JwtSignOptions } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { Argon2Service } from '../../lib/argon2/argon2.service';
import { JwtService } from '../../lib/jwt/jwt.service';
import { versionDeFoto } from '../perfil/perfil.reglas';
import { LimitadorDeIntentos, mensajeDeEspera } from './limitador-de-intentos';

const QUINCE_MINUTOS = 15 * 60_000;

export interface JwtPayload {
  sub: number;
  user: string;
  roleId: number;
}

export interface RefreshPayload {
  sub: number;
}

export interface LoginResponse {
  accessToken: string;
  user: {
    id: number;
    name: string;
    user: string;
    roleId: number;
    roleName: string;
    /** Correo corporativo. El front arma con él el acceso al webmail. */
    email: string | null;
    /** Versión de la foto de perfil, o `null` si no subió ninguna. */
    fotoVersion: number | null;
  };
}

/**
 * Lo que devuelve el servicio: el refresh token va aparte porque el controller
 * lo manda en una cookie httpOnly y nunca en el cuerpo de la respuesta.
 */
export interface SesionCreada {
  respuesta: LoginResponse;
  refreshToken: string;
}

const usuarioSelect = {
  id: true,
  name: true,
  user: true,
  password: true,
  active: true,
  roleId: true,
  email: true,
  rol: { select: { name: true } },
  fotoPerfil: { select: { updatedAt: true } },
} as const;

@Injectable()
export class AuthService {
  /**
   * Freno a quien prueba contraseñas: 10 fallos por usuario, o 30 por IP (una
   * oficina comparte IP), en 15 minutos. Un acierto limpia el del usuario.
   */
  private readonly fallosPorUsuario = new LimitadorDeIntentos(
    10,
    QUINCE_MINUTOS,
  );
  private readonly fallosPorIp = new LimitadorDeIntentos(30, QUINCE_MINUTOS);

  constructor(
    private readonly prisma: PrismaService,
    private readonly argon2: Argon2Service,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(loginDto: LoginDto, ip = 'desconocida'): Promise<SesionCreada> {
    const claveUsuario = `u:${loginDto.user.trim().toLowerCase()}`;
    const claveIp = `ip:${ip}`;

    const espera = Math.max(
      this.fallosPorUsuario.esperaPara(claveUsuario),
      this.fallosPorIp.esperaPara(claveIp),
    );
    if (espera > 0) {
      throw new HttpException(
        mensajeDeEspera(espera),
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { user: loginDto.user },
      select: usuarioSelect,
    });

    // Mismo mensaje exista o no el usuario: no se le confirma a nadie qué
    // nombres de usuario hay.
    const passwordValida =
      user !== null &&
      (await this.argon2.verify(user.password, loginDto.password));

    if (!user || !passwordValida) {
      this.fallosPorUsuario.registrarFallo(claveUsuario);
      this.fallosPorIp.registrarFallo(claveIp);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    this.fallosPorUsuario.olvidar(claveUsuario);

    if (!user.active) {
      throw new UnauthorizedException('El usuario está desactivado');
    }

    return this.crearSesion(user);
  }

  /**
   * Rota la sesión a partir del refresh token de la cookie: valida la firma,
   * relee al usuario (por si cambió de rol o lo desactivaron) y emite un par nuevo.
   */
  async refresh(refreshToken: string | undefined): Promise<SesionCreada> {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token no proporcionado');
    }

    let payload: RefreshPayload;

    try {
      payload = await this.jwt.verify<RefreshPayload>(refreshToken, {
        secret: this.secretoRefresh(),
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: usuarioSelect,
    });

    if (!user) {
      throw new UnauthorizedException('El usuario ya no existe');
    }

    if (!user.active) {
      throw new UnauthorizedException('El usuario está desactivado');
    }

    return this.crearSesion(user);
  }

  private async crearSesion(user: {
    id: number;
    name: string;
    user: string;
    roleId: number;
    email: string | null;
    rol: { name: string };
    fotoPerfil: { updatedAt: Date } | null;
  }): Promise<SesionCreada> {
    const payload: JwtPayload = {
      sub: user.id,
      user: user.user,
      roleId: user.roleId,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.sign(payload),
      this.jwt.sign({ sub: user.id } satisfies RefreshPayload, {
        secret: this.secretoRefresh(),
        expiresIn: (this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ??
          '5d') as JwtSignOptions['expiresIn'],
      }),
    ]);

    return {
      respuesta: {
        accessToken,
        user: {
          id: user.id,
          name: user.name,
          user: user.user,
          roleId: user.roleId,
          roleName: user.rol.name,
          email: user.email,
          fotoVersion: versionDeFoto(user.fotoPerfil),
        },
      },
      refreshToken,
    };
  }

  private secretoRefresh(): string {
    return this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
  }
}
