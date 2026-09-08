import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    description: 'Nombre completo de la persona.',
    example: 'Aaron Jauregui',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({
    description: 'Nombre de usuario para ingresar. Es único en la base.',
    example: 'aaron',
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  user: string;

  @ApiProperty({
    description:
      'Contraseña en texto plano. Se guarda hasheada con Argon2id y nunca se devuelve.',
    example: 'unaClaveSegura123',
    minLength: 8,
    maxLength: 128,
    format: 'password',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @ApiPropertyOptional({
    description:
      'Correo corporativo. Se usa para invitar a la persona al evento de Google Calendar cuando se agenda una reunión; sin él, simplemente no se la invita. Websy tiene dos dominios y el rol decide cuál corresponde: administración (`Admin`, `Owner`) usa `@websy.com.pe`, que es el de Google Workspace, y el resto del equipo `@websydev.site`, que es el del hosting de DonWeb y el que abre el botón de webmail.',
    example: 'aaron@websydev.site',
    maxLength: 150,
    nullable: true,
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string | null;

  @ApiPropertyOptional({
    description:
      'Si está en `false` el usuario no puede iniciar sesión ni renovar el token.',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiProperty({
    description: 'Id del rol. Tiene que existir en `/rol`.',
    example: 1,
  })
  @IsInt()
  @IsPositive()
  roleId: number;
}
