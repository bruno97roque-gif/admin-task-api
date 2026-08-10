import { OmitType, PartialType } from '@nestjs/mapped-types';
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
