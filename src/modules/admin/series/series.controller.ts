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
      { name: 'course_0_lessonFiles', maxCount: 50 },
      { name: 'course_1_introVideo', maxCount: 1 },
      { name: 'course_1_endVideo', maxCount: 1 },
      { name: 'course_1_lessonFiles', maxCount: 50 },
      { name: 'course_2_introVideo', maxCount: 1 },
      { name: 'course_2_endVideo', maxCount: 1 },
      { name: 'course_2_lessonFiles', maxCount: 50 },
      { name: 'course_3_introVideo', maxCount: 1 },
      { name: 'course_3_endVideo', maxCount: 1 },
      { name: 'course_3_lessonFiles', maxCount: 50 },
      { name: 'course_4_introVideo', maxCount: 1 },
      { name: 'course_4_endVideo', maxCount: 1 },
      { name: 'course_4_lessonFiles', maxCount: 50 },
      { name: 'course_5_introVideo', maxCount: 1 },
      { name: 'course_5_endVideo', maxCount: 1 },
      { name: 'course_5_lessonFiles', maxCount: 50 },
      { name: 'course_6_introVideo', maxCount: 1 },
      { name: 'course_6_endVideo', maxCount: 1 },
      { name: 'course_6_lessonFiles', maxCount: 50 },
      { name: 'course_7_introVideo', maxCount: 1 },
      { name: 'course_7_endVideo', maxCount: 1 },
      { name: 'course_7_lessonFiles', maxCount: 50 },
      { name: 'course_8_introVideo', maxCount: 1 },
      { name: 'course_8_endVideo', maxCount: 1 },
      { name: 'course_8_lessonFiles', maxCount: 50 },
      { name: 'course_9_introVideo', maxCount: 1 },
      { name: 'course_9_endVideo', maxCount: 1 },
      { name: 'course_9_lessonFiles', maxCount: 50 },
    ], multerConfig)
  )
  async create(
    @Body() createSeriesDto: CreateSeriesDto,
    @UploadedFiles()
    files: {
      thumbnail?: Express.Multer.File[];
      course_0_introVideo?: Express.Multer.File[];
      course_0_endVideo?: Express.Multer.File[];
      course_0_lessonFiles?: Express.Multer.File[];
      course_1_introVideo?: Express.Multer.File[];
      course_1_endVideo?: Express.Multer.File[];
      course_1_lessonFiles?: Express.Multer.File[];
      course_2_introVideo?: Express.Multer.File[];
      course_2_endVideo?: Express.Multer.File[];
      course_2_lessonFiles?: Express.Multer.File[];
      course_3_introVideo?: Express.Multer.File[];
      course_3_endVideo?: Express.Multer.File[];
      course_3_lessonFiles?: Express.Multer.File[];
      course_4_introVideo?: Express.Multer.File[];
      course_4_endVideo?: Express.Multer.File[];
      course_4_lessonFiles?: Express.Multer.File[];
      course_5_introVideo?: Express.Multer.File[];
      course_5_endVideo?: Express.Multer.File[];
      course_5_lessonFiles?: Express.Multer.File[];
      course_6_introVideo?: Express.Multer.File[];
      course_6_endVideo?: Express.Multer.File[];
      course_6_lessonFiles?: Express.Multer.File[];
      course_7_introVideo?: Express.Multer.File[];
      course_7_endVideo?: Express.Multer.File[];
      course_7_lessonFiles?: Express.Multer.File[];
      course_8_introVideo?: Express.Multer.File[];
      course_8_endVideo?: Express.Multer.File[];
      course_8_lessonFiles?: Express.Multer.File[];
      course_9_introVideo?: Express.Multer.File[];
      course_9_endVideo?: Express.Multer.File[];
      course_9_lessonFiles?: Express.Multer.File[];
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
   * Create series with chunked uploads
   */
  // @Post('create-with-chunks')
  // @HttpCode(HttpStatus.CREATED)
  // async createWithChunkedUploads(
  //   @Body() createSeriesDto: CreateSeriesDto & {
  //     chunkedUploads?: {
  //       courseIndex: number;
  //       uploadId: string;
  //       fileName: string;
  //       lessonTitle?: string;
  //     }[];
  //   }
  // ) {
  //   try {
  //     this.logger.log('Creating series with chunked uploads');

  //     // Parse chunked uploads by course
  //     const courseFiles = [];
  //     const chunkedUploads = createSeriesDto.chunkedUploads || [];

  //     // Group chunked uploads by course index
  //     const uploadsByCourse = chunkedUploads.reduce((acc, upload) => {
  //       if (!acc[upload.courseIndex]) {
  //         acc[upload.courseIndex] = [];
  //       }
  //       acc[upload.courseIndex].push(upload);
  //       return acc;
  //     }, {} as Record<number, any[]>);

  //     // Create course files structure
  //     for (let i = 0; i < (createSeriesDto.courses?.length || 0); i++) {
  //       if (uploadsByCourse[i] || i < 10) {
  //         courseFiles.push({
  //           courseIndex: i,
  //           chunkedUploads: uploadsByCourse[i] || []
  //         });
  //       }
  //     }

  //     return this.seriesService.create(createSeriesDto, null, courseFiles);
  //   } catch (error) {
  //     this.logger.error(`Error creating series with chunked uploads: ${error.message}`);
  //     return {
  //       success: false,
  //       message: error.message
  //     };
  //   }
  // }

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
      const lessonFiles = files[`course_${i}_lessonFiles`] || [];

      // Only add course if it has any files
      if (introVideo || endVideo || (lessonFiles && lessonFiles.length > 0)) {
        courseFiles.push({
          courseIndex: i,
          introVideo,
          endVideo,
          lessonFiles: lessonFiles,
        });
      }
    }

    return courseFiles;
  }
}