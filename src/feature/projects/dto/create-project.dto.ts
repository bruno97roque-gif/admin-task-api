import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  EstadoProyecto,
  Grupo,
  Tecnologia,
  TipoProyecto,
} from '../../../lib/generated/prisma/client';
import { ItemPlanCobrosDto } from './plan-cobros.dto';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  estadoPago?: string;

  @IsOptional()
  @IsEnum(EstadoProyecto)
  estadoProyecto?: EstadoProyecto;

  @IsString()
  @IsNotEmpty()
  descripcion: string;

  @IsOptional()
  @IsEnum(Tecnologia)
  tecnologia?: Tecnologia;

  // Decide si el proyecto pasa por taxonomía y si tiene carga de productos.
  // Dejarlo sin cargar es válido (los proyectos viejos lo tienen en null): en
  // ese caso no se fuerza ninguna de las dos ramas.
  @IsOptional()
  @IsEnum(TipoProyecto)
  tipoProyecto?: TipoProyecto;

  // El grupo se desprende de la etapa y del bloqueo: si se omite, el servicio
  // lo calcula con `derivarGrupo`. Mandarlo explícito sigue siendo la salida
  // manual para los casos que haya que forzar.
  @IsOptional()
  @IsEnum(Grupo)
  grupo?: Grupo;

  @IsInt()
  @IsPositive()
  seguimientoId: number;

  /** Diseñador asignado en el registro del proyecto. No rota. */
  @IsOptional()
  @IsInt()
  @IsPositive()
  disenadorId?: number | null;

  /** Desarrollador asignado en el registro del proyecto. No rota. */
  @IsOptional()
  @IsInt()
  @IsPositive()
  desarrolladorId?: number | null;

  /** Logo y fotos de banners y secciones. Sin esto no se avanza al diseño. */
  @IsOptional()
  @IsBoolean()
  materialMarcaRecibido?: boolean;

  /** Plantilla llena y fotos de producto. Solo frena la carga de productos. */
  @IsOptional()
  @IsBoolean()
  catalogoRecibido?: boolean;

  /** Se persigue recién en el tramo final, antes de subir a producción. */
  @IsOptional()
  @IsBoolean()
  hostingContratado?: boolean;

  /**
   * Plan de cobros del proyecto. Si se manda, el servicio valida que los tres
   * porcentajes sumen 100 y que el abono inicial no baje del 30%.
   */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => ItemPlanCobrosDto)
  planCobros?: ItemPlanCobrosDto[];

  /**
   * Única forma de dejar el abono inicial por debajo del 30% al dar de alta el
   * proyecto. Antes solo existía en `PUT /projects/:id/plan-cobros`, así que un
   * proyecto aprobado por jefatura había que crearlo y corregirlo después.
   */
  @IsOptional()
  @IsBoolean()
  aprobadoPorJefatura?: boolean;

  /**
   * Marca el abono inicial como cobrado en el alta. El nodo «Registro» del
   * diagrama define el plan **y** registra el abono en el mismo momento; sin
   * esto hacían falta dos llamadas y el proyecto no podía pasar al brief.
   */
  @IsOptional()
  @IsBoolean()
  abonoInicialCobrado?: boolean;

  @IsString()
  @IsNotEmpty()
  comentario: string;

  // El cliente lo manda a veces como number (ej. 3) y la columna es String:
  // se normaliza antes de validar para no rechazarlo con un 400.
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'number' ? String(value) : value,
  )
  @IsString()
  @MaxLength(50)
  diasSinResponder?: string;

  // Se acepta como string ISO-8601 ("2026-09-30" o con hora) porque el
  // ValidationPipe global no tiene transform: el servicio la convierte a Date.
  // null la deja sin fecha de entrega.
  @IsOptional()
  @IsISO8601()
  fechaEntrega?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @IsPositive({ each: true })
  usuariosIds?: number[];
}
