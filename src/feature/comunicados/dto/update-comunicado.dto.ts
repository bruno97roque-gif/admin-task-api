import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateComunicadoDto } from './create-comunicado.dto';

/** `notificar` es solo para el alta: editar no vuelve a avisar a todos. */
export class UpdateComunicadoDto extends PartialType(
  OmitType(CreateComunicadoDto, ['notificar'] as const),
) {}
