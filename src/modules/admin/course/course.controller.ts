import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UsePipes, ValidationPipe, HttpStatus, HttpCode, UseInterceptors, UploadedFiles, UploadedFile, Req } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { CourseService } from './course.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';


@Controller('admin/course')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class CourseController {
  constructor(private readonly courseService: CourseService) { }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'thumbnail', maxCount: 1 },
      // Support up to 10 modules with their files
      { name: 'module_0_introVideo', maxCount: 1 },
      { name: 'module_0_endVideo', maxCount: 1 },
      { name: 'module_0_lessonFiles', maxCount: 50 },
      { name: 'module_1_introVideo', maxCount: 1 },
      { name: 'module_1_endVideo', maxCount: 1 },
      { name: 'module_1_lessonFiles', maxCount: 50 },
      { name: 'module_2_introVideo', maxCount: 1 },
      { name: 'module_2_endVideo', maxCount: 1 },
      { name: 'module_2_lessonFiles', maxCount: 50 },
      { name: 'module_3_introVideo', maxCount: 1 },
      { name: 'module_3_endVideo', maxCount: 1 },
      { name: 'module_3_lessonFiles', maxCount: 50 },
      { name: 'module_4_introVideo', maxCount: 1 },
      { name: 'module_4_endVideo', maxCount: 1 },
      { name: 'module_4_lessonFiles', maxCount: 50 },
      { name: 'module_5_introVideo', maxCount: 1 },
      { name: 'module_5_endVideo', maxCount: 1 },
      { name: 'module_5_lessonFiles', maxCount: 50 },
      { name: 'module_6_introVideo', maxCount: 1 },
      { name: 'module_6_endVideo', maxCount: 1 },
      { name: 'module_6_lessonFiles', maxCount: 50 },
      { name: 'module_7_introVideo', maxCount: 1 },
      { name: 'module_7_endVideo', maxCount: 1 },
      { name: 'module_7_lessonFiles', maxCount: 50 },
      { name: 'module_8_introVideo', maxCount: 1 },
      { name: 'module_8_endVideo', maxCount: 1 },
      { name: 'module_8_lessonFiles', maxCount: 50 },
      { name: 'module_9_introVideo', maxCount: 1 },
      { name: 'module_9_endVideo', maxCount: 1 },
      { name: 'module_9_lessonFiles', maxCount: 50 },
    ])
  )
  async create(
    @Body() createCourseDto: CreateCourseDto,
    @UploadedFiles()
    files: {
      thumbnail?: Express.Multer.File[];
      module_0_introVideo?: Express.Multer.File[];
      module_0_endVideo?: Express.Multer.File[];
      module_0_lessonFiles?: Express.Multer.File[];
      module_1_introVideo?: Express.Multer.File[];
      module_1_endVideo?: Express.Multer.File[];
      module_1_lessonFiles?: Express.Multer.File[];
      module_2_introVideo?: Express.Multer.File[];
      module_2_endVideo?: Express.Multer.File[];
      module_2_lessonFiles?: Express.Multer.File[];
      module_3_introVideo?: Express.Multer.File[];
      module_3_endVideo?: Express.Multer.File[];
      module_3_lessonFiles?: Express.Multer.File[];
      module_4_introVideo?: Express.Multer.File[];
      module_4_endVideo?: Express.Multer.File[];
      module_4_lessonFiles?: Express.Multer.File[];
      module_5_introVideo?: Express.Multer.File[];
      module_5_endVideo?: Express.Multer.File[];
      module_5_lessonFiles?: Express.Multer.File[];
      module_6_introVideo?: Express.Multer.File[];
      module_6_endVideo?: Express.Multer.File[];
      module_6_lessonFiles?: Express.Multer.File[];
      module_7_introVideo?: Express.Multer.File[];
      module_7_endVideo?: Express.Multer.File[];
      module_7_lessonFiles?: Express.Multer.File[];
      module_8_introVideo?: Express.Multer.File[];
      module_8_endVideo?: Express.Multer.File[];
      module_8_lessonFiles?: Express.Multer.File[];
      module_9_introVideo?: Express.Multer.File[];
      module_9_endVideo?: Express.Multer.File[];
      module_9_lessonFiles?: Express.Multer.File[];
    },
    @Req() req: any
  ) {
    const thumbnail = files.thumbnail?.[0] || null;
    const moduleFiles = this.parseModuleFilesFromFiles(files, createCourseDto.modules?.length || 0);
    return this.courseService.create(createCourseDto, thumbnail, moduleFiles);
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
    ])
  )
  async update(
    @Param('id') id: string,
    @Body() updateCourseDto: UpdateCourseDto,
    @Req() req: any,
    @UploadedFiles() files: {
      thumbnail?: Express.Multer.File[];
    },
  ) {
    const thumbnail = files.thumbnail ? files.thumbnail[0] : null;

    return this.courseService.update(id, updateCourseDto, thumbnail);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string) {
    return this.courseService.remove(id);
  }

  /**
   * Parse module files from uploaded files
   * Supports up to 10 modules with intro videos, end videos, and lesson files
   */
  private parseModuleFilesFromFiles(files: any, moduleCount: number) {
    const moduleFiles = [];

    // Parse files for each module
    for (let i = 0; i < moduleCount && i < 10; i++) {
      const introVideo = files[`module_${i}_introVideo`] ? files[`module_${i}_introVideo`][0] : null;
      const endVideo = files[`module_${i}_endVideo`] ? files[`module_${i}_endVideo`][0] : null;
      const lessonFiles = files[`module_${i}_lessonFiles`] || [];

      // Only add module if it has any files
      if (introVideo || endVideo || (lessonFiles && lessonFiles.length > 0)) {
        moduleFiles.push({
          moduleIndex: i,
          introVideo,
          endVideo,
          lessonFiles: lessonFiles,
        });
      }
    }

    return moduleFiles;
  }
}