import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { JwtService } from '../../lib/jwt/jwt.service';
import { ROLES_ADMINISTRACION } from '../auth/decorators/roles.decorator';
import { cifrar, descifrar } from './cripto';
import { frontDesde, permisosFaltantes } from './evento.reglas';
import {
  correoDeLaCuenta,
  ErrorDeGoogle,
  intercambiarCodigo,
  renovarAccessToken,
  revocarToken,
  urlDeAutorizacion,
  type ConfigGoogle,
} from './google.cliente';

/** Lo que dura el enlace para autorizar: lo justo para pasar por Google. */
const VIGENCIA_DEL_STATE = '10m';
const PROPOSITO = 'conectar-google';

interface StateDeConexion {
  readonly sub: number;
  readonly proposito: string;
}

export interface EstadoDeGoogle {
  /** Si el servidor tiene las cuatro variables `GOOGLE_*`. */
  readonly configurada: boolean;
  readonly conectada: boolean;
  /** El correo de la cuenta de Google conectada. */
  readonly cuenta: string | null;
  /** Quién la conectó, dentro del sistema. */
  readonly conectadaPor: string | null;
  readonly conectadaAt: Date | null;
  /** Permisos que la cuenta no concedió: con alguno faltando, hay que reconectar. */
  readonly permisosFaltantes: string[];
}

/**
 * **LA CUENTA DE GOOGLE QUE USA WEBSY.** Conectarla, guardar su acceso
 * cifrado, pedir un access token fresco para cada operación y desconectarla.
 *
 * Conecta solo administración, que es la que tiene Workspace. Todo lo que el
 * sistema crea en Google figura como creado por esa cuenta.
 */
@Injectable()
export class GoogleService {
  private readonly logger = new Logger(GoogleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private configuracion(): ConfigGoogle | null {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri = this.config.get<string>('GOOGLE_REDIRECT_URI');

    if (!clientId || !clientSecret || !redirectUri || !this.secreto()) {
      return null;
    }

    return { clientId, clientSecret, redirectUri };
  }

  private secreto(): string | null {
    return this.config.get<string>('GOOGLE_TOKEN_SECRET') || null;
  }

  private exigirConfiguracion(): { config: ConfigGoogle; secreto: string } {
    const config = this.configuracion();
    const secreto = this.secreto();

    if (!config || !secreto) {
      throw new ServiceUnavailableException(
        'La integración con Google no está configurada en el servidor',
      );
    }

    return { config, secreto };
  }

  /**
   * El `state` de OAuth va firmado con un secreto **distinto** del de las
   * sesiones. Viaja en la URL hacia Google y queda en el historial del
   * navegador: firmado con `JWT_SECRET`, el guard global lo aceptaría como un
   * token de acceso del admin.
   */
  private secretoDelState(secreto: string): string {
    return `${secreto}:${PROPOSITO}`;
  }

  /** Dónde vuelve el navegador después de pasar por Google. */
  frontUrl(): string | null {
    return frontDesde(this.config.get<string>('CORS_ORIGIN'));
  }

  configurada(): boolean {
    return this.configuracion() !== null;
  }

  async esAdministracion(usuarioId: number): Promise<boolean> {
    const usuario = await this.prisma.user.findUnique({
      where: { id: usuarioId },
      select: { active: true, rol: { select: { name: true } } },
    });

    return (
      usuario?.active === true &&
      (ROLES_ADMINISTRACION as readonly string[]).includes(usuario.rol.name)
    );
  }

  async urlDeConexion(usuarioId: number): Promise<string> {
    const { config, secreto } = this.exigirConfiguracion();

    const state = await this.jwt.sign(
      { sub: usuarioId, proposito: PROPOSITO } satisfies StateDeConexion,
      {
        secret: this.secretoDelState(secreto),
        expiresIn: VIGENCIA_DEL_STATE,
      },
    );

    return urlDeAutorizacion(config, state);
  }

  /**
   * La vuelta de Google. Se valida el `state` (firma, vigencia y propósito) y
   * que quien lo pidió siga siendo administración; recién ahí se canjea el
   * código y se guarda el acceso, cifrado.
   */
  async completarConexion(code: string, state: string): Promise<string> {
    const { config, secreto } = this.exigirConfiguracion();

    let datos: StateDeConexion;
    try {
      datos = await this.jwt.verify<StateDeConexion>(state, {
        secret: this.secretoDelState(secreto),
      });
    } catch {
      throw new ForbiddenException(
        'El enlace para conectar Google venció o no es válido. Vuelve a intentarlo desde el sistema.',
      );
    }

    if (datos.proposito !== PROPOSITO || typeof datos.sub !== 'number') {
      throw new ForbiddenException(
        'El enlace para conectar Google no es válido',
      );
    }

    if (!(await this.esAdministracion(datos.sub))) {
      throw new ForbiddenException(
        'Solo administración puede conectar la cuenta de Google',
      );
    }

    const tokens = await intercambiarCodigo(config, code);
    const cuenta = await correoDeLaCuenta(tokens.accessToken);
    const refreshToken = cifrar(tokens.refreshToken, secreto);

    await this.prisma.integracionGoogle.upsert({
      where: { usuarioId: datos.sub },
      create: {
        usuarioId: datos.sub,
        refreshToken,
        cuenta,
        scopes: tokens.scopes,
      },
      update: {
        refreshToken,
        cuenta,
        scopes: tokens.scopes,
        conectadaAt: new Date(),
      },
    });

    return cuenta;
  }

  /** La conexión vigente: la última que se hizo. */
  private conexionActual() {
    return this.prisma.integracionGoogle.findFirst({
      orderBy: { conectadaAt: 'desc' },
      include: { usuario: { select: { name: true } } },
    });
  }

  async estado(): Promise<EstadoDeGoogle> {
    const configurada = this.configurada();
    const conexion = await this.conexionActual();

    return {
      configurada,
      conectada: configurada && conexion !== null,
      cuenta: conexion?.cuenta ?? null,
      conectadaPor: conexion?.usuario.name ?? null,
      conectadaAt: conexion?.conectadaAt ?? null,
      permisosFaltantes: conexion ? permisosFaltantes(conexion.scopes) : [],
    };
  }

  async conectada(): Promise<boolean> {
    return this.configurada() && (await this.conexionActual()) !== null;
  }

  /**
   * Desconecta: se le avisa a Google que el acceso ya no se usa y se borra de
   * la base. Si Google no responde, se borra igual: lo que importa es que el
   * sistema deje de tenerlo.
   */
  async desconectar(): Promise<void> {
    const secreto = this.secreto();
    const conexiones = await this.prisma.integracionGoogle.findMany();

    if (secreto) {
      for (const conexion of conexiones) {
        try {
          await revocarToken(descifrar(conexion.refreshToken, secreto));
        } catch (error) {
          this.logger.warn(
            `No se pudo revocar en Google la conexión ${conexion.id}: ${String(error)}`,
          );
        }
      }
    }

    await this.prisma.integracionGoogle.deleteMany();
  }

  /**
   * Corre `accion` con un access token recién pedido. Si la cuenta no está
   * conectada, o Google rechaza el acceso guardado (se revocó desde la cuenta,
   * se cambió la contraseña), responde 409 con un mensaje para reconectar.
   */
  async conAccessToken<T>(accion: (token: string) => Promise<T>): Promise<T> {
    const { config, secreto } = this.exigirConfiguracion();
    const conexion = await this.conexionActual();

    if (!conexion) {
      throw new ConflictException(
        'Google Calendar no está conectado. Conéctalo desde Reuniones.',
      );
    }

    let refreshToken: string;
    try {
      refreshToken = descifrar(conexion.refreshToken, secreto);
    } catch {
      // Pasa si cambió GOOGLE_TOKEN_SECRET: lo guardado ya no se puede leer.
      throw new ConflictException(
        'El acceso guardado de Google ya no se puede leer. Vuelve a conectar la cuenta desde Reuniones.',
      );
    }

    let token: string;
    try {
      token = await renovarAccessToken(config, refreshToken);
    } catch (error) {
      if (error instanceof ErrorDeGoogle && error.estado < 500) {
        throw new ConflictException(
          'Google rechazó el acceso guardado. Vuelve a conectar la cuenta desde Reuniones.',
        );
      }
      throw error;
    }

    return accion(token);
  }
}
