import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Marca si el cliente ya entregó lo que se le estaba esperando. Cada uno de
 * estos campos abre o cierra el recordatorio correspondiente y puede mover el
 * grupo del proyecto, por eso no se tocan con un `PATCH` genérico.
 */
export class BloqueoClienteDto {
  @IsBoolean()
  recibido: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}
