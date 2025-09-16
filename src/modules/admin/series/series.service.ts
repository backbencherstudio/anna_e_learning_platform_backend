import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateSeriesDto } from './dto/create-series.dto';
import { UpdateSeriesDto } from './dto/update-series.dto';
import { SeriesResponse } from './interfaces/series-response.interface';
import { StringHelper } from '../../../common/helper/string.helper';
import { Series } from '@prisma/client';
import { SojebStorage } from '../../../common/lib/Disk/SojebStorage';
import appConfig from '../../../config/app.config';
import { ChunkedUploadService } from '../../../common/lib/upload/ChunkedUploadService';

@Injectable()
export class SeriesService {
  private readonly logger = new Logger(SeriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chunkedUploadService: ChunkedUploadService
  ) { }

  /**
   * Create a new series with optional courses and lesson files
   */
  async create(
    createSeriesDto: CreateSeriesDto,
    thumbnail?: Express.Multer.File,
    courseFiles?: {
      courseIndex: number;
      introVideo?: Express.Multer.File;
      endVideo?: Express.Multer.File;
      lessonFiles?: Express.Multer.File[];
      // chunkedUploads?: {
      //   uploadId: string;
      //   fileName: string;
      //   lessonTitle?: string;
      // }[];
    }[]
  ): Promise<SeriesResponse<Series>> {

    try {
      this.logger.log('Creating new series');

      // Generate slug from title if not provided
      const slug = createSeriesDto.slug || StringHelper.slugify(createSeriesDto.title);

      // Check if slug already exists
      const existingSeries = await this.prisma.series.findUnique({
        where: { slug },
      });

      if (existingSeries) {
        throw new BadRequestException(`Series with slug '${slug}' already exists`);
      }

      // Handle thumbnail file upload
      let thumbnailFileName: string | undefined;
      if (thumbnail) {
        thumbnailFileName = StringHelper.generateRandomFileName(thumbnail.originalname);
        await SojebStorage.put(appConfig().storageUrl.series_thumbnail + thumbnailFileName, thumbnail.buffer);
        this.logger.log(`Uploaded thumbnail: ${thumbnailFileName}`);
      }

      // calculate total price
      if (!createSeriesDto.total_price) {
        createSeriesDto.total_price = createSeriesDto.courses?.reduce((acc, course) => acc + course.price, 0);
      }

      // Create series with courses and lesson files in a transaction
      const result = await this.prisma.$transaction(async (prisma) => {
        // Create the series
        const series = await prisma.series.create({
          data: {
            title: createSeriesDto.title,
            slug,
            summary: createSeriesDto.summary,
            description: createSeriesDto.description,
            visibility: createSeriesDto.visibility || 'DRAFT',
            duration: createSeriesDto.duration,
            start_date: createSeriesDto.start_date ? new Date(createSeriesDto.start_date) : undefined,
            end_date: createSeriesDto.end_date ? new Date(createSeriesDto.end_date) : undefined,
            thumbnail: thumbnailFileName,
            total_price: createSeriesDto.total_price,
            course_type: createSeriesDto.course_type,
            note: createSeriesDto.note,
            available_site: createSeriesDto.available_site,
            language_id: createSeriesDto.language_id,
          },
        });

        // Create courses if provided
        if (createSeriesDto.courses && createSeriesDto.courses.length > 0) {
          for (let i = 0; i < createSeriesDto.courses.length; i++) {
            const courseDto = createSeriesDto.courses[i];

            // Find course files for this specific course
            const courseFileData = courseFiles?.find(cf => cf.courseIndex === i);

            // Handle intro video file upload for this course
            let introVideoUrl: string | undefined;
            if (courseFileData?.introVideo) {
              introVideoUrl = StringHelper.generateRandomFileName(courseFileData.introVideo.originalname);
              await SojebStorage.put(appConfig().storageUrl.module_file + introVideoUrl, courseFileData.introVideo.buffer);
              this.logger.log(`Uploaded intro video for course ${i}: ${introVideoUrl}`);
            }

            // Handle end video file upload for this course
            let endVideoUrl: string | undefined;
            if (courseFileData?.endVideo) {
              endVideoUrl = StringHelper.generateRandomFileName(courseFileData.endVideo.originalname);
              await SojebStorage.put(appConfig().storageUrl.module_file + endVideoUrl, courseFileData.endVideo.buffer);
              this.logger.log(`Uploaded end video for course ${i}: ${endVideoUrl}`);
            }

            const course = await prisma.course.create({
              data: {
                series_id: series.id,
                title: courseDto.title,
                position: courseDto.position || i,
                intro_video_url: introVideoUrl,
                end_video_url: endVideoUrl,
              },
            });

            // Handle regular lesson files for this specific course
            if (courseFileData?.lessonFiles && courseFileData.lessonFiles.length > 0) {
              this.logger.log(`Processing ${courseFileData.lessonFiles.length} lesson files for course ${i}`);
              for (let j = 0; j < courseFileData.lessonFiles.length; j++) {
                const lessonFile = courseFileData.lessonFiles[j];
                const lessonFileDto = courseDto.lessons_files?.[j];
                const lessonTitle = lessonFileDto?.title || lessonFile.originalname.split('.')[0];
                const fileName = StringHelper.generateLessonFileName(j + 1, lessonTitle, lessonFile.originalname);
                await SojebStorage.put(appConfig().storageUrl.lesson_file + fileName, lessonFile.buffer);

                await prisma.lessonFile.create({
                  data: {
                    course_id: course.id,
                    title: lessonFileDto?.title || lessonFile.originalname,
                    url: fileName,
                    kind: this.getFileKind(lessonFile.mimetype),
                    alt: lessonFile.originalname,
                    position: j,
                  },
                });
              }
              this.logger.log(`Created ${courseFileData.lessonFiles.length} lesson files for course ${i}`);
            }

            // Handle chunked uploads for this specific course
            // if (courseFileData?.chunkedUploads && courseFileData.chunkedUploads.length > 0) {
            //   this.logger.log(`Processing ${courseFileData.chunkedUploads.length} chunked uploads for course ${i}`);
            //   for (let j = 0; j < courseFileData.chunkedUploads.length; j++) {
            //     const chunkedUpload = courseFileData.chunkedUploads[j];

            //     // Finalize the chunked upload
            //     const uploadResult = await this.chunkedUploadService.finalizeUpload({
            //       uploadId: chunkedUpload.uploadId,
            //       finalFileName: chunkedUpload.fileName
            //     });

            //     if (uploadResult.success) {
            //       const lessonTitle = chunkedUpload.lessonTitle || chunkedUpload.fileName.split('.')[0];
            //       const finalFileName = StringHelper.generateLessonFileName(j + 1, lessonTitle, chunkedUpload.fileName);

            //       // Rename the file to the final name if needed
            //       if (uploadResult.fileName !== finalFileName) {
            //         const oldKey = appConfig().storageUrl.lesson_file + uploadResult.fileName;
            //         const newKey = appConfig().storageUrl.lesson_file + finalFileName;

            //         // Move the file to the new name
            //         const fileExists = await SojebStorage.isExists(oldKey);
            //         if (fileExists) {
            //           const fileData = await SojebStorage.get(oldKey);
            //           await SojebStorage.put(newKey, fileData);
            //           await SojebStorage.delete(oldKey);
            //         }
            //       }

            //       // Create lesson file record
            //       await prisma.lessonFile.create({
            //         data: {
            //           course_id: course.id,
            //           title: lessonTitle,
            //           url: finalFileName,
            //           kind: this.getFileKindFromFileName(chunkedUpload.fileName),
            //           alt: chunkedUpload.fileName,
            //           position: j + (courseFileData.lessonFiles?.length || 0), // Offset by regular files
            //         },
            //       });

            //       this.logger.log(`Created chunked upload lesson file: ${finalFileName}`);
            //     } else {
            //       this.logger.error(`Failed to finalize chunked upload: ${chunkedUpload.uploadId}`);
            //       throw new BadRequestException(`Failed to finalize chunked upload: ${uploadResult.message}`);
            //     }
            //   }
            //   this.logger.log(`Created ${courseFileData.chunkedUploads.length} chunked upload lesson files for course ${i}`);
            // }
          }
          this.logger.log(`Created ${createSeriesDto.courses.length} courses for series`);
        }

        return series;
      });

      // Fetch the complete series with relations
      const seriesWithRelations = await this.prisma.series.findUnique({
        where: { id: result.id },
        include: {
          courses: {
            orderBy: { position: 'asc' },
          },
        }
      });

      this.logger.log(`Series created successfully with ID: ${result.id}`);

      return {
        success: true,
        message: 'Series created successfully',
        data: seriesWithRelations,
      };
    } catch (error) {
      this.logger.error(`Error creating series: ${error.message}`, error.stack);

      if (error instanceof BadRequestException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to create series',
        error: error.message,
      };
    }
  }
  /**
   * Get all series with pagination and filtering
   */
  async findAll(page: number = 1, limit: number = 10, search?: string): Promise<SeriesResponse<{ series: any[]; pagination: any }>> {
    try {
      this.logger.log('Fetching all series');

      const skip = (page - 1) * limit;

      const where = search ? {
        OR: [
          { title: { contains: search, mode: 'insensitive' as any } },
          { summary: { contains: search, mode: 'insensitive' as any } },
          { description: { contains: search, mode: 'insensitive' as any } },
        ],
      } : {};

      const [series, total] = await Promise.all([
        this.prisma.series.findMany({
          where,
          skip,
          take: limit,
          select: {
            id: true,
            title: true,
            slug: true,
            summary: true,
            description: true,
            visibility: true,
            duration: true,
            start_date: true,
            end_date: true,
            thumbnail: true,
            total_price: true,
            course_type: true,
            note: true,
            available_site: true,
            created_at: true,
            updated_at: true,
            language: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
            courses: {
              select: {
                id: true,
                title: true,
                position: true,
                price: true,
                created_at: true,
                updated_at: true,
                intro_video_url: true,
                end_video_url: true,
                lesson_files: {
                  select: {
                    id: true,
                    title: true,
                    url: true,
                    kind: true,
                    alt: true,
                  },
                  orderBy: { position: 'asc' },
                },
              },
              orderBy: { position: 'asc' },
            },
            _count: {
              select: {
                courses: true,
                quizzes: true,
                assignments: true,
              },
            },
          },
          orderBy: { created_at: 'desc' },
        }),
        this.prisma.series.count({ where }),
      ]);

      // Calculate pagination values
      const totalPages = Math.ceil(total / limit);
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;

      // Add file URLs to all series
      for (const seriesItem of series) {
        if (seriesItem.thumbnail) {
          seriesItem['thumbnail_url'] = SojebStorage.url(appConfig().storageUrl.series_thumbnail + seriesItem.thumbnail);
        }
        if (seriesItem.courses && seriesItem.courses.length > 0) {
          for (const course of seriesItem.courses) {
            if (course.lesson_files && course.lesson_files.length > 0) {
              for (const lessonFile of course.lesson_files) {
                if (lessonFile.url) {
                  lessonFile['file_url'] = SojebStorage.url(appConfig().storageUrl.lesson_file + lessonFile.url);
                }
              }
            }
            if (course.intro_video_url) {
              course['intro_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + course.intro_video_url);
            }
            if (course.end_video_url) {
              course['end_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + course.end_video_url);
            }
          }
        }
      }

      return {
        success: true,
        message: 'Series retrieved successfully',
        data: {
          series,
          pagination: {
            total,
            page,
            limit,
            totalPages,
            hasNextPage,
            hasPreviousPage,
          },
        },
      };
    } catch (error) {
      this.logger.error(`Error fetching series: ${error.message}`, error.stack);

      return {
        success: false,
        message: 'Failed to fetch series',
        error: error.message,
      };
    }
  }

  /**
   * Get a single series by ID
   */
  async findOne(id: string): Promise<SeriesResponse<Series>> {
    try {
      this.logger.log(`Fetching series with ID: ${id}`);

      const series = await this.prisma.series.findUnique({
        where: { id },
        include: {
          courses: {
            orderBy: { position: 'asc' },
            include: {
              lesson_files: {
                orderBy: { position: 'asc' },
              },
              quizzes: {
                select: {
                  id: true,
                  title: true,
                  total_marks: true,
                },
              },
              assignments: {
                select: {
                  id: true,
                  title: true,
                  total_marks: true,
                },
              },
            },
          },
          quizzes: {
            select: {
              id: true,
              title: true,
              total_marks: true,
            },
          },
          assignments: {
            select: {
              id: true,
              title: true,
              total_marks: true,
            },
          },
          _count: {
            select: {
              enrollments: true,
              courses: true,
            },
          },
        },
      });

      if (!series) {
        throw new NotFoundException(`Series with ID ${id} not found`);
      }

      // Add file URLs to the series
      if (series.thumbnail) {
        series['thumbnail_url'] = SojebStorage.url(appConfig().storageUrl.series_thumbnail + series.thumbnail);
      }
      if (series.courses && series.courses.length > 0) {
        for (const course of series.courses) {
          if (course.lesson_files && course.lesson_files.length > 0) {
            for (const lessonFile of course.lesson_files) {
              if (lessonFile.url) {
                lessonFile['file_url'] = SojebStorage.url(appConfig().storageUrl.lesson_file + lessonFile.url);
              }
            }
          }
          if (course.intro_video_url) {
            course['intro_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + course.intro_video_url);
          }
          if (course.end_video_url) {
            course['end_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + course.end_video_url);
          }
        }
      }


      return {
        success: true,
        message: 'Series retrieved successfully',
        data: series,
      };
    } catch (error) {
      this.logger.error(`Error fetching series ${id}: ${error.message}`, error.stack);

      if (error instanceof NotFoundException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to fetch series',
        error: error.message,
      };
    }
  }

  /**
   * Update a series by ID
   */
  async update(id: string, updateSeriesDto: UpdateSeriesDto, thumbnail?: Express.Multer.File): Promise<SeriesResponse<any>> {
    try {
      this.logger.log(`Updating series with ID: ${id}`);

      // Check if series exists
      const existingSeries = await this.prisma.series.findUnique({
        where: { id },
        select: { id: true, slug: true, thumbnail: true },
      });

      if (!existingSeries) {
        throw new NotFoundException(`Series with ID ${id} not found`);
      }

      // Handle thumbnail file upload if provided
      let thumbnailFileName: string | undefined;
      if (thumbnail) {
        // Delete old thumbnail if exists
        if (existingSeries.thumbnail) {
          try {
            await SojebStorage.delete(appConfig().storageUrl.series_thumbnail + existingSeries.thumbnail);
          } catch (error) {
            this.logger.warn(`Failed to delete old thumbnail: ${error.message}`);
          }
        }

        // Upload new thumbnail
        thumbnailFileName = StringHelper.generateRandomFileName(thumbnail.originalname);
        await SojebStorage.put(appConfig().storageUrl.series_thumbnail + thumbnailFileName, thumbnail.buffer);
      }

      // Generate slug from title if title is being updated
      let slug = updateSeriesDto.slug;
      if (updateSeriesDto.title && !updateSeriesDto.slug) {
        slug = StringHelper.slugify(updateSeriesDto.title);

        // Check if new slug already exists (excluding current series)
        const slugExists = await this.prisma.series.findFirst({
          where: {
            slug,
            id: { not: id },
          },
        });

        if (slugExists) {
          throw new BadRequestException(`Series with slug '${slug}' already exists`);
        }
      }

      // Update series in a transaction
      const updatedSeries = await this.prisma.$transaction(async (prisma) => {
        // Prepare update data
        const updateData: any = { ...updateSeriesDto };
        if (slug) updateData.slug = slug;
        if (thumbnailFileName) updateData.thumbnail = thumbnailFileName;
        if (updateSeriesDto.start_date) updateData.start_date = new Date(updateSeriesDto.start_date);
        if (updateSeriesDto.end_date) updateData.end_date = new Date(updateSeriesDto.end_date);

        const series = await prisma.series.update({
          where: { id },
          data: updateData,
        });

        return series;
      });

      // Fetch the complete updated series with relations
      const seriesWithRelations = await this.prisma.series.findUnique({
        where: { id },
        include: {
          courses: {
            orderBy: { position: 'asc' },
          },
        }
      });

      // Add thumbnail URL
      if (seriesWithRelations?.thumbnail) {
        seriesWithRelations.thumbnail = appConfig().storageUrl.series_thumbnail + seriesWithRelations.thumbnail;
      }

      this.logger.log(`Series updated successfully with ID: ${id}`);

      return {
        success: true,
        message: 'Series updated successfully',
        data: seriesWithRelations,
      };
    } catch (error) {
      this.logger.error(`Error updating series ${id}: ${error.message}`, error.stack);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to update series',
        error: error.message,
      };
    }
  }
  /**
   * Delete a series by ID (soft delete)
   */
  async remove(id: string): Promise<SeriesResponse<{ id: string }>> {
    try {
      this.logger.log(`Deleting series with ID: ${id}`);

      // Check if series exists and get file information
      const existingSeries = await this.prisma.series.findUnique({
        where: { id },
        select: {
          id: true,
          thumbnail: true,
          courses: {
            select: {
              id: true,
              intro_video_url: true,
              end_video_url: true,
              lesson_files: {
                select: {
                  id: true,
                  url: true,
                },
              },
            },
          },
        },
      });

      if (!existingSeries) {
        throw new NotFoundException(`Series with ID ${id} not found`);
      }

      // Delete all associated files before soft deleting the series
      try {
        // Delete thumbnail
        if (existingSeries.thumbnail) {
          await SojebStorage.delete(appConfig().storageUrl.series_thumbnail + existingSeries.thumbnail);
        }

        // Delete course video files
        if (existingSeries.courses && existingSeries.courses.length > 0) {
          for (const course of existingSeries.courses) {
            if (course.intro_video_url) {
              try {
                await SojebStorage.delete(appConfig().storageUrl.module_file + course.intro_video_url);
              } catch (error) {
                this.logger.warn(`Failed to delete course intro video: ${error.message}`);
              }
            }
            if (course.end_video_url) {
              try {
                await SojebStorage.delete(appConfig().storageUrl.module_file + course.end_video_url);
              } catch (error) {
                this.logger.warn(`Failed to delete course end video: ${error.message}`);
              }
            }
            // Delete lesson files
            if (course.lesson_files && course.lesson_files.length > 0) {
              for (const lessonFile of course.lesson_files) {
                try {
                  await SojebStorage.delete(appConfig().storageUrl.lesson_file + lessonFile.url);
                } catch (error) {
                  this.logger.warn(`Failed to delete lesson file: ${error.message}`);
                }
              }
            }
          }
        }

      } catch (error) {
        this.logger.warn(`Failed to delete some files: ${error.message}`);
      }

      // Soft delete the series (Prisma middleware will handle this)
      await this.prisma.series.delete({
        where: { id },
      });

      this.logger.log(`Series deleted successfully with ID: ${id}`);

      return {
        success: true,
        message: 'Series deleted successfully',
        data: { id },
      };
    } catch (error) {
      this.logger.error(`Error deleting series ${id}: ${error.message}`, error.stack);

      if (error instanceof NotFoundException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to delete series',
        error: error.message,
      };
    }
  }

  /**
   * Get file kind based on MIME type
   */
  private getFileKind(mimetype: string): string {
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('video/')) return 'video';
    if (mimetype.startsWith('audio/')) return 'audio';
    if (mimetype === 'application/pdf') return 'pdf';
    if (mimetype.includes('powerpoint') || mimetype.includes('presentation')) return 'slides';
    return 'other';
  }

  /**
   * Get file kind based on file extension
   */
  private getFileKindFromFileName(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();

    switch (ext) {
      case 'mp4':
      case 'webm':
      case 'ogg':
      case 'avi':
      case 'mov':
      case 'wmv':
        return 'video';
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
        return 'image';
      case 'mp3':
      case 'wav':
      case 'ogg':
        return 'audio';
      case 'pdf':
        return 'pdf';
      case 'ppt':
      case 'pptx':
        return 'slides';
      default:
        return 'other';
    }
  }
}

