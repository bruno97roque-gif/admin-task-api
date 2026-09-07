import { PartialType } from '@nestjs/swagger';
import { CreateReunionDto } from './create-reunion.dto';

export class UpdateReunionDto extends PartialType(CreateReunionDto) {}
