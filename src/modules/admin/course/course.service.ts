import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { CreateCourseSectionDto } from './dto/create-course-section.dto';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { CourseResponse } from './interfaces/course-response.interface';
import { StringHelper } from '../../../common/helper/string.helper';
import { Course, CourseSection, Lesson } from '@prisma/client';
import { SojebStorage } from '../../../common/lib/Disk/SojebStorage';
import appConfig from '../../../config/app.config';

@Injectable()
export class CourseService {
  private readonly logger = new Logger(CourseService.name);

  constructor(private readonly prisma: PrismaService) { }

  /**
   * Create a new course with optional sections and lessons
   */
  async create(
    createCourseDto: CreateCourseDto,
    thumbnail: Express.Multer.File,
    courseMedia: Express.Multer.File[],
    lessonMedia: Express.Multer.File[]
  ): Promise<CourseResponse<Course>> {

    console.log(createCourseDto, thumbnail, courseMedia, lessonMedia);
    try {
      this.logger.log('Creating new course');

      // Generate slug from title if not provided
      const slug = createCourseDto.slug || StringHelper.slugify(createCourseDto.title);

      // Check if slug already exists
      const existingCourse = await this.prisma.course.findUnique({
        where: { slug },
      });

      if (existingCourse) {
        throw new BadRequestException(`Course with slug '${slug}' already exists`);
      }

      // Handle thumbnail file upload

      if (thumbnail) {
        const thumbnailFileName = StringHelper.generateRandomFileName(thumbnail.originalname);
        await SojebStorage.put(appConfig().storageUrl.course_thumbnail + thumbnailFileName, thumbnail.buffer);
        createCourseDto.thumbnail = thumbnailFileName;
      }

      // Create course with sections and lessons in a transaction
      const result = await this.prisma.$transaction(async (prisma) => {
        // Create the course
        const course = await prisma.course.create({
          data: {
            title: createCourseDto.title,
            slug,
            summary: createCourseDto.summary,
            description: createCourseDto.description,
            visibility: createCourseDto.visibility || 'DRAFT',
            estimated_min: createCourseDto.estimated_min,
            start_date: createCourseDto.start_date ? new Date(createCourseDto.start_date) : undefined,
            end_date: createCourseDto.end_date ? new Date(createCourseDto.end_date) : undefined,
            thumbnail: createCourseDto.thumbnail,
            price: createCourseDto.price,
            language_id: createCourseDto.language_id,
          },
        });

        // // Handle course media files
        if (courseMedia && courseMedia.length > 0) {
          this.logger.log(`Processing ${courseMedia.length} course media files`);
          for (const mediaFile of courseMedia) {
            this.logger.log(`Processing media file: ${mediaFile.originalname}, size: ${mediaFile.size}, mimetype: ${mediaFile.mimetype}`);
            const mediaFileName = StringHelper.generateRandomFileName(mediaFile.originalname);
            await SojebStorage.put(appConfig().storageUrl.course_media + mediaFileName, mediaFile.buffer);

            const mediaAsset = await prisma.mediaAsset.create({
              data: {
                course_id: course.id,
                url: mediaFileName,
                kind: this.getFileKind(mediaFile.mimetype),
                alt: mediaFile.originalname,
                position: 0,
              },
            });
            this.logger.log(`Created media asset with ID: ${mediaAsset.id}, URL: ${mediaFileName}`);
          }
        } else {
          this.logger.log('No course media files to process');
        }

        // Create sections if provided
        if (createCourseDto.sections && createCourseDto.sections.length > 0) {
          for (const sectionDto of createCourseDto.sections) {
            const section = await prisma.courseSection.create({
              data: {
                course_id: course.id,
                title: sectionDto.title,
                position: sectionDto.position || 0,
              },
            });
          }
        }

        // Create lessons if provided
        if (createCourseDto.lessons && createCourseDto.lessons.length > 0) {
          for (const lessonDto of createCourseDto.lessons) {
            const lessonSlug = lessonDto.slug || StringHelper.slugify(lessonDto.title);

            // Check if lesson slug exists in this course
            const existingLesson = await prisma.lesson.findFirst({
              where: {
                course_id: course.id,
                slug: lessonSlug,
              },
            });

            if (existingLesson) {
              throw new BadRequestException(`Lesson with slug '${lessonSlug}' already exists in this course`);
            }

            const lesson = await prisma.lesson.create({
              data: {
                course_id: course.id,
                section_id: lessonDto.section_id,
                title: lessonDto.title,
                slug: lessonSlug,
                type: lessonDto.type || 'VIDEO',
                content: lessonDto.description ? { description: lessonDto.description } : undefined,
                duration_sec: lessonDto.duration_sec,
                position: lessonDto.position || 0,
                metadata: lessonDto.metadata,
              },
            });

            // Handle lesson media files
            if (lessonMedia && lessonMedia.length > 0) {
              this.logger.log(`Processing ${lessonMedia.length} lesson media files for lesson: ${lesson.title}`);
              for (const mediaFile of lessonMedia) {
                this.logger.log(`Processing lesson media file: ${mediaFile.originalname}, size: ${mediaFile.size}, mimetype: ${mediaFile.mimetype}`);
                const mediaFileName = StringHelper.generateRandomFileName(mediaFile.originalname);
                await SojebStorage.put(appConfig().storageUrl.lesson_media + mediaFileName, mediaFile.buffer);

                const lessonMediaAsset = await prisma.mediaAsset.create({
                  data: {
                    lesson_id: lesson.id,
                    url: mediaFileName,
                    kind: this.getFileKind(mediaFile.mimetype),
                    alt: mediaFile.originalname,
                    position: 0,
                  },
                });
                this.logger.log(`Created lesson media asset with ID: ${lessonMediaAsset.id}, URL: ${mediaFileName}`);
              }
            } else {
              this.logger.log(`No lesson media files to process for lesson: ${lesson.title}`);
            }
          }
        }

        return course;
      });

      // Fetch the complete course with relations
      const courseWithRelations = await this.prisma.course.findUnique({
        where: { id: result.id },
        include: {
          media: true,
          sections: true,
          lessons: true,
        }
      });

      this.logger.log(`Course created successfully with ID: ${result.id}`);

      return {
        success: true,
        message: 'Course created successfully',
        data: courseWithRelations,
      };
    } catch (error) {
      this.logger.error(`Error creating course: ${error.message}`, error.stack);

      if (error instanceof BadRequestException) {
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
   * Get all courses with pagination and filtering
   */
  async findAll(page: number = 1, limit: number = 10, search?: string): Promise<CourseResponse<{ courses: any[]; pagination: any }>> {
    try {
      this.logger.log('Fetching all courses');

      const skip = (page - 1) * limit;

      const where = search ? {
        OR: [
          { title: { contains: search, mode: 'insensitive' as any } },
          { summary: { contains: search, mode: 'insensitive' as any } },
          { description: { contains: search, mode: 'insensitive' as any } },
        ],
      } : {};

      const [courses, total] = await Promise.all([
        this.prisma.course.findMany({
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
            estimated_min: true,
            start_date: true,
            end_date: true,
            thumbnail: true,
            metadata: true,
            price: true,
            created_at: true,
            updated_at: true,
            language: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
            sections: {
              select: {
                id: true,
                title: true,
                position: true,
                created_at: true,
                updated_at: true,
              },
              orderBy: { position: 'asc' },
            },
            media: {
              select: {
                id: true,
                url: true,
                kind: true,
                alt: true,
                position: true,
                created_at: true,
              },
              orderBy: { position: 'asc' },
            },
            lessons: {
              select: {
                id: true,
                title: true,
                slug: true,
                type: true,
                duration_sec: true,
                position: true,
                created_at: true,
                updated_at: true,
                section: {
                  select: {
                    id: true,
                    title: true,
                    position: true,
                  },
                },
                media: {
                  select: {
                    id: true,
                    url: true,
                    kind: true,
                    alt: true,
                    position: true,
                  },
                  orderBy: { position: 'asc' },
                },
              },
              orderBy: { position: 'asc' },
            },
          },
          orderBy: { created_at: 'desc' },
        }),
        this.prisma.course.count({ where }),
      ]);

      // Calculate pagination values
      const totalPages = Math.ceil(total / limit);
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;

      // Add file URLs to all courses
      for (const course of courses) {
        if (course.thumbnail) {
          course['thumbnail_url'] = SojebStorage.url(appConfig().storageUrl.course_thumbnail + course.thumbnail);
        }
        if (course.media && course.media.length > 0) {
          for (const media of course.media) {
            if (media.url) {
              media['file_url'] = SojebStorage.url(appConfig().storageUrl.course_media + media.url);
            }
          }
        }
        if (course.lessons && course.lessons.length > 0) {
          for (const lesson of course.lessons) {
            if (lesson.media && lesson.media.length > 0) {
              for (const media of lesson.media) {
                if (media.url) {
                  media['file_url'] = SojebStorage.url(appConfig().storageUrl.lesson_media + media.url);
                }
              }
            }
          }
        }
      }

      return {
        success: true,
        message: 'Courses retrieved successfully',
        data: {
          courses,
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
      this.logger.error(`Error fetching courses: ${error.message}`, error.stack);

      return {
        success: false,
        message: 'Failed to fetch courses',
        error: error.message,
      };
    }
  }

  /**
   * Get a single course by ID
   */
  async findOne(id: string): Promise<CourseResponse<Course>> {
    try {
      this.logger.log(`Fetching course with ID: ${id}`);

      const course = await this.prisma.course.findUnique({
        where: { id },
        include: {
          language: true,
          media: {
            orderBy: { position: 'asc' },
          },
          sections: {
            orderBy: { position: 'asc' },
            select: {
              id: true,
              title: true,
              position: true,
              created_at: true,
              updated_at: true,
              lessons: {
                orderBy: { position: 'asc' },
                select: {
                  id: true,
                  title: true,
                  slug: true,
                  type: true,
                  duration_sec: true,
                  position: true,
                  created_at: true,
                  updated_at: true,
                  media: {
                    select: {
                      id: true,
                      url: true,
                      kind: true,
                      alt: true,
                      position: true,
                    },
                    orderBy: { position: 'asc' },
                  },
                },
              },
            },
          },
          lessons: {
            orderBy: { position: 'asc' },
            select: {
              id: true,
              title: true,
              slug: true,
              type: true,
              duration_sec: true,
              position: true,
              created_at: true,
              updated_at: true,
              media: {
                select: {
                  id: true,
                  url: true,
                  kind: true,
                  alt: true,
                  position: true,
                },
                orderBy: { position: 'asc' },
              },
            },
          },
          quizzes: true,
          assignments: true,
          _count: {
            select: {
              enrollments: true,
              lessons: true,
              sections: true,
            },
          },
        },
      });

      if (!course) {
        throw new NotFoundException(`Course with ID ${id} not found`);
      }

      // Add file URLs to the course
      if (course.thumbnail) {
        course['thumbnail_url'] = SojebStorage.url(appConfig().storageUrl.course_thumbnail + course.thumbnail);
      }
      if (course.media && course.media.length > 0) {
        for (const media of course.media) {
          if (media.url) {
            media['file_url'] = SojebStorage.url(appConfig().storageUrl.course_media + media.url);
          }
        }
      }
      if (course.lessons && course.lessons.length > 0) {
        for (const lesson of course.lessons) {
          if (lesson.media && lesson.media.length > 0) {
            for (const media of lesson.media) {
              if (media.url) {
                media['file_url'] = SojebStorage.url(appConfig().storageUrl.lesson_media + media.url);
              }
            }
          }
        }
      }

      return {
        success: true,
        message: 'Course retrieved successfully',
        data: course,
      };
    } catch (error) {
      this.logger.error(`Error fetching course ${id}: ${error.message}`, error.stack);

      if (error instanceof NotFoundException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to fetch course',
        error: error.message,
      };
    }
  }

  /**
   * Update a course by ID
   */
  async update(id: string, updateCourseDto: UpdateCourseDto, thumbnail: Express.Multer.File, courseMedia: Express.Multer.File[], lessonMedia: Express.Multer.File[]): Promise<CourseResponse<any>> {
    try {
      this.logger.log(`Updating course with ID: ${id}`);

      // Check if course exists
      const existingCourse = await this.prisma.course.findUnique({
        where: { id },
        select: { id: true, slug: true, thumbnail: true },
      });

      if (!existingCourse) {
        throw new NotFoundException(`Course with ID ${id} not found`);
      }

      // Handle thumbnail file upload if provided
      let thumbnailFileName: string | undefined;
      if (thumbnail) {
        // Delete old thumbnail if exists
        if (existingCourse.thumbnail) {
          try {
            await SojebStorage.delete(appConfig().storageUrl.course_thumbnail + existingCourse.thumbnail);
          } catch (error) {
            this.logger.warn(`Failed to delete old thumbnail: ${error.message}`);
          }
        }

        // Upload new thumbnail
        thumbnailFileName = StringHelper.generateRandomFileName(thumbnail.originalname);
        await SojebStorage.put(appConfig().storageUrl.course_thumbnail + thumbnailFileName, thumbnail.buffer);
      }

      // Generate slug from title if title is being updated
      let slug = updateCourseDto.slug;
      if (updateCourseDto.title && !updateCourseDto.slug) {
        slug = StringHelper.slugify(updateCourseDto.title);

        // Check if new slug already exists (excluding current course)
        const slugExists = await this.prisma.course.findFirst({
          where: {
            slug,
            id: { not: id },
          },
        });

        if (slugExists) {
          throw new BadRequestException(`Course with slug '${slug}' already exists`);
        }
      }

      // Update course and handle media files in a transaction
      const updatedCourse = await this.prisma.$transaction(async (prisma) => {
        // Prepare update data
        const updateData: any = { ...updateCourseDto };
        if (slug) updateData.slug = slug;
        if (thumbnailFileName) updateData.thumbnail = thumbnailFileName;
        if (updateCourseDto.start_date) updateData.start_date = new Date(updateCourseDto.start_date);
        if (updateCourseDto.end_date) updateData.end_date = new Date(updateCourseDto.end_date);

        // Remove media from updateData as we'll handle it separately
        delete updateData.media;
        delete updateData.thumbnail; // Remove the file object, keep only filename

        const course = await prisma.course.update({
          where: { id },
          data: updateData,
        });

        // Handle course media files - delete old ones and create new ones
        if (courseMedia && courseMedia.length > 0) {
          // Delete existing course media files
          const existingMedia = await prisma.mediaAsset.findMany({
            where: { course_id: id, lesson_id: null },
          });

          for (const media of existingMedia) {
            try {
              await SojebStorage.delete(appConfig().storageUrl.course_media + media.url);
            } catch (error) {
              this.logger.warn(`Failed to delete old media file: ${error.message}`);
            }
          }

          // Delete old media records
          await prisma.mediaAsset.deleteMany({
            where: { course_id: id, lesson_id: null },
          });

          // Create new media files
          for (const mediaFile of courseMedia) {
            const mediaFileName = StringHelper.generateRandomFileName(mediaFile.originalname);
            await SojebStorage.put(appConfig().storageUrl.course_media + mediaFileName, mediaFile.buffer);

            await prisma.mediaAsset.create({
              data: {
                course_id: course.id,
                url: mediaFileName,
                kind: this.getFileKind(mediaFile.mimetype),
                alt: mediaFile.originalname,
                position: 0,
              },
            });
          }
        }

        return course;
      });

      // Fetch the complete updated course with relations
      const courseWithRelations = await this.prisma.course.findUnique({
        where: { id },
      });

      this.logger.log(`Course updated successfully with ID: ${id}`);

      return {
        success: true,
        message: 'Course updated successfully',
        data: courseWithRelations,
      };
    } catch (error) {
      this.logger.error(`Error updating course ${id}: ${error.message}`, error.stack);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
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
   * Delete a course by ID (soft delete)
   */
  async remove(id: string): Promise<CourseResponse<{ id: string }>> {
    try {
      this.logger.log(`Deleting course with ID: ${id}`);

      // Check if course exists and get file information
      const existingCourse = await this.prisma.course.findUnique({
        where: { id },
        select: {
          id: true,
          thumbnail: true,
          media: {
            select: {
              id: true,
              url: true,
            },
          },
          lessons: {
            select: {
              id: true,
              media: {
                select: {
                  id: true,
                  url: true,
                },
              },
            },
          },
        },
      });

      if (!existingCourse) {
        throw new NotFoundException(`Course with ID ${id} not found`);
      }

      // Delete all associated files before soft deleting the course
      try {
        // Delete thumbnail
        if (existingCourse.thumbnail) {
          await SojebStorage.delete(appConfig().storageUrl.course_thumbnail + existingCourse.thumbnail);
        }

        // Delete course media files
        if (existingCourse.media && existingCourse.media.length > 0) {
          for (const media of existingCourse.media) {
            try {
              await SojebStorage.delete(appConfig().storageUrl.course_media + media.url);
            } catch (error) {
              this.logger.warn(`Failed to delete course media file: ${error.message}`);
            }
          }
        }

        // Delete lesson media files
        if (existingCourse.lessons && existingCourse.lessons.length > 0) {
          for (const lesson of existingCourse.lessons) {
            if (lesson.media && lesson.media.length > 0) {
              for (const media of lesson.media) {
                try {
                  await SojebStorage.delete(appConfig().storageUrl.lesson_media + media.url);
                } catch (error) {
                  this.logger.warn(`Failed to delete lesson media file: ${error.message}`);
                }
              }
            }
          }
        }
      } catch (error) {
        this.logger.warn(`Failed to delete some files: ${error.message}`);
      }

      // Soft delete the course (Prisma middleware will handle this)
      await this.prisma.course.delete({
        where: { id },
      });

      this.logger.log(`Course deleted successfully with ID: ${id}`);

      return {
        success: true,
        message: 'Course deleted successfully',
        data: { id },
      };
    } catch (error) {
      this.logger.error(`Error deleting course ${id}: ${error.message}`, error.stack);

      if (error instanceof NotFoundException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to delete course',
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
}
