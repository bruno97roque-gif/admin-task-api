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
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { RolService } from './rol.service';
import { CreateRolDto } from './dto/create-rol.dto';
import { UpdateRolDto } from './dto/update-rol.dto';
import { RolRespuestaDto } from './dto/rol-respuesta.dto';
import { AUTH_BEARER, TAGS } from '../../swagger';

@ApiTags(TAGS.roles)
@ApiBearerAuth(AUTH_BEARER)
@Controller('rol')
export class RolController {
  constructor(private readonly rolService: RolService) {}

  @Post()
  @ApiOperation({ summary: 'Crear un rol' })
  @ApiCreatedResponse({ type: RolRespuestaDto })
  create(@Body() createRolDto: CreateRolDto) {
    return this.rolService.create(createRolDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar roles', description: 'Ordenados por id.' })
  @ApiOkResponse({ type: RolRespuestaDto, isArray: true })
  findAll() {
    return this.rolService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ver un rol' })
  @ApiParam({ name: 'id', description: 'Id del rol.', example: 1 })
  @ApiOkResponse({ type: RolRespuestaDto })
  @ApiNotFoundResponse({ description: 'No existe ese rol.' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.rolService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Renombrar un rol',
    description:
      'Cuidado: los permisos se resuelven por **nombre**, así que renombrar «Admin» le saca el acceso a las rutas de administración.',
  })
  @ApiParam({ name: 'id', description: 'Id del rol.', example: 1 })
  @ApiOkResponse({ type: RolRespuestaDto })
  @ApiNotFoundResponse({ description: 'No existe ese rol.' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateRolDto: UpdateRolDto,
  ) {
    return this.rolService.update(id, updateRolDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un rol' })
  @ApiParam({ name: 'id', description: 'Id del rol.', example: 1 })
  @ApiOkResponse({ type: RolRespuestaDto })
  @ApiNotFoundResponse({ description: 'No existe ese rol.' })
  @ApiConflictResponse({
    description: 'El rol todavía tiene usuarios asignados.',
  })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.rolService.remove(id);
  }
}
