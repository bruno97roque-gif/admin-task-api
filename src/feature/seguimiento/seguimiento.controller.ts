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
import { SeguimientoService } from './seguimiento.service';
import { CreateSeguimientoDto } from './dto/create-seguimiento.dto';
import { UpdateSeguimientoDto } from './dto/update-seguimiento.dto';
import { SeguimientoRespuestaDto } from './dto/seguimiento-respuesta.dto';
import { AUTH_BEARER, TAGS } from '../../swagger';

@ApiTags(TAGS.seguimientos)
@ApiBearerAuth(AUTH_BEARER)
@Controller('seguimiento')
export class SeguimientoController {
  constructor(private readonly seguimientoService: SeguimientoService) {}

  @Post()
  @ApiOperation({
    summary: 'Crear un seguimiento',
    description:
      'El seguimiento **no mueve el grupo** del proyecto: el grupo se deriva de los bloqueos y los cobros.',
  })
  @ApiCreatedResponse({ type: SeguimientoRespuestaDto })
  create(@Body() createSeguimientoDto: CreateSeguimientoDto) {
    return this.seguimientoService.create(createSeguimientoDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar seguimientos',
    description: 'Ordenados por id.',
  })
  @ApiOkResponse({ type: SeguimientoRespuestaDto, isArray: true })
  findAll() {
    return this.seguimientoService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ver un seguimiento' })
  @ApiParam({ name: 'id', description: 'Id del seguimiento.', example: 1 })
  @ApiOkResponse({ type: SeguimientoRespuestaDto })
  @ApiNotFoundResponse({ description: 'No existe ese seguimiento.' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.seguimientoService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Renombrar un seguimiento' })
  @ApiParam({ name: 'id', description: 'Id del seguimiento.', example: 1 })
  @ApiOkResponse({ type: SeguimientoRespuestaDto })
  @ApiNotFoundResponse({ description: 'No existe ese seguimiento.' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateSeguimientoDto: UpdateSeguimientoDto,
  ) {
    return this.seguimientoService.update(id, updateSeguimientoDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un seguimiento' })
  @ApiParam({ name: 'id', description: 'Id del seguimiento.', example: 1 })
  @ApiOkResponse({ type: SeguimientoRespuestaDto })
  @ApiNotFoundResponse({ description: 'No existe ese seguimiento.' })
  @ApiConflictResponse({
    description: 'Todavía hay proyectos usando ese seguimiento.',
  })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.seguimientoService.remove(id);
  }
}
