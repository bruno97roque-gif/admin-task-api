import { ApiProperty } from '@nestjs/swagger';

/** Solo documentación. La contraseña se omite en todas las consultas. */
export class UserRespuestaDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ description: 'Nombre completo.', example: 'Aaron Jauregui' })
  name: string;

  @ApiProperty({ description: 'Nombre de usuario.', example: 'aaron' })
  user: string;

  @ApiProperty({
    description: 'Correo corporativo, para las invitaciones de calendario.',
    example: 'aaron@websydev.site',
    nullable: true,
  })
  email: string | null;

  @ApiProperty({ description: '¿Puede iniciar sesión?', example: true })
  active: boolean;

  @ApiProperty({ description: 'Id del rol asignado.', example: 1 })
  roleId: number;

  @ApiProperty({
    description:
      'Versión de la foto de perfil, para armar `/user/{id}/foto?v=...`. `null` si no subió ninguna.',
    example: 1758067200000,
    nullable: true,
  })
  fotoVersion: number | null;
}
