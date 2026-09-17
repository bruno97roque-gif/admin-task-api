import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { NivelComunicado } from '../../../lib/generated/prisma/client';

export class CreateComunicadoDto {
  @ApiProperty({ example: 'Actualización del sistema', maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @Matches(/\S/, { message: 'El título no puede quedar vacío' })
  titulo: string;

  @ApiProperty({
    example:
      'El viernes a las 7 p. m. vas a tener que volver a iniciar sesión.',
    maxLength: 2000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  @Matches(/\S/, { message: 'El mensaje no puede quedar vacío' })
  mensaje: string;

  @ApiPropertyOptional({
    enum: NivelComunicado,
    enumName: 'NivelComunicado',
    default: NivelComunicado.Info,
    description: 'Los `Urgente` no se pueden cerrar.',
  })
  @IsOptional()
  @IsEnum(NivelComunicado)
  nivel?: NivelComunicado;

  @ApiPropertyOptional({
    description: 'Se muestra en la página de login (lo ve cualquiera).',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  enLogin?: boolean;

  @ApiPropertyOptional({
    description: 'Se muestra arriba, dentro del sistema, a todo el equipo.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  enSistema?: boolean;

  @ApiPropertyOptional({
    description: 'Desde cuándo se muestra. Sin valor, desde ya.',
    example: '2026-09-20T15:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  desde?: string;

  @ApiPropertyOptional({
    description: 'Hasta cuándo. Sin valor, hasta que alguien lo finalice.',
    example: '2026-09-27T15:00:00.000Z',
    nullable: true,
  })
  @IsOptional()
  @IsISO8601()
  hasta?: string | null;

  @ApiPropertyOptional({
    description:
      'Al publicar, deja además una notificación a todos los usuarios activos.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  notificar?: boolean;
}
