import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { Argon2Service } from '../../lib/argon2/argon2.service';
import {
  LimitadorDeIntentos,
  mensajeDeEspera,
} from '../auth/limitador-de-intentos';
import { cerrarSesiones, guardarContrasena } from '../auth/cuentas';
import { ActualizarPerfilDto } from './dto/actualizar-perfil.dto';
import { CambiarContrasenaDto } from './dto/cambiar-contrasena.dto';
import { leerImagen, versionDeFoto } from './perfil.reglas';

export interface Perfil {
  id: number;
  name: string;
  user: string;
  email: string | null;
  roleId: number;
  roleName: string;
  fotoVersion: number | null;
  /** Tiene una contraseña temporal y debe cambiarla antes de seguir. */
  debeCambiarContrasena: boolean;
}

const perfilSelect = {
  id: true,
  name: true,
  user: true,
  email: true,
  roleId: true,
  debeCambiarContrasena: true,
  rol: { select: { name: true } },
  fotoPerfil: { select: { updatedAt: true } },
} as const;

/**
 * **MI PERFIL.** Todo acotado al usuario del token: nadie edita el perfil de
 * otro por acá (eso es cosa de administración, en `/user`).
 */
@Injectable()
export class PerfilService {
  /**
   * Adivinar la contraseña actual por esta ruta tiene el mismo límite que el
   * login: 10 fallos en 15 minutos por usuario.
   */
  private readonly intentos = new LimitadorDeIntentos(10, 15 * 60_000);

  constructor(
    private readonly prisma: PrismaService,
    private readonly argon2: Argon2Service,
  ) {}

  async obtener(usuarioId: number): Promise<Perfil> {
    const usuario = await this.prisma.user.findUnique({
      where: { id: usuarioId },
      select: perfilSelect,
    });

    if (!usuario) {
      throw new NotFoundException('Tu usuario ya no existe');
    }

    const { rol, fotoPerfil, ...resto } = usuario;
    return {
      ...resto,
      roleName: rol.name,
      fotoVersion: versionDeFoto(fotoPerfil),
    };
  }

  async actualizar(
    usuarioId: number,
    dto: ActualizarPerfilDto,
  ): Promise<Perfil> {
    await this.prisma.user.update({
      where: { id: usuarioId },
      data: { name: dto.name.trim() },
    });
    return this.obtener(usuarioId);
  }

  /**
   * Cambia la contraseña y **cierra las demás sesiones** del usuario: si
   * alguien más tenía la contraseña vieja, queda afuera. La sesión desde la que
   * se hizo el cambio sigue abierta.
   */
  async cambiarContrasena(
    usuarioId: number,
    dto: CambiarContrasenaDto,
    sesionActual?: number,
  ): Promise<void> {
    const clave = `perfil:${usuarioId}`;
    const espera = this.intentos.esperaPara(clave);
    if (espera > 0) {
      throw new HttpException(
        mensajeDeEspera(espera),
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const usuario = await this.prisma.user.findUnique({
      where: { id: usuarioId },
      select: {
        password: true,
        cuentasAcceso: {
          where: { providerId: 'credential' },
          select: { password: true },
        },
      },
    });
    if (!usuario) {
      throw new NotFoundException('Tu usuario ya no existe');
    }

    // La que vale para el login es la de la cuenta de acceso.
    const hashActual = usuario.cuentasAcceso[0]?.password ?? usuario.password;

    // 400 y no 401: un 401 cerraría la sesión en el front.
    if (!(await this.argon2.verify(hashActual, dto.actual))) {
      this.intentos.registrarFallo(clave);
      throw new BadRequestException('La contraseña actual no es correcta');
    }
    this.intentos.olvidar(clave);

    if (dto.actual === dto.nueva) {
      throw new BadRequestException(
        'La contraseña nueva tiene que ser distinta de la actual',
      );
    }

    await guardarContrasena(
      this.prisma,
      usuarioId,
      await this.argon2.hash(dto.nueva),
      false,
    );
    await cerrarSesiones(this.prisma, usuarioId, sesionActual);
  }

  async guardarFoto(usuarioId: number, dataUrl: string): Promise<Perfil> {
    const imagen = leerImagen(dataUrl);
    if (!imagen.ok) {
      throw new BadRequestException(imagen.motivo);
    }

    // Uint8Array y no Buffer: es lo que tipa Prisma 7 para `Bytes`.
    const datos = new Uint8Array(imagen.datos);
    await this.prisma.fotoPerfil.upsert({
      where: { usuarioId },
      create: { usuarioId, datos, tipo: imagen.tipo },
      update: { datos, tipo: imagen.tipo },
    });

    return this.obtener(usuarioId);
  }

  async borrarFoto(usuarioId: number): Promise<Perfil> {
    await this.prisma.fotoPerfil.deleteMany({ where: { usuarioId } });
    return this.obtener(usuarioId);
  }

  /** La foto de cualquier usuario, para mostrarla en el sistema. */
  async foto(usuarioId: number): Promise<{ tipo: string; datos: Buffer }> {
    const foto = await this.prisma.fotoPerfil.findUnique({
      where: { usuarioId },
      select: { tipo: true, datos: true },
    });

    if (!foto) {
      throw new NotFoundException('Ese usuario no tiene foto');
    }

    return { tipo: foto.tipo, datos: Buffer.from(foto.datos) };
  }
}
