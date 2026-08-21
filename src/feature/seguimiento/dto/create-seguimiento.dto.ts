import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateSeguimientoDto {
  @ApiProperty({
    description:
      'La «acción de hoy» sobre el cliente. Los valores son imperativos: «Congelar Hoy» significa *andá a congelarlo*, no que ya esté congelado.',
    example: 'Llamar',
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;
}
