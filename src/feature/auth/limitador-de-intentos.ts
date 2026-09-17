/**
 * Cuenta intentos fallidos por clave (usuario, IP) dentro de una ventana y
 * bloquea al pasarse. Vive en memoria: alcanza para una sola instancia del API,
 * que es como corre en Railway. Si algún día hay varias, cada una cuenta por
 * su lado (el límite efectivo se multiplica, no se rompe nada).
 *
 * El reloj se inyecta para poder probarlo sin esperar.
 */
export class LimitadorDeIntentos {
  private readonly fallos = new Map<string, number[]>();

  constructor(
    private readonly maximo: number,
    private readonly ventanaMs: number,
    private readonly ahora: () => number = Date.now,
  ) {}

  /** Milisegundos que faltan para poder reintentar, o 0 si está libre. */
  esperaPara(clave: string): number {
    const vigentes = this.vigentes(clave);
    if (vigentes.length < this.maximo) return 0;
    // Se libera cuando vence el más viejo de los que cuentan.
    const masViejo = vigentes[vigentes.length - this.maximo];
    return Math.max(0, masViejo + this.ventanaMs - this.ahora());
  }

  registrarFallo(clave: string): void {
    this.fallos.set(clave, [...this.vigentes(clave), this.ahora()]);
    this.limpiar();
  }

  /** Un acierto borra el historial: quien entra bien no arrastra fallos. */
  olvidar(clave: string): void {
    this.fallos.delete(clave);
  }

  private vigentes(clave: string): number[] {
    const desde = this.ahora() - this.ventanaMs;
    return (this.fallos.get(clave) ?? []).filter((t) => t > desde);
  }

  /** Saca las claves sin fallos vigentes, para que el mapa no crezca solo. */
  private limpiar(): void {
    for (const clave of this.fallos.keys()) {
      const vigentes = this.vigentes(clave);
      if (vigentes.length === 0) this.fallos.delete(clave);
      else this.fallos.set(clave, vigentes);
    }
  }
}

/** Texto para quien quedó bloqueado. Redondea hacia arriba y nunca dice 0. */
export function mensajeDeEspera(ms: number): string {
  const minutos = Math.max(1, Math.ceil(ms / 60_000));
  return `Demasiados intentos. Vuelve a intentarlo en ${minutos} minuto${minutos === 1 ? '' : 's'}.`;
}
