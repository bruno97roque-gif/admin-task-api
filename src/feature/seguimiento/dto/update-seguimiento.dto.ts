import { PartialType } from '@nestjs/swagger';
import { CreateSeguimientoDto } from './create-seguimiento.dto';

export class UpdateSeguimientoDto extends PartialType(CreateSeguimientoDto) {}
