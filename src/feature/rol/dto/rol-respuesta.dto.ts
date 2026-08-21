import { ApiProperty } from '@nestjs/swagger';

/** Solo documentación. */
export class RolRespuestaDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ description: 'Nombre del rol.', example: 'Admin' })
  name: string;
}
