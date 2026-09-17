import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { TipoNotificacion } from '../../lib/generated/prisma/client';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { LimitadorDeIntentos, mensajeDeEspera } from './limitador-de-intentos';

const QUINCE_MINUTOS = 15 * 60_000;

/** Lo que responde siempre, exista o no el usuario. */
export const RESPUESTA_RECUPERACION =
  'Si el usuario existe, administración recibió tu pedido y te va a dar una contraseña temporal.';

/**
 * **OLVIDÉ MI CONTRASEÑA.** No manda correos: avisa a administración, que le
 * pone una contraseña temporal desde Usuarios. Al entrar con ella, el sistema
 * obliga a cambiarla.
 *
 * La respuesta es siempre la misma para no revelar qué usuarios existen, y
 * hay freno para que nadie la use para llenar de avisos a administración.
 */
@Injectable()
export class RecuperacionService {
  private readonly logger = new Logger(RecuperacionService.name);

  /** 5 pedidos por IP cada 15 minutos. */
  private readonly porIp = new LimitadorDeIntentos(5, QUINCE_MINUTOS);
  /** Un aviso por usuario cada 15 minutos: los demás no se repiten. */
  private readonly porUsuario = new LimitadorDeIntentos(1, QUINCE_MINUTOS);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  async pedir(usuario: string, ip = 'desconocida'): Promise<string> {
    const claveIp = `ip:${ip}`;
    const espera = this.porIp.esperaPara(claveIp);
    if (espera > 0) {
      throw new HttpException(
        mensajeDeEspera(espera),
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.porIp.registrarFallo(claveIp);

    const nombre = usuario.trim();
    const claveUsuario = `u:${nombre.toLowerCase()}`;
    if (this.porUsuario.esperaPara(claveUsuario) > 0) {
      return RESPUESTA_RECUPERACION;
    }

    // Mismo criterio que el login: el usuario tal cual, con mayúsculas.
    const encontrado = await this.prisma.user.findUnique({
      where: { user: nombre },
      select: { id: true, name: true, user: true, active: true },
    });

    if (encontrado?.active) {
      this.porUsuario.registrarFallo(claveUsuario);
      await this.notificaciones.notificarAdministracion({
        tipo: TipoNotificacion.RecuperarContrasena,
        titulo: `${encontrado.name} pidió restablecer su contraseña`,
        mensaje: `Usuario «${encontrado.user}». Ponle una contraseña temporal desde Usuarios: al entrar, el sistema le va a pedir cambiarla.`,
      });
      this.logger.log(
        `Pedido de recuperación para el usuario ${encontrado.id}`,
      );
    }

    return RESPUESTA_RECUPERACION;
  }
}
