import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UsePipes, ValidationPipe, HttpStatus, HttpCode, UseInterceptors, UploadedFiles, UploadedFile, Req, Logger, UseGuards } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { SeriesService } from './series.service';
import { CreateSeriesDto } from './dto/create-series.dto';
import { UpdateSeriesDto } from './dto/update-series.dto';
import { multerConfig } from '../../../config/multer.config';
import { CreateCourseDto } from './dto/create-course.dto';
import { CreateLessonFileDto } from './dto/create-lesson-file.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { Roles } from 'src/common/guard/role/roles.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/role/roles.guard';
import { Role } from 'src/common/guard/role/role.enum';


@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/series')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class SeriesController {
  private readonly logger = new Logger(SeriesController.name);

  constructor(
    private readonly seriesService: SeriesService,
  ) { }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'thumbnail', maxCount: 1 },
      // Support up to 10 courses with their files
      { name: 'course_0_introVideo', maxCount: 1 },
      { name: 'course_0_endVideo', maxCount: 1 },
      { name: 'course_0_videoFiles', maxCount: 50 },
      { name: 'course_0_docFiles', maxCount: 50 },
      { name: 'course_1_introVideo', maxCount: 1 },
      { name: 'course_1_endVideo', maxCount: 1 },
      { name: 'course_1_videoFiles', maxCount: 50 },
      { name: 'course_1_docFiles', maxCount: 50 },
      { name: 'course_2_introVideo', maxCount: 1 },
      { name: 'course_2_endVideo', maxCount: 1 },
      { name: 'course_2_videoFiles', maxCount: 50 },
      { name: 'course_2_docFiles', maxCount: 50 },
      { name: 'course_3_introVideo', maxCount: 1 },
      { name: 'course_3_endVideo', maxCount: 1 },
      { name: 'course_3_videoFiles', maxCount: 50 },
      { name: 'course_3_docFiles', maxCount: 50 },
      { name: 'course_4_introVideo', maxCount: 1 },
      { name: 'course_4_endVideo', maxCount: 1 },
      { name: 'course_4_videoFiles', maxCount: 50 },
      { name: 'course_4_docFiles', maxCount: 50 },
      { name: 'course_5_introVideo', maxCount: 1 },
      { name: 'course_5_endVideo', maxCount: 1 },
      { name: 'course_5_videoFiles', maxCount: 50 },
      { name: 'course_5_docFiles', maxCount: 50 },
      { name: 'course_6_introVideo', maxCount: 1 },
      { name: 'course_6_endVideo', maxCount: 1 },
      { name: 'course_6_videoFiles', maxCount: 50 },
      { name: 'course_6_docFiles', maxCount: 50 },
      { name: 'course_7_introVideo', maxCount: 1 },
      { name: 'course_7_endVideo', maxCount: 1 },
      { name: 'course_7_videoFiles', maxCount: 50 },
      { name: 'course_7_docFiles', maxCount: 50 },
      { name: 'course_8_introVideo', maxCount: 1 },
      { name: 'course_8_endVideo', maxCount: 1 },
      { name: 'course_8_videoFiles', maxCount: 50 },
      { name: 'course_8_docFiles', maxCount: 50 },
      { name: 'course_9_introVideo', maxCount: 1 },
      { name: 'course_9_endVideo', maxCount: 1 },
      { name: 'course_9_videoFiles', maxCount: 50 },
      { name: 'course_9_docFiles', maxCount: 50 },
    ], multerConfig)
  )
  async create(
    @Body() createSeriesDto: CreateSeriesDto,
    @UploadedFiles()
    files: {
      thumbnail?: Express.Multer.File[];
      course_0_introVideo?: Express.Multer.File[];
      course_0_endVideo?: Express.Multer.File[];
      course_0_videoFiles?: Express.Multer.File[];
      course_0_docFiles?: Express.Multer.File[];
      course_1_introVideo?: Express.Multer.File[];
      course_1_endVideo?: Express.Multer.File[];
      course_1_videoFiles?: Express.Multer.File[];
      course_1_docFiles?: Express.Multer.File[];
      course_2_introVideo?: Express.Multer.File[];
      course_2_endVideo?: Express.Multer.File[];
      course_2_videoFiles?: Express.Multer.File[];
      course_2_docFiles?: Express.Multer.File[];
      course_3_introVideo?: Express.Multer.File[];
      course_3_endVideo?: Express.Multer.File[];
      course_3_videoFiles?: Express.Multer.File[];
      course_3_docFiles?: Express.Multer.File[];
      course_4_introVideo?: Express.Multer.File[];
      course_4_endVideo?: Express.Multer.File[];
      course_4_videoFiles?: Express.Multer.File[];
      course_4_docFiles?: Express.Multer.File[];
      course_5_introVideo?: Express.Multer.File[];
      course_5_endVideo?: Express.Multer.File[];
      course_5_videoFiles?: Express.Multer.File[];
      course_5_docFiles?: Express.Multer.File[];
      course_6_introVideo?: Express.Multer.File[];
      course_6_endVideo?: Express.Multer.File[];
      course_6_videoFiles?: Express.Multer.File[];
      course_6_docFiles?: Express.Multer.File[];
      course_7_introVideo?: Express.Multer.File[];
      course_7_endVideo?: Express.Multer.File[];
      course_7_videoFiles?: Express.Multer.File[];
      course_7_docFiles?: Express.Multer.File[];
      course_8_introVideo?: Express.Multer.File[];
      course_8_endVideo?: Express.Multer.File[];
      course_8_videoFiles?: Express.Multer.File[];
      course_8_docFiles?: Express.Multer.File[];
      course_9_introVideo?: Express.Multer.File[];
      course_9_endVideo?: Express.Multer.File[];
      course_9_videoFiles?: Express.Multer.File[];
      course_9_docFiles?: Express.Multer.File[];
    },
    @Req() req: any
  ) {
    const thumbnail = files.thumbnail?.[0] || null;
    const courseFiles = this.parseCourseFilesFromFiles(files, createSeriesDto.courses?.length || 0);
    return this.seriesService.create(createSeriesDto, thumbnail, courseFiles);
  }


  @Post('course')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'introVideo', maxCount: 1 },
      { name: 'endVideo', maxCount: 1 },
      { name: 'videoFiles', maxCount: 50 },
      { name: 'docFiles', maxCount: 50 },
    ], multerConfig)
  )
  async createCourse(
    @Body() createCourseDto: CreateCourseDto,
    @UploadedFiles() files: {
      introVideo?: Express.Multer.File[];
      endVideo?: Express.Multer.File[];
      videoFiles?: Express.Multer.File[];
      docFiles?: Express.Multer.File[];
    }
  ) {
    const introVideo = files.introVideo?.[0];
    const endVideo = files.endVideo?.[0];
    const videoFiles = files.videoFiles || [];
    const docFiles = files.docFiles || [];

    return this.seriesService.createCourse(createCourseDto, {
      introVideo,
      endVideo,
      videoFiles,
      docFiles,
    });
  }

  @Post('lesson-file')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'videoFile', maxCount: 1 },
      { name: 'docFile', maxCount: 1 },
    ], multerConfig)
  )
  async createLessonFile(
    @Body() createLessonFileDto: CreateLessonFileDto,
    @UploadedFiles() files: {
      videoFile?: Express.Multer.File[];
      docFile?: Express.Multer.File[];
    }
  ) {
    const videoFile = files.videoFile?.[0];
    const docFile = files.docFile?.[0];

    return this.seriesService.createLessonFile(createLessonFileDto, {
      videoFile,
      docFile,
    });
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

  @Get('courses')
  @HttpCode(HttpStatus.OK)
  async findAllCourses(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
    @Query('series_id') series_id?: string,
  ) {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    return this.seriesService.findAllCourses(pageNum, limitNum, search, series_id);
  }

  @Get('lessons')
  @HttpCode(HttpStatus.OK)
  async findAllLessons(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
    @Query('series_id') series_id?: string,
    @Query('course_id') course_id?: string,
  ) {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    return this.seriesService.findAllLessons(pageNum, limitNum, search, series_id, course_id);
  }

  @Get('courses/:id')
  @HttpCode(HttpStatus.OK)
  async findOneCourse(@Param('id') id: string) {
    return this.seriesService.findOneCourse(id);
  }

  @Get('lessons/:id')
  @HttpCode(HttpStatus.OK)
  async findOneLesson(@Param('id') id: string) {
    return this.seriesService.findOneLesson(id);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id') id: string) {
    return this.seriesService.findOne(id);
  }

  @Delete('course/:id')
  @HttpCode(HttpStatus.OK)
  async removeCourse(@Param('id') id: string) {
    return this.seriesService.removeCourse(id);
  }

  @Delete('lesson-file/:id')
  @HttpCode(HttpStatus.OK)
  async removeLessonFile(@Param('id') id: string) {
    return this.seriesService.removeLessonFile(id);
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
    @Body() updateSeriesDto: UpdateSeriesDto,
    @Req() req: any,
    @UploadedFiles() files: {
      thumbnail?: Express.Multer.File[];
    },
  ) {
    const thumbnail = files.thumbnail ? files.thumbnail[0] : null;

    return this.seriesService.update(id, updateSeriesDto, thumbnail);
  }

  @Patch(':id/publish')
  @HttpCode(HttpStatus.OK)
  async publishSeries(@Param('id') id: string) {
    return this.seriesService.publishSeries(id);
  }

  @Get(':id/publication-status')
  @HttpCode(HttpStatus.OK)
  async getPublicationStatus(@Param('id') id: string) {
    return this.seriesService.getSeriesPublicationStatus(id);
  }

  @Patch(':id/cancel-publication')
  @HttpCode(HttpStatus.OK)
  async cancelScheduledPublication(@Param('id') id: string) {
    return this.seriesService.cancelScheduledPublication(id);
  }

  @Patch('course/:courseId')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'introVideo', maxCount: 1 },
      { name: 'endVideo', maxCount: 1 },
    ], multerConfig)
  )
  async updateCourse(
    @Param('courseId') courseId: string,
    @Body() updateData: UpdateCourseDto,
    @UploadedFiles() files: {
      introVideo?: Express.Multer.File[];
      endVideo?: Express.Multer.File[];
    }
  ) {
    const introVideo = files.introVideo?.[0];
    const endVideo = files.endVideo?.[0];
    return this.seriesService.updateCourse(courseId, updateData, introVideo, endVideo);
  }

  @Patch('lesson/:lessonId')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'videoFile', maxCount: 1 },
      { name: 'docFile', maxCount: 1 },
    ], multerConfig)
  )
  async updateLesson(
    @Param('lessonId') lessonId: string,
    @Body() updateData: {
      title?: string;
      position?: number;
      alt?: string;
    },
    @UploadedFiles() files: {
      videoFile?: Express.Multer.File[];
      docFile?: Express.Multer.File[];
    }
  ) {
    const videoFile = files.videoFile?.[0];
    const docFile = files.docFile?.[0];
    return this.seriesService.updateLesson(lessonId, updateData, videoFile, docFile);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string) {
    return this.seriesService.remove(id);
  }

  /**
   * Parse module files from uploaded files
   * Supports up to 10 modules with intro videos, end videos, and lesson files
   */
  private parseCourseFilesFromFiles(files: any, courseCount: number) {
    const courseFiles = [];

    // Parse files for each course
    for (let i = 0; i < courseCount && i < 10; i++) {
      const introVideo = files[`course_${i}_introVideo`] ? files[`course_${i}_introVideo`][0] : null;
      const endVideo = files[`course_${i}_endVideo`] ? files[`course_${i}_endVideo`][0] : null;
      const videoFiles = files[`course_${i}_videoFiles`] || [];
      const docFiles = files[`course_${i}_docFiles`] || [];

      // Only add course if it has any files
      if (introVideo || endVideo || (videoFiles && videoFiles.length > 0) || (docFiles && docFiles.length > 0)) {
        courseFiles.push({
          courseIndex: i,
          introVideo,
          endVideo,
          videoFiles: videoFiles,
          docFiles: docFiles,
        });
      }
    }

    return courseFiles;
  }
}