import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Reasigna al diseñador y/o al desarrollador manteniendo `usuarios_proyectos`
 * en sincronía: el responsable saliente se desengancha del equipo y el
 * entrante se engancha, en la misma transacción. Omitir una clave la deja
 * como está; mandarla en `null` deja el puesto vacante.
 */
export class AsignarResponsablesDto {
  @ApiPropertyOptional({
    description:
      'Diseñador nuevo. `null` deja el puesto vacante. Omitirlo no toca al que ya estaba.',
    example: 16,
    nullable: true,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  disenadorId?: number | null;

  @ApiPropertyOptional({
    description: 'Desarrollador nuevo. Mismo criterio que el diseñador.',
    example: 11,
    nullable: true,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  desarrolladorId?: number | null;

  @ApiPropertyOptional({
    description: 'Nota para el historial.',
    example: 'Juan sale del proyecto, lo toma Gustavo',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}
