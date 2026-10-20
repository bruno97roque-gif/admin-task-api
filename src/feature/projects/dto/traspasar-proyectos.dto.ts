import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Pasarle a otra persona los proyectos de alguien que deja el equipo (o que
 * está sobrecargado). Se puede mandar un destino por puesto: lo que tenía como
 * diseñador va a uno y lo que tenía como desarrollador a otro.
 */
export class TraspasarProyectosDto {
  @ApiProperty({
    description: 'Id de la persona cuyos proyectos se traspasan.',
    example: 11,
  })
  @IsInt()
  @IsPositive()
  deUsuarioId: number;

  @ApiPropertyOptional({
    description:
      'Quién recibe los proyectos donde la persona figura como diseñador. Si no viene, esos no se tocan.',
    example: 16,
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  disenadorDestinoId?: number;

  @ApiPropertyOptional({
    description:
      'Quién recibe los proyectos donde la persona figura como desarrollador. Si no viene, esos no se tocan.',
    example: 14,
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  desarrolladorDestinoId?: number;

  @ApiPropertyOptional({
    description: 'Motivo que queda en el historial de cada proyecto movido.',
    example: 'Aaron deja el equipo',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  motivo?: string;
}
