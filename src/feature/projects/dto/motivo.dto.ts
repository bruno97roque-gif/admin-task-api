import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Cuerpo compartido por las acciones que solo necesitan una nota para el
 * historial: archivar, reactivar y registrar una ronda de cambios.
 */
export class MotivoDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}
