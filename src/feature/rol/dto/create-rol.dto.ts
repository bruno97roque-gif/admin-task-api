import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateRolDto {
  @ApiProperty({
    description:
      'Nombre del rol. Es lo que leen los permisos: «Admin» y «Owner» habilitan las rutas de administración (cobros, archivar, reactivar).',
    example: 'Admin',
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;
}
