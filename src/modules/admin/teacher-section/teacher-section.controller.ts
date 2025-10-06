import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UsePipes, ValidationPipe, HttpCode, HttpStatus, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TeacherSectionService } from './teacher-section.service';
import { CreateTeacherSectionDto } from './dto/create-teacher-section.dto';
import { UpdateTeacherSectionDto } from './dto/update-teacher-section.dto';

@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
@Controller('admin/teacher-section')
export class TeacherSectionController {
  constructor(private readonly teacherSectionService: TeacherSectionService) { }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  create(
    @Body() createTeacherSectionDto: CreateTeacherSectionDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.teacherSectionService.create(createTeacherSectionDto, file);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('section_type') section_type?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.teacherSectionService.findAll(pageNum, limitNum, search, section_type);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  findOne(@Param('id') id: string) {
    return this.teacherSectionService.findOne(id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  update(
    @Param('id') id: string,
    @Body() updateTeacherSectionDto: UpdateTeacherSectionDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.teacherSectionService.update(id, updateTeacherSectionDto, file);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string) {
    return this.teacherSectionService.remove(id);
  }
}
