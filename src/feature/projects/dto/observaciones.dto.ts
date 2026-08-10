import { IsBoolean, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Observaciones del cliente sobre la web presentada (nodos B5 y B6). Son
 * distintas de las rondas de cambios de diseño: aquellas ocurren en la Fase 1,
 * contra el diseño; estas en la Fase 2, contra la web ya desarrollada.
 *
 * Si quedan fuera del alcance aprobado se registra una cotización adicional y
 * **el proyecto igual continúa** hacia el cobro de entrega: el diagrama no lo
 * frena ahí.
 */
export class ObservacionesDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  detalle: string;

  @IsBoolean()
  dentroDelAlcance: boolean;
}
