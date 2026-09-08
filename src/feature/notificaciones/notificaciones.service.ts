import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../lib/prisma/prisma.service';
import {
  Notificacion,
  Prisma,
  TipoNotificacion,
} from '../../lib/generated/prisma/client';
import { ROLES_ADMINISTRACION } from '../auth/decorators/roles.decorator';

/** Lo que hace falta para dejar un aviso interno a un usuario. */
export interface NuevaNotificacion {
  tipo: TipoNotificacion;
  titulo: string;
  mensaje: string;
  proyectoId?: number | null;
}

const notificacionInclude = {
  proyecto: { select: { id: true, name: true } },
} satisfies Prisma.NotificacionInclude;

export type NotificacionCompleta = Prisma.NotificacionGetPayload<{
  include: typeof notificacionInclude;
}>;

/** Lo que el front consulta cada tanto: las últimas y cuántas faltan leer. */
export interface BandejaNotificaciones {
  noLeidas: number;
  notificaciones: NotificacionCompleta[];
}

/** Cuántas notificaciones se devuelven por consulta. Las viejas ya no importan. */
const LIMITE_BANDEJA = 50;

/**
 * Dos canales de aviso que no se pisan:
 *
 * - **Discord** (`enviarDiscord`): webhook entrante, sin destinatario ni
 *   estado. Es el canal «para todos» que ya existía.
 * - **Internas** (`notificar`, `notificarAdministracion`): filas en
 *   `notificaciones`, una por destinatario, con leída/no leída. Alimentan la
 *   campanita del front.
 *
 * Ninguno de los dos debe tumbar la operación real que lo disparó: un aviso
 * que falla se loguea como warning y la operación sigue.
 */
@Injectable()
export class NotificacionesService {
  private readonly logger = new Logger(NotificacionesService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  // ---------------------------------------------------------------------------
  // Discord
  // ---------------------------------------------------------------------------

  async enviarDiscord(mensaje: string): Promise<void> {
    const webhookUrl = this.config.get<string>('DISCORD_WEBHOOK_URL');

    // Sin configurar: el feature queda apagado a propósito, no es un error.
    if (!webhookUrl) return;

    try {
      const respuesta = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: mensaje }),
      });

      if (!respuesta.ok) {
        this.logger.warn(
          `Discord respondió ${respuesta.status} al notificar: ${mensaje}`,
        );
      }
    } catch (error) {
      this.logger.warn(`No se pudo notificar a Discord: ${error}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Internas: escritura
  // ---------------------------------------------------------------------------

  /** Deja el mismo aviso a cada uno de los usuarios indicados. */
  async notificar(
    usuariosIds: number[],
    aviso: NuevaNotificacion,
  ): Promise<void> {
    const destinatarios = [...new Set(usuariosIds)];
    if (destinatarios.length === 0) return;

    try {
      await this.prisma.notificacion.createMany({
        data: destinatarios.map((usuarioId) => ({
          usuarioId,
          tipo: aviso.tipo,
          titulo: aviso.titulo,
          mensaje: aviso.mensaje,
          proyectoId: aviso.proyectoId ?? null,
        })),
      });
    } catch (error) {
      this.logger.warn(`No se pudo guardar la notificación interna: ${error}`);
    }
  }

  /**
   * Avisa a todos los usuarios activos con rol de administración (`Admin` u
   * `Owner`). Es «Julio» en el flujo: quien cobra, agenda y lee las notas.
   */
  /**
   * `excepto` saca de la lista a quien ya se enteró por otra vía — el admin
   * que además está convocado a la reunión, por ejemplo. Sin eso recibiría el
   * mismo hecho dos veces con dos textos distintos.
   */
  async notificarAdministracion(
    aviso: NuevaNotificacion,
    excepto: number[] = [],
  ): Promise<void> {
    const admins = await this.prisma.user.findMany({
      where: {
        active: true,
        rol: { name: { in: [...ROLES_ADMINISTRACION] } },
        ...(excepto.length > 0 && { id: { notIn: excepto } }),
      },
      select: { id: true },
    });

    await this.notificar(
      admins.map((admin) => admin.id),
      aviso,
    );
  }

  // ---------------------------------------------------------------------------
  // Internas: lectura (siempre acotadas al usuario del token)
  // ---------------------------------------------------------------------------

  async bandeja(usuarioId: number): Promise<BandejaNotificaciones> {
    const [noLeidas, notificaciones] = await Promise.all([
      this.prisma.notificacion.count({
        where: { usuarioId, leidaAt: null },
      }),
      this.prisma.notificacion.findMany({
        where: { usuarioId },
        include: notificacionInclude,
        orderBy: { createdAt: 'desc' },
        take: LIMITE_BANDEJA,
      }),
    ]);

    return { noLeidas, notificaciones };
  }

  async marcarLeida(id: number, usuarioId: number): Promise<Notificacion> {
    // Se busca por id **y** usuario: nadie marca como leída una ajena.
    const notificacion = await this.prisma.notificacion.findFirst({
      where: { id, usuarioId },
    });

    if (!notificacion) {
      throw new NotFoundException(`Notificación con id ${id} no encontrada`);
    }

    if (notificacion.leidaAt) return notificacion;

    return this.prisma.notificacion.update({
      where: { id },
      data: { leidaAt: new Date() },
    });
  }

  async marcarTodasLeidas(usuarioId: number): Promise<{ marcadas: number }> {
    const resultado = await this.prisma.notificacion.updateMany({
      where: { usuarioId, leidaAt: null },
      data: { leidaAt: new Date() },
    });

    return { marcadas: resultado.count };
  }
}
