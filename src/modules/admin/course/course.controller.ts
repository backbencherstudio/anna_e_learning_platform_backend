import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UsePipes, ValidationPipe, HttpStatus, HttpCode, UseInterceptors, UploadedFiles, UploadedFile, Req } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { CourseService } from './course.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { CreateCourseSectionDto } from './dto/create-course-section.dto';
import { CreateLessonDto } from './dto/create-lesson.dto';

@Controller('admin/course')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class CourseController {
  constructor(private readonly courseService: CourseService) { }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'thumbnail', maxCount: 1 },
      { name: 'courseMedia', maxCount: 10 },
      { name: 'lessonMedia', maxCount: 100 }, // Multiple lessons with media
    ])
  )
  async create(
    @Body() createCourseDto: CreateCourseDto,
    @UploadedFiles() files: {
      thumbnail?: Express.Multer.File[];
      courseMedia?: Express.Multer.File[];
      lessonMedia?: Express.Multer.File[];
    },
    @Req() req: any
  ) {
    const thumbnail = files.thumbnail ? files.thumbnail[0] : null;
    const courseMedia = files.courseMedia || [];
    const lessonMedia = files.lessonMedia || [];

    return this.courseService.create(createCourseDto, thumbnail, courseMedia, lessonMedia);
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
    return this.courseService.findAll(pageNum, limitNum, search);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id') id: string) {
    return this.courseService.findOne(id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'thumbnail', maxCount: 1 },
      { name: 'courseMedia', maxCount: 10 },
    ])
  )
  async update(
    @Param('id') id: string,
    @Body() updateCourseDto: UpdateCourseDto,
    @Req() req: any,
    @UploadedFiles() files: {
      thumbnail?: Express.Multer.File[];
      courseMedia?: Express.Multer.File[];
      lessonMedia?: Express.Multer.File[];
    },
  ) {
    const thumbnail = files.thumbnail ? files.thumbnail[0] : null;
    const courseMedia = files.courseMedia || [];
    const lessonMedia = files.lessonMedia || [];

    return this.courseService.update(id, updateCourseDto, thumbnail, courseMedia, lessonMedia);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string) {
    return this.courseService.remove(id);
  }

}
