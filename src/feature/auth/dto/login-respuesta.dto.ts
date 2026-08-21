import { ApiProperty } from '@nestjs/swagger';

/**
 * Solo documentación: la respuesta real la arma `AuthService.crearSesion`.
 * El refresh token **nunca** viaja acá, va en la cookie httpOnly.
 */
export class UsuarioSesionDto {
  @ApiProperty({ description: 'Id del usuario.', example: 1 })
  id: number;

  @ApiProperty({ description: 'Nombre completo.', example: 'Aaron Jauregui' })
  name: string;

  @ApiProperty({ description: 'Nombre de usuario.', example: 'aaron' })
  user: string;

  @ApiProperty({ description: 'Id del rol asignado.', example: 1 })
  roleId: number;

  @ApiProperty({
    description:
      'Nombre del rol. Es lo que miran los permisos: «Admin» y «Owner» son administración.',
    example: 'Admin',
  })
  roleName: string;
}

export class LoginRespuestaDto {
  @ApiProperty({
    description:
      'Token de acceso. Va en `Authorization: Bearer <token>` en el resto de las rutas.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({
    description: 'Datos del usuario que inició sesión.',
    type: UsuarioSesionDto,
  })
  user: UsuarioSesionDto;
}
