import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsInt,
  IsPositive,
} from 'class-validator';

export class AsignarUsuariosDto {
  @ApiProperty({
    description:
      'Ids a enganchar al proyecto. Es aditivo: no saca a los que ya estaban, y no toca `disenadorId` ni `desarrolladorId`.',
    example: [4, 7],
    type: Number,
    isArray: true,
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsInt({ each: true })
  @IsPositive({ each: true })
  usuariosIds: number[];
}
