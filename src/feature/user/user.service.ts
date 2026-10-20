import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { Argon2Service } from '../../lib/argon2/argon2.service';
import { Prisma, Puesto, User } from '../../lib/generated/prisma/client';
import { versionDeFoto } from '../perfil/perfil.reglas';
import { cerrarSesiones, guardarContrasena } from '../auth/cuentas';
import { ordenar, puestosDe } from './puestos.reglas';

const sinPassword = { password: true } as const;

/** La foto (solo su fecha), el rol y los puestos cargados. */
const conFoto = {
  fotoPerfil: { select: { updatedAt: true } },
  rol: { select: { name: true } },
  puestos: { select: { puesto: true } },
} as const;

export type UserPublico = Omit<User, 'password'> & {
  /** Versión de la foto subida (`/user/:id/foto?v=`), o `null`. */
  fotoVersion: number | null;
  /** En qué trabaja: lo cargado a mano o, si no hay nada, lo que implica su rol. */
  puestos: Puesto[];
};

function publico(
  user: Omit<User, 'password'> & {
    fotoPerfil: { updatedAt: Date } | null;
    rol?: { name: string } | null;
    puestos?: { puesto: Puesto }[];
  },
): UserPublico {
  const { fotoPerfil, rol, puestos, ...resto } = user;
  return {
    ...resto,
    fotoVersion: versionDeFoto(fotoPerfil),
    puestos: puestosDe(
      rol?.name,
      puestos?.map((p) => p.puesto),
    ),
  };
}

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly argon2: Argon2Service,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<UserPublico> {
    await this.validarRol(createUserDto.roleId);
    await this.validarUsuarioLibre(createUserDto.user);

    const { puestos, ...datosDeAlta } = createUserDto;
    const hash = await this.argon2.hash(datosDeAlta.password);

    // El usuario y su cuenta de acceso nacen juntos: sin la cuenta, better-auth
    // no lo deja entrar.
    const creado = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        // La primera contraseña la pone administración: se cambia al entrar.
        data: {
          ...datosDeAlta,
          password: hash,
          debeCambiarContrasena: true,
          ...(puestos && {
            puestos: { create: ordenar(puestos).map((puesto) => ({ puesto })) },
          }),
        },
        omit: sinPassword,
        include: conFoto,
      });
      await tx.account.create({
        data: {
          providerId: 'credential',
          accountId: String(user.id),
          userId: user.id,
          password: hash,
        },
      });
      return user;
    });

    return publico(creado);
  }

  async findAll(): Promise<UserPublico[]> {
    const users = await this.prisma.user.findMany({
      orderBy: { id: 'asc' },
      omit: sinPassword,
      include: conFoto,
    });
    return users.map(publico);
  }

  async findOne(id: number): Promise<UserPublico> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      omit: sinPassword,
      include: conFoto,
    });

    if (!user) {
      throw this.notFound(id);
    }

    return publico(user);
  }

  /**
   * `actorId` es quien pide el cambio. Si administración le cambia la
   * contraseña a otra persona, queda como temporal; si se la cambia a sí misma
   * desde acá, no.
   */
  async update(
    id: number,
    updateUserDto: UpdateUserDto,
    actorId?: number,
    sesionDelActor?: number,
  ): Promise<UserPublico> {
    if (updateUserDto.roleId !== undefined) {
      await this.validarRol(updateUserDto.roleId);
    }

    if (updateUserDto.user !== undefined) {
      await this.validarUsuarioLibre(updateUserDto.user, id);
    }

    const { password, puestos, ...datos } = updateUserDto;

    try {
      const actualizado = await this.prisma.user.update({
        where: { id },
        data: {
          ...datos,
          // Mandar la lista la reemplaza entera; omitirla no toca los puestos.
          ...(puestos && {
            puestos: {
              deleteMany: {},
              create: ordenar(puestos).map((puesto) => ({ puesto })),
            },
          }),
        },
        omit: sinPassword,
        include: conFoto,
      });

      // Contraseña nueva o usuario desactivado: se cierran todas sus sesiones,
      // así el cambio vale en el acto y no recién cuando vuelva a entrar.
      if (password !== undefined) {
        await guardarContrasena(
          this.prisma,
          id,
          await this.argon2.hash(password),
          actorId !== id,
        );
      }
      if (password !== undefined || datos.active === false) {
        // A quien se lo cambia a sí mismo no se le cierra la sesión actual.
        await cerrarSesiones(
          this.prisma,
          id,
          actorId === id ? sesionDelActor : undefined,
        );
      }

      return publico(
        password !== undefined
          ? { ...actualizado, debeCambiarContrasena: actorId !== id }
          : actualizado,
      );
    } catch (error) {
      this.rethrow(error, id);
    }
  }

  async remove(id: number): Promise<UserPublico> {
    try {
      return publico(
        await this.prisma.user.delete({
          where: { id },
          omit: sinPassword,
          include: conFoto,
        }),
      );
    } catch (error) {
      this.rethrow(error, id);
    }
  }

  private async validarRol(roleId: number): Promise<void> {
    const rol = await this.prisma.rol.findUnique({
      where: { id: roleId },
      select: { id: true },
    });

    if (!rol) {
      throw new BadRequestException(`El rol con id ${roleId} no existe`);
    }
  }

  private async validarUsuarioLibre(
    user: string,
    exceptoId?: number,
  ): Promise<void> {
    const existente = await this.prisma.user.findUnique({
      where: { user },
      select: { id: true },
    });

    if (existente && existente.id !== exceptoId) {
      throw new ConflictException(`El usuario "${user}" ya está registrado`);
    }
  }

  private notFound(id: number): NotFoundException {
    return new NotFoundException(`Usuario con id ${id} no encontrado`);
  }

  private rethrow(error: unknown, id: number): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      throw this.notFound(id);
    }

    throw error;
  }
}
