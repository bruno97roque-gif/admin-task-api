import { IsBoolean, IsISO8601, IsOptional } from 'class-validator';

export class MarcarCobroDto {
  @IsBoolean()
  cobrado: boolean;

  // String ISO-8601: el ValidationPipe global no transforma, el servicio la
  // convierte a Date. Si se omite y `cobrado` es true, se usa la fecha de hoy.
  @IsOptional()
  @IsISO8601()
  fechaCobro?: string | null;
}
