import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UsePipes, ValidationPipe, HttpStatus, HttpCode, UseInterceptors, UploadedFiles, UploadedFile, Req, Logger, UseGuards } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { SeriesService } from './series.service';
import { CreateSeriesDto } from './dto/create-series.dto';
import { UpdateSeriesDto } from './dto/update-series.dto';
import { multerConfig, largeFileMulterConfig } from '../../../config/multer.config';
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
    ], multerConfig)
  )
  async create(
    @Body() createSeriesDto: CreateSeriesDto,
    @UploadedFiles()
    files: {
      thumbnail?: Express.Multer.File[];
    },
    @Req() req: any
  ) {
    const thumbnail = files.thumbnail?.[0] || null;
    return this.seriesService.create(createSeriesDto, thumbnail);
  }


  @Post('course')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'introVideo', maxCount: 1 },
      { name: 'endVideo', maxCount: 1 },
    ], multerConfig)
  )
  async createCourse(
    @Body() createCourseDto: CreateCourseDto,
    @UploadedFiles() files: {
      introVideo?: Express.Multer.File[];
      endVideo?: Express.Multer.File[];
    }
  ) {
    const introVideo = files.introVideo?.[0];
    const endVideo = files.endVideo?.[0];

    return this.seriesService.createCourse(createCourseDto, {
      introVideo,
      endVideo,
    });
  }

  @Post('lesson-file')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'videoFile', maxCount: 1 },
      { name: 'docFile', maxCount: 1 },
    ], largeFileMulterConfig)
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

    // Check for large video files (>100MB) and suggest MinIO upload
    // if (videoFile && videoFile.size > 100 * 1024 * 1024) {
    //   return {
    //     success: true,
    //     message: 'Large file detected. Use MinIO upload for better performance.',
    //     data: {
    //       videoFile: {
    //         originalname: videoFile.originalname,
    //         size: videoFile.size,
    //         sizeInMB: Math.round(videoFile.size / 1024 / 1024),
    //         mimetype: videoFile.mimetype,
    //         status: 'requires_minio_upload'
    //       },
    //       docFile: docFile ? {
    //         originalname: docFile.originalname,
    //         size: docFile.size,
    //         mimetype: docFile.mimetype,
    //         sizeInMB: Math.round(docFile.size / 1024 / 1024)
    //       } : null,
    //       recommendation: 'Use MinIO direct upload for files larger than 100MB',
    //       endpoints: {
    //         presignedUrl: '/api/admin/upload/presigned-url',
    //         completeUpload: '/api/admin/upload/complete-upload',
    //         testConnection: '/api/admin/upload/test-connection'
    //       },
    //       instructions: {
    //         step1: 'Call POST /api/admin/upload/presigned-url with file details',
    //         step2: 'Upload file directly to the returned presigned URL',
    //         step3: 'Call POST /api/admin/upload/complete-upload to finalize'
    //       }
    //     },
    //   };
    // }

    // For smaller files, process normally
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
    @Query('course_type') course_type?: string,
  ) {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    return this.seriesService.findAll(pageNum, limitNum, search, course_type);
  }

  @Get('series-title')
  @HttpCode(HttpStatus.OK)
  async getSeriesTitle() {
    return this.seriesService.getSeriesTitle();
  }

  @Get('course-title')
  @HttpCode(HttpStatus.OK)
  async getCourseTitle(@Query('series_id') series_id: string) {
    return this.seriesService.getCourseTitle(series_id);
  }

  @Get('lesson-title')
  @HttpCode(HttpStatus.OK)
  async getLessonTitle(@Query('course_id') course_id: string) {
    return this.seriesService.getLessonTitle(course_id);
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
}