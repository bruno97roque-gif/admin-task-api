import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CambiarContrasenaDto {
  @ApiProperty({ description: 'La contraseña actual.', example: 'actual123' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  actual: string;

  @ApiProperty({
    description: 'La contraseña nueva, de 8 a 128 caracteres.',
    example: 'nueva-segura-2026',
    minLength: 8,
    maxLength: 128,
  })
  @IsString()
  @MinLength(8, {
    message: 'La contraseña nueva tiene que tener al menos 8 caracteres',
  })
  @MaxLength(128)
  nueva: string;
}
