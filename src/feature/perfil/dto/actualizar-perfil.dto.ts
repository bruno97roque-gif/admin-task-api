import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class ActualizarPerfilDto {
  @ApiProperty({
    description: 'Nombre que se muestra en el sistema.',
    example: 'Ana Pérez',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  // Al menos un carácter que no sea espacio: «   » no es un nombre.
  @Matches(/\S/, { message: 'El nombre no puede quedar vacío' })
  name: string;
}
