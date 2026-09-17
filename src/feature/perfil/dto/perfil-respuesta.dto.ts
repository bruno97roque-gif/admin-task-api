import { ApiProperty } from '@nestjs/swagger';

/** Solo documentación. */
export class PerfilRespuestaDto {
  @ApiProperty({ example: 4 })
  id: number;

  @ApiProperty({ example: 'Ana Pérez' })
  name: string;

  @ApiProperty({ description: 'Nombre de usuario.', example: 'ana' })
  user: string;

  @ApiProperty({ example: 'ana@websydev.site', nullable: true })
  email: string | null;

  @ApiProperty({ example: 3 })
  roleId: number;

  @ApiProperty({ example: 'Diseñador' })
  roleName: string;

  @ApiProperty({
    description:
      'Versión de la foto subida, para armar `/user/{id}/foto?v=...`. `null` si no subió ninguna.',
    example: 1758067200000,
    nullable: true,
  })
  fotoVersion: number | null;
}
