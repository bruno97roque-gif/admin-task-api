// PartialType sale de @nestjs/swagger, no de @nestjs/mapped-types: hereda las
// reglas de class-validator igual que aquel, y además arrastra los @ApiProperty
// del DTO de alta. Con el de mapped-types el cuerpo salía vacío en la doc.
import { PartialType } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(CreateUserDto) {}
