import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateRecordatorioDto {
  @ApiProperty({
    description: 'Texto de la nota.',
    example: 'Pedirle al cliente las fotos de la sucursal nueva',
  })
  @IsString()
  @IsNotEmpty()
  descripcion: string;

  @ApiPropertyOptional({
    description: '`true` mientras siga pendiente.',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}
