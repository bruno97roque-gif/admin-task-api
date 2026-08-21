import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserRespuestaDto } from './dto/user-respuesta.dto';
import { AUTH_BEARER, TAGS } from '../../swagger';

@ApiTags(TAGS.usuarios)
@ApiBearerAuth(AUTH_BEARER)
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @ApiOperation({
    summary: 'Crear un usuario',
    description:
      'La contraseña se hashea con Argon2id y nunca vuelve en la respuesta.',
  })
  @ApiCreatedResponse({ type: UserRespuestaDto })
  @ApiBadRequestResponse({ description: 'El rol indicado no existe.' })
  @ApiConflictResponse({ description: 'Ya hay un usuario con ese `user`.' })
  create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar usuarios',
    description: 'Ordenados por id.',
  })
  @ApiOkResponse({ type: UserRespuestaDto, isArray: true })
  findAll() {
    return this.userService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ver un usuario' })
  @ApiParam({ name: 'id', description: 'Id del usuario.', example: 1 })
  @ApiOkResponse({ type: UserRespuestaDto })
  @ApiNotFoundResponse({ description: 'No existe ese usuario.' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.userService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Modificar un usuario',
    description:
      'Acepta los mismos campos que el alta, todos opcionales; si viene `password` se vuelve a hashear. La ruta no exige un rol determinado: la puede llamar cualquier usuario autenticado, sobre cualquier id.',
  })
  @ApiParam({ name: 'id', description: 'Id del usuario.', example: 1 })
  @ApiOkResponse({ type: UserRespuestaDto })
  @ApiBadRequestResponse({ description: 'El rol indicado no existe.' })
  @ApiNotFoundResponse({ description: 'No existe ese usuario.' })
  @ApiConflictResponse({ description: 'Ya hay un usuario con ese `user`.' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.userService.update(id, updateUserDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Eliminar un usuario',
    description:
      'Borrado real. La traza que dejó en historial, recordatorios y cotizaciones sobrevive con el usuario en `null`.',
  })
  @ApiParam({ name: 'id', description: 'Id del usuario.', example: 1 })
  @ApiOkResponse({ type: UserRespuestaDto })
  @ApiNotFoundResponse({ description: 'No existe ese usuario.' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.userService.remove(id);
  }
}
