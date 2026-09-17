import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class FotoPerfilDto {
  @ApiProperty({
    description:
      'La foto como data URL (`data:image/webp;base64,...`). WebP, JPG o PNG, hasta 300 KB. El front la manda ya recortada y achicada.',
    example: 'data:image/webp;base64,UklGRi...',
  })
  @IsString()
  // 300 KB en base64 son unos 400 000 caracteres, más el encabezado.
  @MaxLength(420_000, {
    message: 'La foto pesa demasiado (máximo 300 KB)',
  })
  imagen: string;
}
