import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateSeriesDto } from './dto/create-series.dto';
import { UpdateSeriesDto } from './dto/update-series.dto';
import { SeriesResponse } from './interfaces/series-response.interface';
import { StringHelper } from '../../../common/helper/string.helper';
import { Series } from '@prisma/client';
import { SojebStorage } from '../../../common/lib/Disk/SojebStorage';
import appConfig from '../../../config/app.config';
import { VideoDurationService } from '../../../common/lib/video-duration/video-duration.service';
import { SeriesPublishService } from '../../queue/services/series-publish.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { CreateLessonFileDto } from './dto/create-lesson-file.dto';
import { UpdateCourseDto } from './dto/update-course.dto';

@Injectable()
export class SeriesService {
  private readonly logger = new Logger(SeriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly videoDurationService: VideoDurationService,
    private readonly seriesPublishService: SeriesPublishService
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
      videoFiles?: Express.Multer.File[];
      docFiles?: Express.Multer.File[];
    }[]
  ): Promise<SeriesResponse<Series>> {

    try {


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
            video_length: createSeriesDto.video_length,
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
            }

            // Handle end video file upload for this course
            let endVideoUrl: string | undefined;
            if (courseFileData?.endVideo) {
              endVideoUrl = StringHelper.generateRandomFileName(courseFileData.endVideo.originalname);
              await SojebStorage.put(appConfig().storageUrl.module_file + endVideoUrl, courseFileData.endVideo.buffer);
            }

            const course = await prisma.course.create({
              data: {
                series_id: series.id,
                title: courseDto.title,
                position: courseDto.position || i,
                price: courseDto.price,
                intro_video_url: introVideoUrl,
                end_video_url: endVideoUrl,
              },
            });

            // Handle lesson files (combining video and document files)
            const lessonLengths: string[] = [];
            const maxFiles = Math.max(
              courseFileData?.videoFiles?.length || 0,
              courseFileData?.docFiles?.length || 0
            );

            if (maxFiles > 0) {
              for (let j = 0; j < maxFiles; j++) {
                const videoFile = courseFileData?.videoFiles?.[j];
                const docFile = courseFileData?.docFiles?.[j];
                const lessonFileDto = courseDto.lessons_files?.[j];

                let videoFileName: string | undefined;
                let docFileName: string | undefined;
                let videoLength: string | null = null;
                let primaryKind = 'other';
                let title = `Lesson ${j + 1}`;

                // Process video file if exists
                if (videoFile) {
                  const videoTitle = lessonFileDto?.title || videoFile.originalname.split('.')[0];
                  title = videoTitle;
                  videoFileName = StringHelper.generateLessonFileName(j + 1, videoTitle, videoFile.originalname);
                  await SojebStorage.put(appConfig().storageUrl.lesson_file + videoFileName, videoFile.buffer);

                  const fileKind = this.getFileKind(videoFile.mimetype);
                  primaryKind = fileKind;

                  if (fileKind === 'video' && this.videoDurationService.isVideoFile(videoFile.mimetype)) {

                    try {
                      videoLength = await this.videoDurationService.calculateVideoLength(videoFile.buffer, videoFile.originalname);

                      if (videoLength) {
                        lessonLengths.push(videoLength);
                      } else {
                        this.logger.warn(`Video length calculation returned null for ${videoFileName}`);
                      }
                    } catch (error) {
                      this.logger.error(`Failed to calculate video length for ${videoFileName}: ${error.message}`, error.stack);
                    }
                  } else {
                  }
                }

                // Process document file if exists
                if (docFile) {
                  const docTitle = lessonFileDto?.title || docFile.originalname.split('.')[0];
                  if (!title || title === `Lesson ${j + 1}`) {
                    title = docTitle;
                  }
                  docFileName = StringHelper.generateLessonFileName(j + 1, docTitle, docFile.originalname);
                  await SojebStorage.put(appConfig().storageUrl.doc_file + docFileName, docFile.buffer);

                  const docFileKind = this.getFileKind(docFile.mimetype);
                  if (!videoFile) {
                    primaryKind = docFileKind;
                  }

                }

                // Create lesson file with both URL and doc if available
                await prisma.lessonFile.create({
                  data: {
                    course_id: course.id,
                    title: title,
                    url: videoFileName || undefined,
                    doc: docFileName || undefined,
                    kind: primaryKind,
                    alt: videoFile?.originalname || docFile?.originalname || `Lesson ${j + 1}`,
                    position: j,
                    video_length: videoLength,
                  },
                });


              }
            }

            // Calculate and update course video length
            if (lessonLengths.length > 0) {
              const courseLength = this.videoDurationService.calculateTotalLength(lessonLengths);
              await prisma.course.update({
                where: { id: course.id },
                data: { video_length: courseLength },
              });

            }
          }


          // Calculate and update series video length
          const courses = await prisma.course.findMany({
            where: { series_id: series.id },
            select: { video_length: true },
          });

          const courseLengths = courses.map(course => course.video_length);
          if (courseLengths.some(length => length)) {
            const seriesLength = this.videoDurationService.calculateTotalLength(courseLengths);
            await prisma.series.update({
              where: { id: series.id },
              data: { video_length: seriesLength },
            });

          }

          // Calculate and update series duration based on start_date and end_date
          if (series.start_date && series.end_date) {
            const duration = this.calculateSeriesDuration(series.start_date, series.end_date);
            await prisma.series.update({
              where: { id: series.id },
              data: { duration },
            });
          }
        }

        return series;
      });

      // Schedule queue jobs after transaction is committed (for future dates only)
      if (result.start_date && result.start_date > new Date()) {
        try {
          await this.seriesPublishService.scheduleSeriesPublication(result.id, result.start_date);

        } catch (error) {
          this.logger.error(`Failed to schedule queue job for series ${result.id}: ${error.message}`, error.stack);
          // Don't fail the entire creation process if queue scheduling fails
        }
      } else if (!result.start_date && !result.end_date) {
        await this.seriesPublishService.publishSeriesImmediately(result.id);
      }


      // Fetch the complete series with relations
      const seriesWithRelations = await this.prisma.series.findUnique({
        where: { id: result.id },
      });



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
  async findAll(page: number = 1, limit: number = 10, search?: string, course_type?: string): Promise<SeriesResponse<{ series: any[]; pagination: any }>> {
    try {


      const skip = (page - 1) * limit;

      const where: any = {};

      // Add search filter
      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' as any } },
          { summary: { contains: search, mode: 'insensitive' as any } },
          { description: { contains: search, mode: 'insensitive' as any } },
        ];
      }

      // Add course type filter
      if (course_type) {
        where.course_type = course_type;
      }


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
            video_length: true,
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
            // courses: {
            //   select: {
            //     id: true,
            //     title: true,
            //     position: true,
            //     price: true,
            //     video_length: true,
            //     created_at: true,
            //     updated_at: true,
            //     intro_video_url: true,
            //     end_video_url: true,
            //     lesson_files: {
            //       select: {
            //         id: true,
            //         title: true,
            //         url: true,
            //         doc: true,
            //         kind: true,
            //         alt: true,
            //         video_length: true,
            //       },
            //       orderBy: { position: 'asc' },
            //     },
            //   },
            //   orderBy: { position: 'asc' },
            // },
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
        // Add series thumbnail URL
        if (seriesItem.thumbnail) {
          seriesItem['thumbnail_url'] = SojebStorage.url(appConfig().storageUrl.series_thumbnail + seriesItem.thumbnail);
        }

        // Calculate total lesson files count
        // const totalLessonFiles = seriesItem.courses?.reduce((total, course) => {
        //   return total + (course.lesson_files?.length || 0);
        // }, 0) || 0;
        // (seriesItem._count as any).lesson_files = totalLessonFiles;

        // Add file URLs to courses and lesson files
        // if (seriesItem.courses && seriesItem.courses.length > 0) {
        //   for (const course of seriesItem.courses) {
        //     // Add course video URLs
        //     if (course.intro_video_url) {
        //       course['intro_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + course.intro_video_url);
        //     }
        //     if (course.end_video_url) {
        //       course['end_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + course.end_video_url);
        //     }

        //     // Add lesson file URLs
        //     if (course.lesson_files && course.lesson_files.length > 0) {
        //       for (const lessonFile of course.lesson_files) {
        //         if (lessonFile.url) {
        //           lessonFile['file_url'] = SojebStorage.url(appConfig().storageUrl.lesson_file + lessonFile.url);
        //         }
        //         if (lessonFile.doc) {
        //           lessonFile['doc_url'] = SojebStorage.url(appConfig().storageUrl.doc_file + lessonFile.doc);
        //         }
        //       }
        //     }
        //   }
        // }
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


  async getSeriesTitle(): Promise<SeriesResponse<any>> {
    const series = await this.prisma.series.findMany({
      select: { id: true, title: true, created_at: true, courses: { select: { id: true, title: true } } },
      orderBy: { created_at: 'desc' },
    });

    return {
      success: true,
      message: 'Series title retrieved successfully',
      data: series,
    };
  }

  async getCourseTitle(series_id: string): Promise<SeriesResponse<any>> {
    const course = await this.prisma.course.findMany({
      where: { series_id: series_id },
      select: { id: true, title: true, created_at: true, lesson_files: { select: { id: true, title: true } } },
      orderBy: { created_at: 'desc' },
    });

    return {
      success: true,
      message: 'Course title retrieved successfully',
      data: course,
    };
  }

  async getLessonTitle(course_id: string): Promise<SeriesResponse<any>> {
    const lesson = await this.prisma.lessonFile.findMany({
      where: { course_id: course_id },
      select: { id: true, title: true, created_at: true },
      orderBy: { created_at: 'desc' },
    });

    return {
      success: true,
      message: 'Lesson title retrieved successfully',
      data: lesson,
    };
  }

  async findAllCourses(page: number = 1, limit: number = 10, search?: string, series_id?: string): Promise<SeriesResponse<{ courses: any[]; pagination: any }>> {
    try {
      const skip = (page - 1) * limit;

      const where: any = {};
      if (series_id) where.series_id = series_id;
      if (search) where.title = { contains: search, mode: 'insensitive' as any };

      const [courses, total] = await Promise.all([
        this.prisma.course.findMany({
          where,
          skip,
          take: limit,
          select: {
            id: true,
            title: true,
            position: true,
            price: true,
            video_length: true,
            created_at: true,
            updated_at: true,
            intro_video_url: true,
            end_video_url: true,
            series: { select: { id: true, title: true } },
          },
          orderBy: [{ series_id: 'asc' }, { position: 'asc' }],
        }),
        this.prisma.course.count({ where }),
      ]);

      // add course start end video
      for (const course of courses) {
        if (course.intro_video_url) {
          course['intro_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + course.intro_video_url);
        }
        if (course.end_video_url) {
          course['end_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + course.end_video_url);
        }
      }

      const totalPages = Math.ceil(total / limit);
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;

      return {
        success: true,
        message: 'Courses retrieved successfully',
        data: {
          courses,
          pagination: { total, page, limit, totalPages, hasNextPage, hasPreviousPage },
        },
      };
    } catch (error) {
      this.logger.error(`Error fetching courses: ${error.message}`, error.stack);
      return { success: false, message: 'Failed to fetch courses', error: error.message };
    }
  }

  async findAllLessons(
    page: number = 1,
    limit: number = 10,
    search?: string,
    series_id?: string,
    course_id?: string,
  ): Promise<SeriesResponse<{ lessons: any[]; pagination: any }>> {
    try {
      const skip = (page - 1) * limit;

      const where: any = {};
      if (course_id) where.course_id = course_id;
      if (series_id) where.course = { series_id };
      if (search) where.title = { contains: search, mode: 'insensitive' as any };

      const [lessons, total] = await Promise.all([
        this.prisma.lessonFile.findMany({
          where,
          skip,
          take: limit,
          select: {
            id: true,
            title: true,
            position: true,
            kind: true,
            alt: true,
            url: true,
            doc: true,
            video_length: true,
            created_at: true,
            updated_at: true,
            course: { select: { id: true, title: true, series: { select: { id: true, title: true } } } },
          },
          orderBy: [{ course_id: 'asc' }, { position: 'asc' }],
        }),
        this.prisma.lessonFile.count({ where }),
      ]);

      // add file urls to lessons
      for (const lesson of lessons) {
        if (lesson.url) {
          lesson['file_url'] = SojebStorage.url(appConfig().storageUrl.lesson_file + lesson.url);
        }
        if (lesson.doc) {
          lesson['doc_url'] = SojebStorage.url(appConfig().storageUrl.doc_file + lesson.doc);
        }
      }

      const totalPages = Math.ceil(total / limit);
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;

      return {
        success: true,
        message: 'Lessons retrieved successfully',
        data: {
          lessons,
          pagination: { total, page, limit, totalPages, hasNextPage, hasPreviousPage },
        },
      };
    } catch (error) {
      this.logger.error(`Error fetching lessons: ${error.message}`, error.stack);
      return { success: false, message: 'Failed to fetch lessons', error: error.message };
    }
  }

  async findOneCourse(id: string): Promise<SeriesResponse<any>> {
    try {
      const course = await this.prisma.course.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          position: true,
          price: true,
          video_length: true,
          created_at: true,
          updated_at: true,
          intro_video_url: true,
          end_video_url: true,
          series: { select: { id: true, title: true } },
          lesson_files: {
            select: {
              id: true,
              title: true,
              position: true,
              kind: true,
              alt: true,
              url: true,
              doc: true,
              video_length: true,
              created_at: true,
              updated_at: true,
            },
            orderBy: { position: 'asc' },
          },
        },
      });

      if (!course) {
        return {
          success: false,
          message: 'Course not found',
          error: 'Course not found',
        };
      }

      // Add course video URLs
      if (course.intro_video_url) {
        course['intro_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + course.intro_video_url);
      }
      if (course.end_video_url) {
        course['end_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + course.end_video_url);
      }

      // Add lesson file URLs
      for (const lessonFile of course.lesson_files) {
        if (lessonFile.url) {
          lessonFile['file_url'] = SojebStorage.url(appConfig().storageUrl.lesson_file + lessonFile.url);
        }
        if (lessonFile.doc) {
          lessonFile['doc_url'] = SojebStorage.url(appConfig().storageUrl.doc_file + lessonFile.doc);
        }
      }

      return {
        success: true,
        message: 'Course retrieved successfully',
        data: course,
      };
    } catch (error) {
      this.logger.error(`Error fetching course: ${error.message}`, error.stack);
      return { success: false, message: 'Failed to fetch course', error: error.message };
    }
  }

  async findOneLesson(id: string): Promise<SeriesResponse<any>> {
    try {
      const lesson = await this.prisma.lessonFile.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          position: true,
          kind: true,
          alt: true,
          url: true,
          doc: true,
          video_length: true,
          created_at: true,
          updated_at: true,
          course: {
            select: {
              id: true,
              title: true,
              series: { select: { id: true, title: true } }
            }
          },
        },
      });

      if (!lesson) {
        return {
          success: false,
          message: 'Lesson not found',
          error: 'Lesson not found',
        };
      }

      // Add file URLs
      if (lesson.url) {
        lesson['file_url'] = SojebStorage.url(appConfig().storageUrl.lesson_file + lesson.url);
      }
      if (lesson.doc) {
        lesson['doc_url'] = SojebStorage.url(appConfig().storageUrl.doc_file + lesson.doc);
      }

      return {
        success: true,
        message: 'Lesson retrieved successfully',
        data: lesson,
      };
    } catch (error) {
      this.logger.error(`Error fetching lesson: ${error.message}`, error.stack);
      return { success: false, message: 'Failed to fetch lesson', error: error.message };
    }
  }



  /**
   * Get a single series by ID
   */
  async findOne(id: string): Promise<SeriesResponse<Series>> {
    try {


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
              quizzes: true,
              assignments: true,
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

      // Calculate total lesson files count
      const totalLessonFiles = series.courses?.reduce((total, course) => {
        return total + (course.lesson_files?.length || 0);
      }, 0) || 0;
      (series._count as any).lesson_files = totalLessonFiles;

      // Add file URLs to courses and lesson files
      if (series.courses && series.courses.length > 0) {
        for (const course of series.courses) {
          // Add course video URLs
          if (course.intro_video_url) {
            course['intro_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + course.intro_video_url);
          }
          if (course.end_video_url) {
            course['end_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + course.end_video_url);
          }

          // Add lesson file URLs
          if (course.lesson_files && course.lesson_files.length > 0) {
            for (const lessonFile of course.lesson_files) {
              if (lessonFile.url) {
                lessonFile['file_url'] = SojebStorage.url(appConfig().storageUrl.lesson_file + lessonFile.url);
              }
              if (lessonFile.doc) {
                lessonFile['doc_url'] = SojebStorage.url(appConfig().storageUrl.doc_file + lessonFile.doc);
              }
            }
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

        // Calculate duration if both dates are provided
        if (updateData.start_date && updateData.end_date) {
          updateData.duration = this.calculateSeriesDuration(updateData.start_date, updateData.end_date);
        }

        // Handle publication scheduling
        if (updateData.start_date) {
          const newStartDate = updateData.start_date;
          const now = new Date();

          if (newStartDate > now) {
            // Future start date - schedule publication
            updateData.publication_status = 'SCHEDULED';
            updateData.scheduled_publish_at = newStartDate;

          } else {
            // Past or current start date - publish immediately
            updateData.visibility = 'PUBLISHED';
            updateData.publication_status = 'PUBLISHED';
            updateData.scheduled_publish_at = null;

          }
        }

        const series = await prisma.series.update({
          where: { id },
          data: updateData,
        });

        return series;
      });

      // Handle queue scheduling after transaction is committed
      if (updateSeriesDto.start_date) {
        const newStartDate = new Date(updateSeriesDto.start_date);
        const now = new Date();

        if (newStartDate > now) {
          // Future start date - schedule publication
          try {
            await this.seriesPublishService.scheduleSeriesPublication(id, newStartDate);

          } catch (error) {
            this.logger.error(`Failed to schedule queue job for series ${id}: ${error.message}`, error.stack);
          }
        } else {
          // Past or current start date - cancel any existing scheduled jobs
          try {
            await this.seriesPublishService.cancelScheduledPublication(id);

          } catch (error) {
            this.logger.error(`Failed to cancel scheduled jobs for series ${id}: ${error.message}`, error.stack);
          }
        }
      }

      // Fetch the complete updated series with relations
      const seriesWithRelations = await this.prisma.series.findUnique({
        where: { id },
        include: {
          courses: {
            orderBy: { position: 'asc' },
            include: {
              lesson_files: {
                orderBy: { position: 'asc' },
              },
            },
          },
        }
      });

      // Add file URLs to series
      if (seriesWithRelations?.thumbnail) {
        seriesWithRelations['thumbnail_url'] = SojebStorage.url(appConfig().storageUrl.series_thumbnail + seriesWithRelations.thumbnail);
      }

      // Add file URLs to courses and lesson files
      if (seriesWithRelations?.courses && seriesWithRelations.courses.length > 0) {
        for (const course of seriesWithRelations.courses) {
          // Add course video URLs
          if (course.intro_video_url) {
            course['intro_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + course.intro_video_url);
          }
          if (course.end_video_url) {
            course['end_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + course.end_video_url);
          }

          // Add lesson file URLs
          if (course.lesson_files && course.lesson_files.length > 0) {
            for (const lessonFile of course.lesson_files) {
              if (lessonFile.url) {
                lessonFile['file_url'] = SojebStorage.url(appConfig().storageUrl.lesson_file + lessonFile.url);
              }
              if (lessonFile.doc) {
                lessonFile['doc_url'] = SojebStorage.url(appConfig().storageUrl.doc_file + lessonFile.doc);
              }
            }
          }
        }
      }



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
                  video_length: true,
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

  async removeCourse(id: string): Promise<SeriesResponse<{ id: string }>> {
    try {
      const existingCourse = await this.prisma.course.findUnique({
        where: { id },
        select: {
          id: true,
          intro_video_url: true,
          end_video_url: true,
          lesson_files: {
            select: { id: true, url: true, doc: true },
          },
        },
      });

      if (!existingCourse) {
        throw new NotFoundException(`Course with ID ${id} not found`);
      }

      try {
        if (existingCourse.intro_video_url) {
          await SojebStorage.delete(appConfig().storageUrl.module_file + existingCourse.intro_video_url);
        }
        if (existingCourse.end_video_url) {
          await SojebStorage.delete(appConfig().storageUrl.module_file + existingCourse.end_video_url);
        }
        if (existingCourse.lesson_files && existingCourse.lesson_files.length > 0) {
          for (const lf of existingCourse.lesson_files) {
            if (lf.url) {
              try {
                await SojebStorage.delete(appConfig().storageUrl.lesson_file + lf.url);
              } catch (err) {
                this.logger.warn(`Failed to delete lesson video file: ${err.message}`);
              }
            }
            if (lf.doc) {
              try {
                await SojebStorage.delete(appConfig().storageUrl.doc_file + lf.doc);
              } catch (err) {
                this.logger.warn(`Failed to delete lesson doc file: ${err.message}`);
              }
            }
          }
        }
      } catch (err) {
        this.logger.warn(`Failed to delete some course files: ${err.message}`);
      }

      await this.prisma.course.delete({ where: { id } });

      return {
        success: true,
        message: 'Course deleted successfully',
        data: { id },
      };
    } catch (error) {
      this.logger.error(`Error deleting course ${id}: ${error.message}`, error.stack);
      if (error instanceof NotFoundException) throw error;
      return { success: false, message: 'Failed to delete course', error: error.message };
    }
  }

  async removeLessonFile(id: string): Promise<SeriesResponse<{ id: string }>> {
    try {
      const existingLesson = await this.prisma.lessonFile.findUnique({
        where: { id },
        select: { id: true, url: true, doc: true },
      });

      if (!existingLesson) {
        throw new NotFoundException(`Lesson file with ID ${id} not found`);
      }

      try {
        if (existingLesson.url) {
          await SojebStorage.delete(appConfig().storageUrl.lesson_file + existingLesson.url);
        }
        if (existingLesson.doc) {
          await SojebStorage.delete(appConfig().storageUrl.doc_file + existingLesson.doc);
        }
      } catch (err) {
        this.logger.warn(`Failed to delete some lesson files: ${err.message}`);
      }

      await this.prisma.lessonFile.delete({ where: { id } });

      return {
        success: true,
        message: 'Lesson file deleted successfully',
        data: { id },
      };
    } catch (error) {
      this.logger.error(`Error deleting lesson file ${id}: ${error.message}`, error.stack);
      if (error instanceof NotFoundException) throw error;
      return { success: false, message: 'Failed to delete lesson file', error: error.message };
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
   * Upload large file with progress tracking
   */
  private async uploadLargeFileWithProgress(
    key: string,
    file: Express.Multer.File,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    try {
      const fileSize = file.size;
      let uploadedBytes = 0;

      // Create readable stream from buffer (simulating chunked upload)
      const stream = require('stream');
      const bufferStream = new stream.PassThrough();
      bufferStream.end(file.buffer);

      // Use enhanced storage adapter
      await SojebStorage.putLargeFile(key, bufferStream, (bytesWritten) => {
        uploadedBytes = bytesWritten;
        const progress = Math.round((uploadedBytes / fileSize) * 100);
        if (onProgress) {
          onProgress(progress);
        }
      });

      this.logger.log(`Large file upload completed: ${key}`);
    } catch (error) {
      this.logger.error(`Error uploading large file: ${error.message}`, error.stack);
      throw error;
    }
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

  /**
   * Calculate series duration from start_date to end_date
   */
  private calculateSeriesDuration(startDate: Date, endDate: Date): string {
    const diffInMs = endDate.getTime() - startDate.getTime();
    const diffInDays = Math.ceil(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInDays < 7) {
      return `${diffInDays} day${diffInDays > 1 ? 's' : ''}`;
    } else if (diffInDays < 30) {
      const weeks = Math.floor(diffInDays / 7);
      const remainingDays = diffInDays % 7;
      let result = `${weeks} week${weeks > 1 ? 's' : ''}`;
      if (remainingDays > 0) {
        result += ` ${remainingDays} day${remainingDays > 1 ? 's' : ''}`;
      }
      return result;
    } else if (diffInDays < 365) {
      const months = Math.floor(diffInDays / 30);
      const remainingDays = diffInDays % 30;
      let result = `${months} month${months > 1 ? 's' : ''}`;
      if (remainingDays > 0) {
        const weeks = Math.floor(remainingDays / 7);
        if (weeks > 0) {
          result += ` ${weeks} week${weeks > 1 ? 's' : ''}`;
        }
      }
      return result;
    } else {
      const years = Math.floor(diffInDays / 365);
      const remainingDays = diffInDays % 365;
      let result = `${years} year${years > 1 ? 's' : ''}`;
      if (remainingDays > 0) {
        const months = Math.floor(remainingDays / 30);
        if (months > 0) {
          result += ` ${months} month${months > 1 ? 's' : ''}`;
        }
      }
      return result;
    }
  }

  /**
   * Publish a series immediately
   */
  async publishSeries(id: string): Promise<SeriesResponse<Series>> {
    try {


      const series = await this.prisma.series.findUnique({
        where: { id },
      });

      if (!series) {
        throw new NotFoundException(`Series with ID ${id} not found`);
      }

      await this.seriesPublishService.publishSeriesImmediately(id);

      const updatedSeries = await this.prisma.series.findUnique({
        where: { id },
      });



      return {
        success: true,
        message: 'Series published successfully',
        data: updatedSeries,
      };
    } catch (error) {
      this.logger.error(`Error publishing series ${id}: ${error.message}`, error.stack);

      if (error instanceof NotFoundException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to publish series',
        error: error.message,
      };
    }
  }

  /**
   * Get publication status of a series
   */
  async getSeriesPublicationStatus(id: string): Promise<SeriesResponse<any>> {
    try {


      const series = await this.prisma.series.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          publication_status: true,
          scheduled_publish_at: true,
          visibility: true,
          start_date: true,
        },
      });

      if (!series) {
        throw new NotFoundException(`Series with ID ${id} not found`);
      }

      const status = await this.seriesPublishService.getSeriesPublicationStatus(id);

      return {
        success: true,
        message: 'Series publication status retrieved successfully',
        data: {
          ...series,
          ...status,
        },
      };
    } catch (error) {
      this.logger.error(`Error getting publication status for series ${id}: ${error.message}`, error.stack);

      if (error instanceof NotFoundException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to get series publication status',
        error: error.message,
      };
    }
  }

  /**
   * Cancel scheduled publication for a series
   */
  async cancelScheduledPublication(id: string): Promise<SeriesResponse<Series>> {
    try {


      const series = await this.prisma.series.findUnique({
        where: { id },
      });

      if (!series) {
        throw new NotFoundException(`Series with ID ${id} not found`);
      }

      await this.seriesPublishService.cancelScheduledPublication(id);

      const updatedSeries = await this.prisma.series.findUnique({
        where: { id },
      });



      return {
        success: true,
        message: 'Scheduled publication cancelled successfully',
        data: updatedSeries,
      };
    } catch (error) {
      this.logger.error(`Error cancelling scheduled publication for series ${id}: ${error.message}`, error.stack);

      if (error instanceof NotFoundException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to cancel scheduled publication',
        error: error.message,
      };
    }
  }

  /**
   * Create a new course for a series
   */
  async createCourse(
    createCourseDto: CreateCourseDto,
    files: {
      introVideo?: Express.Multer.File;
      endVideo?: Express.Multer.File;
      videoFiles?: Express.Multer.File[];
      docFiles?: Express.Multer.File[];
    }
  ): Promise<SeriesResponse<any>> {
    try {
      // Check if series exists
      const existingSeries = await this.prisma.series.findUnique({
        where: { id: createCourseDto.series_id },
        select: { id: true, title: true },
      });

      if (!existingSeries) {
        throw new NotFoundException(`Series with ID ${createCourseDto.series_id} not found`);
      }

      // Handle intro video file upload if provided
      let introVideoUrl: string | undefined;
      if (files.introVideo) {
        introVideoUrl = StringHelper.generateRandomFileName(files.introVideo.originalname);
        await SojebStorage.put(appConfig().storageUrl.module_file + introVideoUrl, files.introVideo.buffer);
      }

      // Handle end video file upload if provided
      let endVideoUrl: string | undefined;
      if (files.endVideo) {
        endVideoUrl = StringHelper.generateRandomFileName(files.endVideo.originalname);
        await SojebStorage.put(appConfig().storageUrl.module_file + endVideoUrl, files.endVideo.buffer);
      }


      const course = await this.prisma.course.findMany({
        where: { series_id: createCourseDto.series_id },
        orderBy: { position: 'desc' },
        take: 1,
      });
      const coursePosition = course.length > 0 ? course[0].position + 1 : 0;

      // Create course with lesson files in a transaction
      const result = await this.prisma.$transaction(async (prisma) => {
        // Create the course
        const course = await prisma.course.create({
          data: {
            series_id: createCourseDto.series_id,
            title: createCourseDto.title,
            position: createCourseDto.position || coursePosition,
            price: createCourseDto.price || 0,
            intro_video_url: introVideoUrl,
            end_video_url: endVideoUrl,
          },
        });

        // Handle lesson files (combining video and document files)
        const lessonLengths: string[] = [];
        const maxFiles = Math.max(
          files.videoFiles?.length || 0,
          files.docFiles?.length || 0
        );

        if (maxFiles > 0) {
          for (let j = 0; j < maxFiles; j++) {
            const videoFile = files.videoFiles?.[j];
            const docFile = files.docFiles?.[j];
            const lessonFileDto = createCourseDto.lessons_files?.[j];

            let videoFileName: string | undefined;
            let docFileName: string | undefined;
            let videoLength: string | null = null;
            let primaryKind = 'other';
            let title = `Lesson ${j + 1}`;

            // Process video file if exists
            if (videoFile) {
              const videoTitle = lessonFileDto?.title || videoFile.originalname.split('.')[0];
              title = videoTitle;
              videoFileName = StringHelper.generateLessonFileName(j + 1, videoTitle, videoFile.originalname);
              await SojebStorage.put(appConfig().storageUrl.lesson_file + videoFileName, videoFile.buffer);

              const fileKind = this.getFileKind(videoFile.mimetype);
              primaryKind = fileKind;

              if (fileKind === 'video' && this.videoDurationService.isVideoFile(videoFile.mimetype)) {
                try {
                  videoLength = await this.videoDurationService.calculateVideoLength(videoFile.buffer, videoFile.originalname);

                  if (videoLength) {
                    lessonLengths.push(videoLength);
                  } else {
                    this.logger.warn(`Video length calculation returned null for ${videoFileName}`);
                  }
                } catch (error) {
                  this.logger.error(`Failed to calculate video length for ${videoFileName}: ${error.message}`, error.stack);
                }
              }
            }

            // Process document file if exists
            if (docFile) {
              const docTitle = lessonFileDto?.title || docFile.originalname.split('.')[0];
              if (!title || title === `Lesson ${j + 1}`) {
                title = docTitle;
              }
              docFileName = StringHelper.generateLessonFileName(j + 1, docTitle, docFile.originalname);
              await SojebStorage.put(appConfig().storageUrl.doc_file + docFileName, docFile.buffer);

              const docFileKind = this.getFileKind(docFile.mimetype);
              if (!videoFile) {
                primaryKind = docFileKind;
              }
            }

            // Create lesson file with both URL and doc if available
            await prisma.lessonFile.create({
              data: {
                course_id: course.id,
                title: title,
                url: videoFileName || undefined,
                doc: docFileName || undefined,
                kind: primaryKind,
                alt: videoFile?.originalname || docFile?.originalname || `Lesson ${j + 1}`,
                position: j,
                video_length: videoLength,
              },
            });
          }
        }

        // Calculate and update course video length
        if (lessonLengths.length > 0) {
          const courseLength = this.videoDurationService.calculateTotalLength(lessonLengths);
          await prisma.course.update({
            where: { id: course.id },
            data: { video_length: courseLength },
          });
        }

        return course;
      });

      // Update series total price and video length
      await this.updateSeriesTotalsPrice(createCourseDto.series_id);
      await this.updateSeriesTotalsVideoLength(createCourseDto.series_id);

      // Fetch the complete course with relations
      const courseWithRelations = await this.prisma.course.findUnique({
        where: { id: result.id },
        include: {
          lesson_files: {
            orderBy: { position: 'asc' },
          },
          series: {
            select: {
              id: true,
              title: true,
              slug: true,
            },
          },
        },
      });

      // Add file URLs
      if (courseWithRelations?.intro_video_url) {
        courseWithRelations['intro_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + courseWithRelations.intro_video_url);
      }
      if (courseWithRelations?.end_video_url) {
        courseWithRelations['end_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + courseWithRelations.end_video_url);
      }

      if (courseWithRelations?.lesson_files && courseWithRelations.lesson_files.length > 0) {
        for (const lessonFile of courseWithRelations.lesson_files) {
          if (lessonFile.url) {
            lessonFile['file_url'] = SojebStorage.url(appConfig().storageUrl.lesson_file + lessonFile.url);
          }
          if (lessonFile.doc) {
            lessonFile['doc_url'] = SojebStorage.url(appConfig().storageUrl.doc_file + lessonFile.doc);
          }
        }
      }

      return {
        success: true,
        message: 'Course created successfully',
        data: courseWithRelations,
      };
    } catch (error) {
      this.logger.error(`Error creating course for series ${createCourseDto.series_id}: ${error.message}`, error.stack);

      if (error instanceof NotFoundException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to create course',
        error: error.message,
      };
    }
  }

  /**
   * Create a new lesson file for a course
   */
  async createLessonFile(
    createLessonFileDto: CreateLessonFileDto,
    files: {
      videoFile?: Express.Multer.File;
      docFile?: Express.Multer.File;
    }
  ): Promise<SeriesResponse<any>> {
    try {
      // Check if course exists
      const existingCourse = await this.prisma.course.findUnique({
        where: { id: createLessonFileDto.course_id },
        select: {
          id: true,
          title: true,
          series_id: true,
          lesson_files: {
            select: { position: true },
            orderBy: { position: 'desc' },
            take: 1,
          }
        },
      });

      if (!existingCourse) {
        throw new NotFoundException(`Course with ID ${createLessonFileDto.course_id} not found`);
      }

      // Determine position if not provided
      const position = createLessonFileDto.position !== undefined
        ? createLessonFileDto.position
        : (existingCourse.lesson_files[0]?.position || 0) + 1;

      let videoFileName: string | undefined;
      let docFileName: string | undefined;
      let videoLength: string | null = null;
      let primaryKind = 'other';
      let title = createLessonFileDto.title || `Lesson ${position}`;

      // Process video file if exists
      if (files.videoFile) {
        const videoTitle = createLessonFileDto.title || files.videoFile.originalname.split('.')[0];
        title = videoTitle;
        videoFileName = StringHelper.generateLessonFileName(position, videoTitle, files.videoFile.originalname);

        // Check if file is large (>100MB) and use streaming upload
        const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024; // 100MB
        if (files.videoFile.size > LARGE_FILE_THRESHOLD) {
          this.logger.log(`Uploading large video file: ${videoFileName} (${Math.round(files.videoFile.size / 1024 / 1024)}MB)`);
          await this.uploadLargeFileWithProgress(
            appConfig().storageUrl.lesson_file + videoFileName,
            files.videoFile,
            (progress) => {
              this.logger.log(`Video upload progress: ${progress}%`);
            }
          );
        } else {
          await SojebStorage.put(appConfig().storageUrl.lesson_file + videoFileName, files.videoFile.buffer);
        }

        const fileKind = this.getFileKind(files.videoFile.mimetype);
        primaryKind = fileKind;

        if (fileKind === 'video' && this.videoDurationService.isVideoFile(files.videoFile.mimetype)) {
          try {
            videoLength = await this.videoDurationService.calculateVideoLength(files.videoFile.buffer, files.videoFile.originalname);
          } catch (error) {
            this.logger.error(`Failed to calculate video length for ${videoFileName}: ${error.message}`, error.stack);
          }
        }
      }

      // Process document file if exists
      if (files.docFile) {
        const docTitle = createLessonFileDto.title || files.docFile.originalname.split('.')[0];
        if (!title || title === `Lesson ${position}`) {
          title = docTitle;
        }
        docFileName = StringHelper.generateLessonFileName(position, docTitle, files.docFile.originalname);

        // Check if file is large (>100MB) and use streaming upload
        const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024; // 100MB
        if (files.docFile.size > LARGE_FILE_THRESHOLD) {
          this.logger.log(`Uploading large document file: ${docFileName} (${Math.round(files.docFile.size / 1024 / 1024)}MB)`);
          await this.uploadLargeFileWithProgress(
            appConfig().storageUrl.doc_file + docFileName,
            files.docFile,
            (progress) => {
              this.logger.log(`Document upload progress: ${progress}%`);
            }
          );
        } else {
          await SojebStorage.put(appConfig().storageUrl.doc_file + docFileName, files.docFile.buffer);
        }

        const docFileKind = this.getFileKind(files.docFile.mimetype);
        if (!files.videoFile) {
          primaryKind = docFileKind;
        }
      }

      // Create lesson file in a transaction
      const result = await this.prisma.$transaction(async (prisma) => {
        // Create the lesson file
        const lessonFile = await prisma.lessonFile.create({
          data: {
            course_id: createLessonFileDto.course_id,
            title: title,
            url: videoFileName || undefined,
            doc: docFileName || undefined,
            kind: primaryKind,
            alt: files.videoFile?.originalname || files.docFile?.originalname || `Lesson ${position}`,
            position: position,
            video_length: videoLength,
          },
        });

        return lessonFile;
      });

      // Update course video length if video was added
      if (files.videoFile && videoLength) {
        const course = await this.prisma.course.findUnique({
          where: { id: createLessonFileDto.course_id },
          include: {
            lesson_files: {
              select: { video_length: true },
            },
          },
        });

        if (course && course.lesson_files.length > 0) {
          const lessonLengths = course.lesson_files
            .map(lesson => lesson.video_length)
            .filter(length => length);

          if (lessonLengths.length > 0) {
            const courseLength = this.videoDurationService.calculateTotalLength(lessonLengths);
            await this.prisma.course.update({
              where: { id: createLessonFileDto.course_id },
              data: { video_length: courseLength },
            });
          }
        }
      }

      // Update series video length
      await this.updateSeriesTotalsVideoLength(existingCourse.series_id);

      // Fetch the complete lesson file with relations
      const lessonFileWithRelations = await this.prisma.lessonFile.findUnique({
        where: { id: result.id },
        include: {
          course: {
            select: {
              id: true,
              title: true,
              series: {
                select: {
                  id: true,
                  title: true,
                  slug: true,
                },
              },
            },
          },
        },
      });

      // Add file URLs
      if (lessonFileWithRelations?.url) {
        lessonFileWithRelations['file_url'] = SojebStorage.url(appConfig().storageUrl.lesson_file + lessonFileWithRelations.url);
      }
      if (lessonFileWithRelations?.doc) {
        lessonFileWithRelations['doc_url'] = SojebStorage.url(appConfig().storageUrl.doc_file + lessonFileWithRelations.doc);
      }

      return {
        success: true,
        message: 'Lesson file created successfully',
        data: lessonFileWithRelations,
      };
    } catch (error) {
      this.logger.error(`Error creating lesson file for course ${createLessonFileDto.course_id}: ${error.message}`, error.stack);

      if (error instanceof NotFoundException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to create lesson file',
        error: error.message,
      };
    }
  }

  /**
   * Update a course by ID
   */
  async updateCourse(
    courseId: string,
    updateData: UpdateCourseDto,
    introVideo?: Express.Multer.File,
    endVideo?: Express.Multer.File
  ): Promise<SeriesResponse<any>> {
    try {
      // Check if course exists
      const existingCourse = await this.prisma.course.findUnique({
        where: { id: courseId },
        select: {
          id: true,
          title: true,
          intro_video_url: true,
          end_video_url: true,
          series_id: true
        },
      });

      if (!existingCourse) {
        throw new NotFoundException(`Course with ID ${courseId} not found`);
      }

      // Handle intro video file upload if provided
      let introVideoUrl: string | undefined;
      if (introVideo) {
        // Delete old intro video if exists
        if (existingCourse.intro_video_url) {
          try {
            await SojebStorage.delete(appConfig().storageUrl.module_file + existingCourse.intro_video_url);
          } catch (error) {
            this.logger.warn(`Failed to delete old intro video: ${error.message}`);
          }
        }

        // Upload new intro video
        introVideoUrl = StringHelper.generateRandomFileName(introVideo.originalname);
        await SojebStorage.put(appConfig().storageUrl.module_file + introVideoUrl, introVideo.buffer);
      }

      // Handle end video file upload if provided
      let endVideoUrl: string | undefined;
      if (endVideo) {
        // Delete old end video if exists
        if (existingCourse.end_video_url) {
          try {
            await SojebStorage.delete(appConfig().storageUrl.module_file + existingCourse.end_video_url);
          } catch (error) {
            this.logger.warn(`Failed to delete old end video: ${error.message}`);
          }
        }

        // Upload new end video
        endVideoUrl = StringHelper.generateRandomFileName(endVideo.originalname);
        await SojebStorage.put(appConfig().storageUrl.module_file + endVideoUrl, endVideo.buffer);
      }

      // Update course
      const updatedCourse = await this.prisma.course.update({
        where: { id: courseId },
        data: {
          ...updateData,
          ...(introVideoUrl && { intro_video_url: introVideoUrl }),
          ...(endVideoUrl && { end_video_url: endVideoUrl }),
        },
        include: {
          lesson_files: {
            orderBy: { position: 'asc' },
          },
        },
      });

      // Update series total price and video length
      await this.updateSeriesTotalsPrice(existingCourse.series_id);

      // Add file URLs
      if (updatedCourse.intro_video_url) {
        updatedCourse['intro_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + updatedCourse.intro_video_url);
      }
      if (updatedCourse.end_video_url) {
        updatedCourse['end_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + updatedCourse.end_video_url);
      }

      if (updatedCourse.lesson_files && updatedCourse.lesson_files.length > 0) {
        for (const lessonFile of updatedCourse.lesson_files) {
          if (lessonFile.url) {
            lessonFile['file_url'] = SojebStorage.url(appConfig().storageUrl.lesson_file + lessonFile.url);
          }
          if (lessonFile.doc) {
            lessonFile['doc_url'] = SojebStorage.url(appConfig().storageUrl.doc_file + lessonFile.doc);
          }
        }
      }

      return {
        success: true,
        message: 'Course updated successfully',
        data: updatedCourse,
      };
    } catch (error) {
      this.logger.error(`Error updating course ${courseId}: ${error.message}`, error.stack);

      if (error instanceof NotFoundException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to update course',
        error: error.message,
      };
    }
  }

  /**
   * Update a lesson file by ID
   */
  async updateLesson(
    lessonId: string,
    updateData: {
      title?: string;
      position?: number;
      alt?: string;
    },
    videoFile?: Express.Multer.File,
    docFile?: Express.Multer.File
  ): Promise<SeriesResponse<any>> {
    try {

      // Check if lesson exists
      const existingLesson = await this.prisma.lessonFile.findUnique({
        where: { id: lessonId },
        select: {
          id: true,
          title: true,
          url: true,
          doc: true,
          kind: true,
          position: true,
          course: {
            select: {
              series_id: true
            }
          }
        },
      });

      if (!existingLesson) {
        throw new NotFoundException(`Lesson with ID ${lessonId} not found`);
      }

      let videoFileName: string | undefined;
      let docFileName: string | undefined;
      let videoLength: string | null = null;
      let primaryKind = existingLesson.kind;

      // Handle video file upload if provided
      if (videoFile) {
        // Delete old video file if exists
        if (existingLesson.url) {
          try {
            await SojebStorage.delete(appConfig().storageUrl.lesson_file + existingLesson.url);
          } catch (error) {
            this.logger.warn(`Failed to delete old video file: ${error.message}`);
          }
        }

        // Upload new video file
        const videoTitle = updateData.title || videoFile.originalname.split('.')[0];
        videoFileName = StringHelper.generateLessonFileName(existingLesson.position || 0, videoTitle, videoFile.originalname);
        await SojebStorage.put(appConfig().storageUrl.lesson_file + videoFileName, videoFile.buffer);

        const fileKind = this.getFileKind(videoFile.mimetype);
        primaryKind = fileKind;

        // Calculate video length if it's a video file
        if (fileKind === 'video' && this.videoDurationService.isVideoFile(videoFile.mimetype)) {
          try {
            videoLength = await this.videoDurationService.calculateVideoLength(videoFile.buffer, videoFile.originalname);
          } catch (error) {
            this.logger.error(`Failed to calculate video length: ${error.message}`, error.stack);
          }
        }
      }

      // Handle document file upload if provided
      if (docFile) {
        // Delete old document file if exists
        if (existingLesson.doc) {
          try {
            await SojebStorage.delete(appConfig().storageUrl.doc_file + existingLesson.doc);
          } catch (error) {
            this.logger.warn(`Failed to delete old document file: ${error.message}`);
          }
        }

        // Upload new document file
        const docTitle = updateData.title || docFile.originalname.split('.')[0];
        docFileName = StringHelper.generateLessonFileName(existingLesson.position || 0, docTitle, docFile.originalname);
        await SojebStorage.put(appConfig().storageUrl.doc_file + docFileName, docFile.buffer);

        const docFileKind = this.getFileKind(docFile.mimetype);
        if (!videoFile) {
          primaryKind = docFileKind;
        }
      }

      // Update lesson file
      const updatedLesson = await this.prisma.lessonFile.update({
        where: { id: lessonId },
        data: {
          ...updateData,
          ...(videoFileName && { url: videoFileName }),
          ...(docFileName && { doc: docFileName }),
          ...(videoLength && { video_length: videoLength }),
          kind: primaryKind,
        },
      });

      await this.updateSeriesTotalsVideoLength(existingLesson.course.series_id);

      // Add file URLs
      if (updatedLesson.url) {
        updatedLesson['file_url'] = SojebStorage.url(appConfig().storageUrl.lesson_file + updatedLesson.url);
      }
      if (updatedLesson.doc) {
        updatedLesson['doc_url'] = SojebStorage.url(appConfig().storageUrl.doc_file + updatedLesson.doc);
      }

      // Recalculate course video length if video was updated
      if (videoFile && videoLength) {
        // First, get the course_id from the lesson
        const lessonWithCourse = await this.prisma.lessonFile.findUnique({
          where: { id: lessonId },
          select: { course_id: true }
        });

        if (lessonWithCourse) {
          const course = await this.prisma.course.findUnique({
            where: { id: lessonWithCourse.course_id },
            include: {
              lesson_files: {
                select: { video_length: true },
              },
            },
          });

          if (course && course.lesson_files.length > 0) {
            const lessonLengths = course.lesson_files
              .map(lesson => lesson.video_length)
              .filter(length => length);

            if (lessonLengths.length > 0) {
              const courseLength = this.videoDurationService.calculateTotalLength(lessonLengths);
              await this.prisma.course.update({
                where: { id: lessonWithCourse.course_id },
                data: { video_length: courseLength },
              });
            }
          }
        }
      }

      return {
        success: true,
        message: 'Lesson updated successfully',
        data: updatedLesson,
      };
    } catch (error) {
      this.logger.error(`Error updating lesson ${lessonId}: ${error.message}`, error.stack);

      if (error instanceof NotFoundException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to update lesson',
        error: error.message,
      };
    }
  }

  /**
   * Comprehensive update method for series, courses, and lessons
   */
  async updateAll(
    seriesId: string,
    updateData: {
      series?: UpdateSeriesDto;
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
    files?: {
      thumbnail?: Express.Multer.File;
      courseFiles?: {
        courseId: string;
        introVideo?: Express.Multer.File;
        endVideo?: Express.Multer.File;
      }[];
      lessonFiles?: {
        lessonId: string;
        videoFile?: Express.Multer.File;
        docFile?: Express.Multer.File;
      }[];
    }
  ): Promise<SeriesResponse<any>> {
    try {
      // Check if series exists
      const existingSeries = await this.prisma.series.findUnique({
        where: { id: seriesId },
        select: { id: true, slug: true, thumbnail: true },
      });

      if (!existingSeries) {
        throw new NotFoundException(`Series with ID ${seriesId} not found`);
      }

      // Handle series thumbnail upload if provided
      let thumbnailFileName: string | undefined;
      if (files?.thumbnail) {
        // Delete old thumbnail if exists
        if (existingSeries.thumbnail) {
          try {
            await SojebStorage.delete(appConfig().storageUrl.series_thumbnail + existingSeries.thumbnail);
          } catch (error) {
            this.logger.warn(`Failed to delete old thumbnail: ${error.message}`);
          }
        }

        // Upload new thumbnail
        thumbnailFileName = StringHelper.generateRandomFileName(files.thumbnail.originalname);
        await SojebStorage.put(appConfig().storageUrl.series_thumbnail + thumbnailFileName, files.thumbnail.buffer);
      }

      // Generate slug from title if title is being updated
      let slug = updateData.series?.slug;
      if (updateData.series?.title && !updateData.series?.slug) {
        slug = StringHelper.slugify(updateData.series.title);

        // Check if new slug already exists (excluding current series)
        const slugExists = await this.prisma.series.findFirst({
          where: {
            slug,
            id: { not: seriesId },
          },
        });

        if (slugExists) {
          throw new BadRequestException(`Series with slug '${slug}' already exists`);
        }
      }

      // Update everything in a transaction
      const result = await this.prisma.$transaction(async (prisma) => {
        // Update series
        if (updateData.series) {
          const seriesUpdateData: any = { ...updateData.series };
          if (slug) seriesUpdateData.slug = slug;
          if (thumbnailFileName) seriesUpdateData.thumbnail = thumbnailFileName;
          if (updateData.series.start_date) seriesUpdateData.start_date = new Date(updateData.series.start_date);
          if (updateData.series.end_date) seriesUpdateData.end_date = new Date(updateData.series.end_date);

          // Calculate duration if both dates are provided
          if (seriesUpdateData.start_date && seriesUpdateData.end_date) {
            seriesUpdateData.duration = this.calculateSeriesDuration(seriesUpdateData.start_date, seriesUpdateData.end_date);
          }

          // Handle publication scheduling
          if (seriesUpdateData.start_date) {
            const newStartDate = seriesUpdateData.start_date;
            const now = new Date();

            if (newStartDate > now) {
              seriesUpdateData.publication_status = 'SCHEDULED';
              seriesUpdateData.scheduled_publish_at = newStartDate;
            } else {
              seriesUpdateData.visibility = 'PUBLISHED';
              seriesUpdateData.publication_status = 'PUBLISHED';
              seriesUpdateData.scheduled_publish_at = null;
            }
          }

          await prisma.series.update({
            where: { id: seriesId },
            data: seriesUpdateData,
          });
        }

        // Update courses
        if (updateData.courses && updateData.courses.length > 0) {
          for (const courseUpdate of updateData.courses) {
            // Handle course file uploads
            const courseFileData = files?.courseFiles?.find(cf => cf.courseId === courseUpdate.id);

            let introVideoUrl: string | undefined;
            let endVideoUrl: string | undefined;

            if (courseFileData?.introVideo) {
              // Get existing course to delete old file
              const existingCourse = await prisma.course.findUnique({
                where: { id: courseUpdate.id },
                select: { intro_video_url: true },
              });

              if (existingCourse?.intro_video_url) {
                try {
                  await SojebStorage.delete(appConfig().storageUrl.module_file + existingCourse.intro_video_url);
                } catch (error) {
                  this.logger.warn(`Failed to delete old intro video: ${error.message}`);
                }
              }

              introVideoUrl = StringHelper.generateRandomFileName(courseFileData.introVideo.originalname);
              await SojebStorage.put(appConfig().storageUrl.module_file + introVideoUrl, courseFileData.introVideo.buffer);
            }

            if (courseFileData?.endVideo) {
              // Get existing course to delete old file
              const existingCourse = await prisma.course.findUnique({
                where: { id: courseUpdate.id },
                select: { end_video_url: true },
              });

              if (existingCourse?.end_video_url) {
                try {
                  await SojebStorage.delete(appConfig().storageUrl.module_file + existingCourse.end_video_url);
                } catch (error) {
                  this.logger.warn(`Failed to delete old end video: ${error.message}`);
                }
              }

              endVideoUrl = StringHelper.generateRandomFileName(courseFileData.endVideo.originalname);
              await SojebStorage.put(appConfig().storageUrl.module_file + endVideoUrl, courseFileData.endVideo.buffer);
            }

            // Update course
            await prisma.course.update({
              where: { id: courseUpdate.id },
              data: {
                ...courseUpdate,
                ...(introVideoUrl && { intro_video_url: introVideoUrl }),
                ...(endVideoUrl && { end_video_url: endVideoUrl }),
              },
            });
          }
        }

        // Update lessons
        if (updateData.lessons && updateData.lessons.length > 0) {
          for (const lessonUpdate of updateData.lessons) {
            // Handle lesson file uploads
            const lessonFileData = files?.lessonFiles?.find(lf => lf.lessonId === lessonUpdate.id);

            let videoFileName: string | undefined;
            let docFileName: string | undefined;
            let videoLength: string | null = null;
            let primaryKind: string | undefined;

            if (lessonFileData?.videoFile) {
              // Get existing lesson to delete old file
              const existingLesson = await prisma.lessonFile.findUnique({
                where: { id: lessonUpdate.id },
                select: { url: true, kind: true, position: true },
              });

              if (existingLesson?.url) {
                try {
                  await SojebStorage.delete(appConfig().storageUrl.lesson_file + existingLesson.url);
                } catch (error) {
                  this.logger.warn(`Failed to delete old video file: ${error.message}`);
                }
              }

              const videoTitle = lessonUpdate.title || lessonFileData.videoFile.originalname.split('.')[0];
              videoFileName = StringHelper.generateLessonFileName(existingLesson?.position || 0, videoTitle, lessonFileData.videoFile.originalname);
              await SojebStorage.put(appConfig().storageUrl.lesson_file + videoFileName, lessonFileData.videoFile.buffer);

              const fileKind = this.getFileKind(lessonFileData.videoFile.mimetype);
              primaryKind = fileKind;

              // Calculate video length if it's a video file
              if (fileKind === 'video' && this.videoDurationService.isVideoFile(lessonFileData.videoFile.mimetype)) {
                try {
                  videoLength = await this.videoDurationService.calculateVideoLength(lessonFileData.videoFile.buffer, lessonFileData.videoFile.originalname);
                } catch (error) {
                  this.logger.error(`Failed to calculate video length: ${error.message}`, error.stack);
                }
              }
            }

            if (lessonFileData?.docFile) {
              // Get existing lesson to delete old file
              const existingLesson = await prisma.lessonFile.findUnique({
                where: { id: lessonUpdate.id },
                select: { doc: true, kind: true, position: true },
              });

              if (existingLesson?.doc) {
                try {
                  await SojebStorage.delete(appConfig().storageUrl.doc_file + existingLesson.doc);
                } catch (error) {
                  this.logger.warn(`Failed to delete old document file: ${error.message}`);
                }
              }

              const docTitle = lessonUpdate.title || lessonFileData.docFile.originalname.split('.')[0];
              docFileName = StringHelper.generateLessonFileName(existingLesson?.position || 0, docTitle, lessonFileData.docFile.originalname);
              await SojebStorage.put(appConfig().storageUrl.doc_file + docFileName, lessonFileData.docFile.buffer);

              const docFileKind = this.getFileKind(lessonFileData.docFile.mimetype);
              if (!lessonFileData.videoFile) {
                primaryKind = docFileKind;
              }
            }

            // Update lesson
            await prisma.lessonFile.update({
              where: { id: lessonUpdate.id },
              data: {
                ...lessonUpdate,
                ...(videoFileName && { url: videoFileName }),
                ...(docFileName && { doc: docFileName }),
                ...(videoLength && { video_length: videoLength }),
                ...(primaryKind && { kind: primaryKind }),
              },
            });
          }
        }

        return { success: true };
      });

      // Handle queue scheduling after transaction is committed
      if (updateData.series?.start_date) {
        const newStartDate = new Date(updateData.series.start_date);
        const now = new Date();

        if (newStartDate > now) {
          try {
            await this.seriesPublishService.scheduleSeriesPublication(seriesId, newStartDate);
          } catch (error) {
            this.logger.error(`Failed to schedule queue job for series ${seriesId}: ${error.message}`, error.stack);
          }
        } else {
          try {
            await this.seriesPublishService.cancelScheduledPublication(seriesId);
          } catch (error) {
            this.logger.error(`Failed to cancel scheduled jobs for series ${seriesId}: ${error.message}`, error.stack);
          }
        }
      }

      // Update series totals after all updates
      await this.updateSeriesTotalsPrice(seriesId);
      await this.updateSeriesTotalsVideoLength(seriesId);

      // Fetch the complete updated series with relations
      const seriesWithRelations = await this.prisma.series.findUnique({
        where: { id: seriesId },
        include: {
          courses: {
            orderBy: { position: 'asc' },
            include: {
              lesson_files: {
                orderBy: { position: 'asc' },
              },
            },
          },
        }
      });

      // Add file URLs to series
      if (seriesWithRelations?.thumbnail) {
        seriesWithRelations['thumbnail_url'] = SojebStorage.url(appConfig().storageUrl.series_thumbnail + seriesWithRelations.thumbnail);
      }

      // Add file URLs to courses and lesson files
      if (seriesWithRelations?.courses && seriesWithRelations.courses.length > 0) {
        for (const course of seriesWithRelations.courses) {
          // Add course video URLs
          if (course.intro_video_url) {
            course['intro_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + course.intro_video_url);
          }
          if (course.end_video_url) {
            course['end_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + course.end_video_url);
          }

          // Add lesson file URLs
          if (course.lesson_files && course.lesson_files.length > 0) {
            for (const lessonFile of course.lesson_files) {
              if (lessonFile.url) {
                lessonFile['file_url'] = SojebStorage.url(appConfig().storageUrl.lesson_file + lessonFile.url);
              }
              if (lessonFile.doc) {
                lessonFile['doc_url'] = SojebStorage.url(appConfig().storageUrl.doc_file + lessonFile.doc);
              }
            }
          }
        }
      }

      return {
        success: true,
        message: 'Series, courses, and lessons updated successfully',
        data: seriesWithRelations,
      };
    } catch (error) {
      this.logger.error(`Error updating all entities for series ${seriesId}: ${error.message}`, error.stack);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to update series, courses, and lessons',
        error: error.message,
      };
    }
  }

  /**
   * Update series total price and video length based on all courses
   */
  private async updateSeriesTotalsPrice(seriesId: string): Promise<void> {
    try {
      // Get all courses for the series
      const courses = await this.prisma.course.findMany({
        where: { series_id: seriesId },
        select: {
          price: true,
        },
      });

      // Calculate total price
      const totalPrice = courses.reduce((acc, course) => {
        const coursePrice = course.price ? Number(course.price) : 0;
        return acc + coursePrice;
      }, 0);

      await this.prisma.series.update({
        where: { id: seriesId },
        data: {
          total_price: totalPrice,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to update series totals for ${seriesId}: ${error.message}`, error.stack);
    }
  }

  private async updateSeriesTotalsVideoLength(seriesId: string): Promise<void> {
    try {
      // Get all courses for the series
      const courses = await this.prisma.course.findMany({
        where: { series_id: seriesId },
        select: {
          video_length: true
        },
      });

      // Calculate total video length
      const courseLengths = courses.map(course => course.video_length).filter(length => length);
      const seriesVideoLength = courseLengths.length > 0
        ? this.videoDurationService.calculateTotalLength(courseLengths)
        : null;

      // Update series with calculated video length
      await this.prisma.series.update({
        where: { id: seriesId },
        data: {
          video_length: seriesVideoLength,
        },
      });

      this.logger.log(`Updated series video length for ${seriesId}: ${seriesVideoLength}`);
    } catch (error) {
      this.logger.error(`Failed to update series video length for ${seriesId}: ${error.message}`, error.stack);
    }
  }
}

