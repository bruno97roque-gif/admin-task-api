import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty({
    description: 'Nombre del proyecto o del cliente.',
    example: 'Panadería La Espiga',
    maxLength: 150,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({
    description:
      'Texto libre heredado de la planilla. Se conserva por compatibilidad, pero la fuente de verdad del cobro es `planCobros`.',
    example: '50%',
    maxLength: 20,
    default: '50%',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  estadoPago?: string;

  @ApiPropertyOptional({
    description:
      'Etapa en la que arranca. Si se omite se crea en `Registro`. Pedir una etapa más adelantada obliga a cumplir sus compuertas (cobro del hito, material de marca, etc.).',
    enum: EstadoProyecto,
    enumName: 'EstadoProyecto',
    example: EstadoProyecto.Registro,
  })
  @IsOptional()
  @IsEnum(EstadoProyecto)
  estadoProyecto?: EstadoProyecto;

  @ApiProperty({
    description: 'Qué se va a hacer.',
    example: 'Tienda online con catálogo de 120 productos y pasarela de pago.',
  })
  @IsString()
  @IsNotEmpty()
  descripcion: string;

  @ApiPropertyOptional({
    description: 'Con qué se construye.',
    enum: Tecnologia,
    enumName: 'Tecnologia',
    example: Tecnologia.WordPress,
  })
  @IsOptional()
  @IsEnum(Tecnologia)
  tecnologia?: Tecnologia;

  // Decide si el proyecto pasa por taxonomía y si tiene carga de productos.
  // Dejarlo sin cargar es válido (los proyectos viejos lo tienen en null): en
  // ese caso no se fuerza ninguna de las dos ramas.
  @ApiPropertyOptional({
    description:
      'Decide dos bifurcaciones: `Informativa` saltea la taxonomía, `Ecommerce` la exige y es el único con catálogo y carga de productos. Omitirlo deja el proyecto sin rama forzada.',
    enum: TipoProyecto,
    enumName: 'TipoProyecto',
    example: TipoProyecto.Ecommerce,
  })
  @IsOptional()
  @IsEnum(TipoProyecto)
  tipoProyecto?: TipoProyecto;

  // El grupo se desprende de la etapa y del bloqueo: si se omite, el servicio
  // lo calcula con `derivarGrupo`. Mandarlo explícito sigue siendo la salida
  // manual para los casos que haya que forzar.
  @ApiPropertyOptional({
    description:
      'Normalmente **no se manda**: el sistema lo deriva de los bloqueos y los cobros (A produce, B espera material, C no pagó / sin hosting / no responde). Mandarlo explícito es la salida manual para forzar un caso.',
    enum: Grupo,
    enumName: 'Grupo',
    example: Grupo.A,
  })
  @IsOptional()
  @IsEnum(Grupo)
  grupo?: Grupo;

  @ApiProperty({
    description: 'Id de la acción de hoy. Tiene que existir en `/seguimiento`.',
    example: 1,
  })
  @IsInt()
  @IsPositive()
  seguimientoId: number;

  /** Diseñador asignado en el registro del proyecto. No rota. */
  @ApiPropertyOptional({
    description:
      'Diseñador asignado en el registro. No rota, pero se puede reasignar y queda en el historial.',
    example: 4,
    nullable: true,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  disenadorId?: number | null;

  /** Desarrollador asignado en el registro del proyecto. No rota. */
  @ApiPropertyOptional({
    description:
      'Desarrollador asignado en el registro. Mismo criterio que el diseñador.',
    example: 7,
    nullable: true,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  desarrolladorId?: number | null;

  /** Logo y fotos de banners y secciones. Sin esto no se avanza al diseño. */
  @ApiPropertyOptional({
    description:
      'Logo y fotos de banners y secciones. Sin esto no se entra a ninguna de las tres etapas de diseño, y el proyecto cae al Grupo B.',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  materialMarcaRecibido?: boolean;

  /** Plantilla llena y fotos de producto. Solo frena la carga de productos. */
  @ApiPropertyOptional({
    description:
      'Plantilla llena y fotos de producto (solo e-commerce). Frena únicamente la carga de productos: el desarrollo sigue y el proyecto se queda en Grupo A.',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  catalogoRecibido?: boolean;

  /** Se persigue recién en el tramo final, antes de subir a producción. */
  @ApiPropertyOptional({
    description:
      'Se persigue recién en `Desarrollo`, antes de subir a producción. Mientras falte en ese tramo el proyecto va al Grupo C.',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  hostingContratado?: boolean;

  /**
   * Plan de cobros del proyecto. Si se manda, el servicio valida que los tres
   * porcentajes sumen 100 y que el abono inicial no baje del 30%.
   */
  @ApiPropertyOptional({
    description:
      'Los tres hitos de cobro, exactamente tres ítems. Tienen que sumar 100 y el abono inicial no puede bajar de 30 (salvo `aprobadoPorJefatura`). Cargarlo acá es lo que mete al proyecto en el flujo nuevo: sin plan de cobros las compuertas no rigen.',
    type: ItemPlanCobrosDto,
    isArray: true,
    minItems: 3,
    maxItems: 3,
  })
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
  @ApiPropertyOptional({
    description: 'Única forma de dejar el abono inicial por debajo del 30%.',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  aprobadoPorJefatura?: boolean;

  /**
   * Marca el abono inicial como cobrado en el alta. El nodo «Registro» del
   * diagrama define el plan **y** registra el abono en el mismo momento; sin
   * esto hacían falta dos llamadas y el proyecto no podía pasar al brief.
   */
  @ApiPropertyOptional({
    description:
      'Marca el abono inicial como cobrado en el mismo alta, como hace el nodo «Registro» del diagrama. Sin esto el proyecto no puede pasar al brief hasta una segunda llamada.',
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  abonoInicialCobrado?: boolean;

  @ApiProperty({
    description: 'Notas internas del proyecto.',
    example: 'El cliente prefiere que lo llamemos después de las 15h.',
  })
  @IsString()
  @IsNotEmpty()
  comentario: string;

  // El cliente lo manda a veces como number (ej. 3) y la columna es String:
  // se normaliza antes de validar para no rechazarlo con un 400.
  @ApiPropertyOptional({
    description:
      'Días sin responder que carga administración a mano. Acepta número o texto (un `3` se normaliza a `"3"`). El contador automático es `diasEsperandoAlCliente`, que sale de los recordatorios.',
    example: '3',
    maxLength: 50,
  })
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
  @ApiPropertyOptional({
    description:
      'Fecha de entrega comprometida, en ISO-8601. `null` la deja sin fecha.',
    example: '2026-09-30',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsISO8601()
  fechaEntrega?: string | null;

  @ApiPropertyOptional({
    description:
      'Usuarios que se enganchan al proyecto por la tabla de asignación, además del diseñador y el desarrollador del registro.',
    example: [4, 7],
    type: Number,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @IsPositive({ each: true })
  usuariosIds?: number[];
}
