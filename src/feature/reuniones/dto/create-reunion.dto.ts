import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateReunionDto {
  @ApiProperty({
    description: 'Título de la reunión.',
    example: 'Presentación de avance de diseño',
    maxLength: 150,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  titulo: string;

  @ApiPropertyOptional({
    description: 'Temario o comentario libre.',
    example: 'Mostrar las dos propuestas de home y cerrar paleta.',
  })
  @IsOptional()
  @IsString()
  descripcion?: string | null;

  @ApiProperty({
    description: 'Fecha y hora de inicio, en ISO 8601.',
    example: '2026-09-10T15:00:00.000Z',
  })
  @IsISO8601()
  fecha: string;

  @ApiPropertyOptional({
    description:
      'Link de Google Meet. Se puede dejar vacío: quien agenda sin cuenta de Workspace no tiene cómo generarlo, así que la reunión queda pendiente de que administración cree el evento en Calendar (donde Meet se genera solo) y vuelva a cargar el link acá.',
    example: 'https://meet.google.com/abc-defg-hij',
    default: '',
  })
  @IsOptional()
  // La cadena vacía es el «todavía no hay link»: se acepta y saltea el resto.
  @ValidateIf((_, value) => value !== '' && value !== null)
  @IsUrl({ require_protocol: true })
  @Matches(/^https:\/\/meet\.google\.com\//, {
    message:
      'linkMeet debe ser un enlace de Google Meet (https://meet.google.com/...)',
  })
  linkMeet?: string | null;

  @ApiPropertyOptional({
    description: 'Proyecto al que pertenece la reunión, si corresponde.',
    example: 12,
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  proyectoId?: number | null;

  @ApiProperty({
    description:
      'Ids de los usuarios convocados. Cada uno recibe una notificación.',
    example: [4, 7],
    type: [Number],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsInt({ each: true })
  participantesIds: number[];
}
