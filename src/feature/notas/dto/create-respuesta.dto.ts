import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateRespuestaDto {
  @ApiProperty({
    description: 'Mensaje que se suma al hilo del ticket.',
    example: 'Va dentro del alcance, cambiá el logo y avisame cuando esté.',
    maxLength: 2000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  contenido: string;
}
