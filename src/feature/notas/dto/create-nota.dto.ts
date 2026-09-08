import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { CategoriaNota } from '../../../lib/generated/prisma/client';

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

  @ApiPropertyOptional({
    description:
      'De qué trata el ticket. Ordena la bandeja de administración: los bloqueos van primero. Omitirlo lo deja en `Otro`.',
    enum: CategoriaNota,
    enumName: 'CategoriaNota',
    example: CategoriaNota.Consulta,
  })
  @IsOptional()
  @IsEnum(CategoriaNota)
  categoria?: CategoriaNota;
}
