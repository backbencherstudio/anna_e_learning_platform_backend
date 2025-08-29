import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UsePipes, ValidationPipe, HttpStatus, HttpCode, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SeriesService } from './series.service';
import { CreateSeriesDto } from './dto/create-series.dto';
import { UpdateSeriesDto } from './dto/update-series.dto';

@Controller('admin/series')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class SeriesController {
  constructor(private readonly seriesService: SeriesService) { }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('thumbnail'))
  async create(
    @Body() createSeriesDto: CreateSeriesDto,
    @UploadedFile() thumbnail: Express.Multer.File,
  ) {
    return this.seriesService.create(createSeriesDto, thumbnail);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
  ) {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    return this.seriesService.findAll(pageNum, limitNum, search);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id') id: string) {
    return this.seriesService.findOne(id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('thumbnail'))
  async update(
    @Param('id') id: string,
    @Body() updateSeriesDto: UpdateSeriesDto,
    @UploadedFile() thumbnail: Express.Multer.File,
  ) {
    return this.seriesService.update(id, updateSeriesDto, thumbnail);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string) {
    return this.seriesService.remove(id);
  }
}
