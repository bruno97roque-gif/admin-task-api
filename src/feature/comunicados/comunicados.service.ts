import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { Prisma, TipoNotificacion } from '../../lib/generated/prisma/client';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import {
  estadoDe,
  filtroVigente,
  problemaDe,
  sePuedeCerrar,
  type EstadoComunicado,
} from './comunicados.reglas';
import { CreateComunicadoDto } from './dto/create-comunicado.dto';
import { UpdateComunicadoDto } from './dto/update-comunicado.dto';

/** Lo que ve cualquiera: sin autor ni fechas internas. */
const publicoSelect = {
  id: true,
  titulo: true,
  mensaje: true,
  nivel: true,
} satisfies Prisma.ComunicadoSelect;

export type ComunicadoPublico = Prisma.ComunicadoGetPayload<{
  select: typeof publicoSelect;
}>;

const adminInclude = {
  creador: { select: { id: true, name: true } },
  _count: { select: { cierres: true } },
} satisfies Prisma.ComunicadoInclude;

export type ComunicadoAdmin = Prisma.ComunicadoGetPayload<{
  include: typeof adminInclude;
}> & { estado: EstadoComunicado };

/** Los urgentes primero, después los más nuevos. */
const orden: Prisma.ComunicadoOrderByWithRelationInput[] = [
  { nivel: 'desc' },
  { desde: 'desc' },
];

/**
 * **COMUNICADOS.** Avisos de administración para todos: en la página de login
 * (públicos) o arriba dentro del sistema, donde cada uno puede cerrarlos
 * salvo los urgentes.
 */
@Injectable()
export class ComunicadosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  /** Los vigentes para la página de login. Sin sesión. */
  paraLogin(): Promise<ComunicadoPublico[]> {
    return this.prisma.comunicado.findMany({
      where: { enLogin: true, ...filtroVigente(new Date()) },
      select: publicoSelect,
      orderBy: orden,
    });
  }

  /** Los vigentes dentro del sistema que el usuario no cerró. */
  activos(usuarioId: number): Promise<ComunicadoPublico[]> {
    return this.prisma.comunicado.findMany({
      where: {
        enSistema: true,
        ...filtroVigente(new Date()),
        // Un urgente se muestra aunque haya un cierre viejo (si lo subieron de
        // nivel después de que alguien lo cerró).
        AND: [
          {
            OR: [{ nivel: 'Urgente' }, { cierres: { none: { usuarioId } } }],
          },
        ],
      },
      select: publicoSelect,
      orderBy: orden,
    });
  }

  async cerrar(id: number, usuarioId: number): Promise<void> {
    const comunicado = await this.prisma.comunicado.findUnique({
      where: { id },
      select: { nivel: true },
    });
    if (!comunicado) throw this.notFound(id);
    if (!sePuedeCerrar(comunicado.nivel)) {
      throw new ConflictException(
        'Los comunicados urgentes no se pueden cerrar',
      );
    }

    await this.prisma.comunicadoCierre.upsert({
      where: { comunicadoId_usuarioId: { comunicadoId: id, usuarioId } },
      create: { comunicadoId: id, usuarioId },
      update: {},
    });
  }

  // ---------------------------------------------------------------------------
  // Administración
  // ---------------------------------------------------------------------------

  async findAll(): Promise<ComunicadoAdmin[]> {
    const ahora = new Date();
    const comunicados = await this.prisma.comunicado.findMany({
      include: adminInclude,
      orderBy: { desde: 'desc' },
    });
    return comunicados.map((c) => ({ ...c, estado: estadoDe(c, ahora) }));
  }

  async create(
    dto: CreateComunicadoDto,
    creadorId?: number,
  ): Promise<ComunicadoAdmin> {
    const datos = {
      titulo: dto.titulo.trim(),
      mensaje: dto.mensaje.trim(),
      nivel: dto.nivel ?? 'Info',
      enLogin: dto.enLogin ?? false,
      enSistema: dto.enSistema ?? true,
      desde: dto.desde ? new Date(dto.desde) : new Date(),
      hasta: dto.hasta ? new Date(dto.hasta) : null,
    } satisfies Prisma.ComunicadoUncheckedCreateInput;
    this.validar(datos);

    const creado = await this.prisma.comunicado.create({
      data: { ...datos, creadorId: creadorId ?? null },
      include: adminInclude,
    });

    if (dto.notificar) {
      await this.notificaciones.notificarATodos({
        tipo: TipoNotificacion.Comunicado,
        titulo: datos.titulo,
        mensaje: datos.mensaje.slice(0, 300),
      });
    }

    return { ...creado, estado: estadoDe(creado, new Date()) };
  }

  async update(id: number, dto: UpdateComunicadoDto): Promise<ComunicadoAdmin> {
    const actual = await this.prisma.comunicado.findUnique({ where: { id } });
    if (!actual) throw this.notFound(id);

    const datos = {
      titulo: dto.titulo?.trim() ?? actual.titulo,
      mensaje: dto.mensaje?.trim() ?? actual.mensaje,
      nivel: dto.nivel ?? actual.nivel,
      enLogin: dto.enLogin ?? actual.enLogin,
      enSistema: dto.enSistema ?? actual.enSistema,
      desde: dto.desde ? new Date(dto.desde) : actual.desde,
      // `null` explícito quita el fin; ausente lo deja como estaba.
      hasta:
        dto.hasta === undefined
          ? actual.hasta
          : dto.hasta === null
            ? null
            : new Date(dto.hasta),
    };
    this.validar(datos);

    const actualizado = await this.prisma.comunicado.update({
      where: { id },
      data: datos,
      include: adminInclude,
    });
    return { ...actualizado, estado: estadoDe(actualizado, new Date()) };
  }

  /** Lo corta ya: deja de mostrarse en todos lados. */
  async finalizar(id: number): Promise<ComunicadoAdmin> {
    const actual = await this.prisma.comunicado.findUnique({ where: { id } });
    if (!actual) throw this.notFound(id);

    const ahora = new Date();
    if (estadoDe(actual, ahora) === 'finalizado') {
      throw new ConflictException('Ese comunicado ya terminó');
    }

    // Si todavía no había empezado, se mueve también el inicio para que el
    // fin no quede antes del inicio.
    const actualizado = await this.prisma.comunicado.update({
      where: { id },
      data: {
        hasta: ahora,
        ...(actual.desde.getTime() > ahora.getTime() && { desde: ahora }),
      },
      include: adminInclude,
    });
    return { ...actualizado, estado: 'finalizado' };
  }

  async remove(id: number): Promise<void> {
    const borrados = await this.prisma.comunicado.deleteMany({
      where: { id },
    });
    if (borrados.count === 0) throw this.notFound(id);
  }

  private validar(datos: Parameters<typeof problemaDe>[0]): void {
    const problema = problemaDe(datos);
    if (problema) throw new BadRequestException(problema);
  }

  private notFound(id: number): NotFoundException {
    return new NotFoundException(`Comunicado con id ${id} no encontrado`);
  }
}
