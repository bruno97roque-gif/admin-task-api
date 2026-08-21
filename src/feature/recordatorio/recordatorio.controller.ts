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
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { RecordatorioService } from './recordatorio.service';
import { CreateRecordatorioDto } from './dto/create-recordatorio.dto';
import { UpdateRecordatorioDto } from './dto/update-recordatorio.dto';
import { RecordatorioRespuestaDto } from './dto/recordatorio-respuesta.dto';
import { AUTH_BEARER, TAGS } from '../../swagger';

/**
 * Notas sueltas, sin relación con ningún proyecto. Los cinco recordatorios del
 * flujo son otra cosa y salen por `GET /projects/:id/recordatorios`.
 */
@ApiTags(TAGS.recordatorios)
@ApiBearerAuth(AUTH_BEARER)
@Controller('recordatorio')
export class RecordatorioController {
  constructor(private readonly recordatorioService: RecordatorioService) {}

  @Post()
  @ApiOperation({ summary: 'Crear una nota' })
  @ApiCreatedResponse({ type: RecordatorioRespuestaDto })
  create(@Body() createRecordatorioDto: CreateRecordatorioDto) {
    return this.recordatorioService.create(createRecordatorioDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar notas', description: 'Ordenadas por id.' })
  @ApiOkResponse({ type: RecordatorioRespuestaDto, isArray: true })
  findAll() {
    return this.recordatorioService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ver una nota' })
  @ApiParam({ name: 'id', description: 'Id de la nota.', example: 1 })
  @ApiOkResponse({ type: RecordatorioRespuestaDto })
  @ApiNotFoundResponse({ description: 'No existe esa nota.' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.recordatorioService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modificar una nota' })
  @ApiParam({ name: 'id', description: 'Id de la nota.', example: 1 })
  @ApiOkResponse({ type: RecordatorioRespuestaDto })
  @ApiNotFoundResponse({ description: 'No existe esa nota.' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateRecordatorioDto: UpdateRecordatorioDto,
  ) {
    return this.recordatorioService.update(id, updateRecordatorioDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar una nota' })
  @ApiParam({ name: 'id', description: 'Id de la nota.', example: 1 })
  @ApiOkResponse({ type: RecordatorioRespuestaDto })
  @ApiNotFoundResponse({ description: 'No existe esa nota.' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.recordatorioService.remove(id);
  }
}
