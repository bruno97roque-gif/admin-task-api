import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateNotaDto {
  @ApiProperty({
    description:
      'Proyecto sobre el que trata la nota. El autor tiene que estar asignado a él.',
    example: 12,
  })
  @IsInt()
  proyectoId: number;

  @ApiProperty({
    description: 'Texto de la nota para administración.',
    example:
      'El cliente pidió cambiar el logo del header, ¿lo cotizamos aparte?',
    maxLength: 2000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  contenido: string;
}
