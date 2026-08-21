import { ApiProperty } from '@nestjs/swagger';

/** Solo documentación. La contraseña se omite en todas las consultas. */
export class UserRespuestaDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ description: 'Nombre completo.', example: 'Aaron Jauregui' })
  name: string;

  @ApiProperty({ description: 'Nombre de usuario.', example: 'aaron' })
  user: string;

  @ApiProperty({ description: '¿Puede iniciar sesión?', example: true })
  active: boolean;

  @ApiProperty({ description: 'Id del rol asignado.', example: 1 })
  roleId: number;
}
