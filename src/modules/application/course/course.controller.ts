import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UsePipes, ValidationPipe, HttpStatus, HttpCode, UseInterceptors, UploadedFiles, UploadedFile, Req } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { CourseService } from './course.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';


@Controller('user/course')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class CourseController {
  constructor(private readonly courseService: CourseService) { }


  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
  ) {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    return this.courseService.findAll(pageNum, limitNum, search);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id') id: string) {
    return this.courseService.findOne(id);
  }

}