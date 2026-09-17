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
import { Prisma, User } from '../../lib/generated/prisma/client';
import { versionDeFoto } from '../perfil/perfil.reglas';
import { cerrarSesiones, guardarContrasena } from '../auth/cuentas';

const sinPassword = { password: true } as const;

/** Solo la fecha de la foto: la imagen se sirve aparte. */
const conFoto = { fotoPerfil: { select: { updatedAt: true } } } as const;

export type UserPublico = Omit<User, 'password'> & {
  /** Versión de la foto subida (`/user/:id/foto?v=`), o `null`. */
  fotoVersion: number | null;
};

function publico(
  user: Omit<User, 'password'> & { fotoPerfil: { updatedAt: Date } | null },
): UserPublico {
  const { fotoPerfil, ...resto } = user;
  return { ...resto, fotoVersion: versionDeFoto(fotoPerfil) };
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

    const hash = await this.argon2.hash(createUserDto.password);

    // El usuario y su cuenta de acceso nacen juntos: sin la cuenta, better-auth
    // no lo deja entrar.
    const creado = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { ...createUserDto, password: hash },
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

  async update(id: number, updateUserDto: UpdateUserDto): Promise<UserPublico> {
    if (updateUserDto.roleId !== undefined) {
      await this.validarRol(updateUserDto.roleId);
    }

    if (updateUserDto.user !== undefined) {
      await this.validarUsuarioLibre(updateUserDto.user, id);
    }

    const { password, ...datos } = updateUserDto;

    try {
      const actualizado = await this.prisma.user.update({
        where: { id },
        data: datos,
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
        );
      }
      if (password !== undefined || datos.active === false) {
        await cerrarSesiones(this.prisma, id);
      }

      return publico(actualizado);
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
