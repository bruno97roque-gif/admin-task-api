import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
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
