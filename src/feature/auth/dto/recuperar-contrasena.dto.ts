import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RecuperarContrasenaDto {
  @ApiProperty({
    description: 'Nombre de usuario, tal cual.',
    example: 'aaron',
  })
  @IsString()
  @IsNotEmpty({ message: 'Escribe tu usuario' })
  @MaxLength(50)
  usuario: string;
}
