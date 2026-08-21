// OmitType y PartialType salen de @nestjs/swagger, no de @nestjs/mapped-types:
// heredan las reglas de class-validator igual que aquellos, y además arrastran
// los @ApiProperty del DTO de alta. Con los de mapped-types el cuerpo del PATCH
// salía vacío en la documentación.
import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateProjectDto } from './create-project.dto';

// El plan de cobros no se toca por PATCH: tiene su propia ruta
// (PUT /projects/:id/plan-cobros) porque hay que revalidar la suma de 100.
// `aprobadoPorJefatura` y `abonoInicialCobrado` van con él, y los hitos del
// tramo final (producción, capacitación) tienen sus propias rutas para que
// cada uno deje su fila en el historial.
export class UpdateProjectDto extends PartialType(
  OmitType(CreateProjectDto, [
    'planCobros',
    'aprobadoPorJefatura',
    'abonoInicialCobrado',
  ] as const),
) {}
