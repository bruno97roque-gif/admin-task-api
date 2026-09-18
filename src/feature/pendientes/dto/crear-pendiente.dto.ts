import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { MAXIMO_TEXTO_PENDIENTE } from '../pendientes.reglas';

export class CrearPendienteDto {
  @ApiProperty({
    example: 'Revisar el formulario de contacto en móvil',
    maxLength: MAXIMO_TEXTO_PENDIENTE,
  })
  @IsString()
  @IsNotEmpty({ message: 'Escribe el pendiente' })
  @MaxLength(MAXIMO_TEXTO_PENDIENTE, {
    message: `Como máximo ${MAXIMO_TEXTO_PENDIENTE} caracteres`,
  })
  @Matches(/\S/, { message: 'Escribe el pendiente' })
  texto: string;
}
