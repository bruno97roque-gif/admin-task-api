import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Nombre de usuario con el que se ingresa (columna `user`).',
    example: 'aaron',
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  user: string;

  @ApiProperty({
    description:
      'Contraseña en texto plano. Se verifica contra el hash Argon2id.',
    example: 'unaClaveSegura123',
    maxLength: 128,
    format: 'password',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;
}
