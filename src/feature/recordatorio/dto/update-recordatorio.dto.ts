import { PartialType } from '@nestjs/swagger';
import { CreateRecordatorioDto } from './create-recordatorio.dto';

export class UpdateRecordatorioDto extends PartialType(CreateRecordatorioDto) {}
