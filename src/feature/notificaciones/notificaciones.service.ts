import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Canal de salida genérico para avisos (hoy solo Discord, vía webhook
 * entrante). Nunca debe tumbar la operación real que la disparó: cualquier
 * error de red o de configuración se traga y se loguea como warning.
 */
@Injectable()
export class NotificacionesService {
  private readonly logger = new Logger(NotificacionesService.name);

  constructor(private readonly config: ConfigService) {}

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
}
