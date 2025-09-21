import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UsePipes, ValidationPipe, HttpStatus, HttpCode, UseInterceptors, UploadedFiles, UploadedFile, Req, Logger } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { SeriesService } from './series.service';
import { CreateSeriesDto } from './dto/create-series.dto';
import { UpdateSeriesDto } from './dto/update-series.dto';
import { ChunkedUploadService } from '../../../common/lib/upload/ChunkedUploadService';
import { multerConfig } from '../../../config/multer.config';


@Controller('admin/series')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class SeriesController {
  private readonly logger = new Logger(SeriesController.name);

  constructor(
    private readonly seriesService: SeriesService,
    private readonly chunkedUploadService: ChunkedUploadService
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
    @Body() updateData: {
      title?: string;
      position?: number;
      price?: number;
      intro_video_url?: string;
      end_video_url?: string;
    },
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

  @Patch(':id/update-all')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'thumbnail', maxCount: 1 },
      // Course files - support up to 10 courses
      { name: 'course_0_introVideo', maxCount: 1 },
      { name: 'course_0_endVideo', maxCount: 1 },
      { name: 'course_1_introVideo', maxCount: 1 },
      { name: 'course_1_endVideo', maxCount: 1 },
      { name: 'course_2_introVideo', maxCount: 1 },
      { name: 'course_2_endVideo', maxCount: 1 },
      { name: 'course_3_introVideo', maxCount: 1 },
      { name: 'course_3_endVideo', maxCount: 1 },
      { name: 'course_4_introVideo', maxCount: 1 },
      { name: 'course_4_endVideo', maxCount: 1 },
      // Lesson files - support up to 50 lessons per course
      { name: 'lesson_0_videoFile', maxCount: 1 },
      { name: 'lesson_0_docFile', maxCount: 1 },
      { name: 'lesson_1_videoFile', maxCount: 1 },
      { name: 'lesson_1_docFile', maxCount: 1 },
      { name: 'lesson_2_videoFile', maxCount: 1 },
      { name: 'lesson_2_docFile', maxCount: 1 },
      { name: 'lesson_3_videoFile', maxCount: 1 },
      { name: 'lesson_3_docFile', maxCount: 1 },
      { name: 'lesson_4_videoFile', maxCount: 1 },
      { name: 'lesson_4_docFile', maxCount: 1 },
    ], multerConfig)
  )
  async updateAll(
    @Param('id') seriesId: string,
    @Body() updateData: {
      series?: {
        title?: string;
        slug?: string;
        summary?: string;
        description?: string;
        visibility?: string;
        video_length?: string;
        duration?: string;
        start_date?: string;
        end_date?: string;
        total_price?: number;
        course_type?: string;
        note?: string;
        available_site?: number;
        language_id?: string;
      };
      courses?: Array<{
        id: string;
        title?: string;
        position?: number;
        price?: number;
        intro_video_url?: string;
        end_video_url?: string;
      }>;
      lessons?: Array<{
        id: string;
        title?: string;
        position?: number;
        alt?: string;
      }>;
    },
    @UploadedFiles() files: {
      thumbnail?: Express.Multer.File[];
      course_0_introVideo?: Express.Multer.File[];
      course_0_endVideo?: Express.Multer.File[];
      course_1_introVideo?: Express.Multer.File[];
      course_1_endVideo?: Express.Multer.File[];
      course_2_introVideo?: Express.Multer.File[];
      course_2_endVideo?: Express.Multer.File[];
      course_3_introVideo?: Express.Multer.File[];
      course_3_endVideo?: Express.Multer.File[];
      course_4_introVideo?: Express.Multer.File[];
      course_4_endVideo?: Express.Multer.File[];
      lesson_0_videoFile?: Express.Multer.File[];
      lesson_0_docFile?: Express.Multer.File[];
      lesson_1_videoFile?: Express.Multer.File[];
      lesson_1_docFile?: Express.Multer.File[];
      lesson_2_videoFile?: Express.Multer.File[];
      lesson_2_docFile?: Express.Multer.File[];
      lesson_3_videoFile?: Express.Multer.File[];
      lesson_3_docFile?: Express.Multer.File[];
      lesson_4_videoFile?: Express.Multer.File[];
      lesson_4_docFile?: Express.Multer.File[];
    }
  ) {
    // Parse course files
    const courseFiles = this.parseCourseFilesFromUpdateFiles(files, updateData.courses?.length || 0);

    // Parse lesson files
    const lessonFiles = this.parseLessonFilesFromUpdateFiles(files, updateData.lessons?.length || 0);

    const processedFiles = {
      thumbnail: files.thumbnail?.[0],
      courseFiles,
      lessonFiles,
    };

    return this.seriesService.updateAll(seriesId, updateData, processedFiles);
  }

  private parseCourseFilesFromUpdateFiles(files: any, courseCount: number) {
    const courseFiles = [];

    for (let i = 0; i < courseCount && i < 5; i++) {
      const introVideo = files[`course_${i}_introVideo`]?.[0];
      const endVideo = files[`course_${i}_endVideo`]?.[0];

      if (introVideo || endVideo) {
        courseFiles.push({
          courseId: `course_${i}`, // This should be the actual course ID from the request
          introVideo,
          endVideo,
        });
      }
    }

    return courseFiles;
  }

  private parseLessonFilesFromUpdateFiles(files: any, lessonCount: number) {
    const lessonFiles = [];

    for (let i = 0; i < lessonCount && i < 5; i++) {
      const videoFile = files[`lesson_${i}_videoFile`]?.[0];
      const docFile = files[`lesson_${i}_docFile`]?.[0];

      if (videoFile || docFile) {
        lessonFiles.push({
          lessonId: `lesson_${i}`, // This should be the actual lesson ID from the request
          videoFile,
          docFile,
        });
      }
    }

    return lessonFiles;
  }
}