import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { HitoCobro } from '../../../lib/generated/prisma/client';

export class ItemPlanCobrosDto {
  @IsEnum(HitoCobro)
  hito: HitoCobro;

  @IsInt()
  @Min(0)
  @Max(100)
  porcentaje: number;
}

export class DefinirPlanCobrosDto {
  // Los tres hitos son fijos: el plan siempre trae exactamente tres ítems.
  // Que sumen 100 y que el abono inicial no baje del 30% lo valida el
  // servicio con `validarPlanDeCobros`, porque es una regla de negocio.
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => ItemPlanCobrosDto)
  cobros: ItemPlanCobrosDto[];

  /** Única forma de dejar el abono inicial por debajo del 30%. */
  @IsOptional()
  @IsBoolean()
  aprobadoPorJefatura?: boolean;
}
