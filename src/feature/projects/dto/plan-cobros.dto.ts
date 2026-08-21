import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty({
    description:
      'Cuál de los tres momentos de cobro. Cada hito habilita una etapa: `AbonoInicial` el brief, `AprobacionDiseno` el desarrollo, `Entrega` el cierre del proyecto.',
    enum: HitoCobro,
    enumName: 'HitoCobro',
    example: HitoCobro.AbonoInicial,
  })
  @IsEnum(HitoCobro)
  hito: HitoCobro;

  @ApiProperty({
    description:
      'Porcentaje del total que corresponde a este hito. El sistema no maneja montos en dinero, solo el %.',
    example: 50,
    minimum: 0,
    maximum: 100,
  })
  @IsInt()
  @Min(0)
  @Max(100)
  porcentaje: number;
}

export class DefinirPlanCobrosDto {
  // Los tres hitos son fijos: el plan siempre trae exactamente tres ítems.
  // Que sumen 100 y que el abono inicial no baje del 30% lo valida el
  // servicio con `validarPlanDeCobros`, porque es una regla de negocio.
  @ApiProperty({
    description:
      'Los tres hitos, exactamente tres ítems. Tienen que sumar 100 y el abono inicial no puede bajar de 30. Redefinir el plan respeta lo que ya estaba cobrado: solo cambia el porcentaje.',
    type: ItemPlanCobrosDto,
    isArray: true,
    minItems: 3,
    maxItems: 3,
  })
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => ItemPlanCobrosDto)
  cobros: ItemPlanCobrosDto[];

  /** Única forma de dejar el abono inicial por debajo del 30%. */
  @ApiPropertyOptional({
    description: 'Única forma de dejar el abono inicial por debajo del 30%.',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  aprobadoPorJefatura?: boolean;
}
