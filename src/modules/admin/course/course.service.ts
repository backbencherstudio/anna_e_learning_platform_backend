import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { CourseResponse } from './interfaces/course-response.interface';
import { StringHelper } from '../../../common/helper/string.helper';
import { Course } from '@prisma/client';
import { SojebStorage } from '../../../common/lib/Disk/SojebStorage';
import appConfig from '../../../config/app.config';

@Injectable()
export class CourseService {
  private readonly logger = new Logger(CourseService.name);

  constructor(private readonly prisma: PrismaService) { }

  /**
   * Create a new course with optional modules and lesson files
   */
  async create(
    createCourseDto: CreateCourseDto,
    thumbnail?: Express.Multer.File,
    moduleFiles?: {
      moduleIndex: number;
      introVideo?: Express.Multer.File;
      endVideo?: Express.Multer.File;
      lessonFiles?: Express.Multer.File[];
    }[]
  ): Promise<CourseResponse<Course>> {

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
      let thumbnailFileName: string | undefined;
      if (thumbnail) {
        thumbnailFileName = StringHelper.generateRandomFileName(thumbnail.originalname);
        await SojebStorage.put(appConfig().storageUrl.course_thumbnail + thumbnailFileName, thumbnail.buffer);
        this.logger.log(`Uploaded thumbnail: ${thumbnailFileName}`);
      }

      // Create course with modules and lesson files in a transaction
      const result = await this.prisma.$transaction(async (prisma) => {
        // Create the course
        const course = await prisma.course.create({
          data: {
            title: createCourseDto.title,
            slug,
            summary: createCourseDto.summary,
            description: createCourseDto.description,
            visibility: createCourseDto.visibility || 'DRAFT',
            duration: createCourseDto.duration,
            start_date: createCourseDto.start_date ? new Date(createCourseDto.start_date) : undefined,
            end_date: createCourseDto.end_date ? new Date(createCourseDto.end_date) : undefined,
            thumbnail: thumbnailFileName,
            price: createCourseDto.price,
            code_type: createCourseDto.code_type,
            course_type: createCourseDto.course_type,
            note: createCourseDto.note,
            series_id: createCourseDto.series_id,
            language_id: createCourseDto.language_id,
          },
        });

        // Create modules if provided
        if (createCourseDto.modules && createCourseDto.modules.length > 0) {
          for (let i = 0; i < createCourseDto.modules.length; i++) {
            const moduleDto = createCourseDto.modules[i];

            // Find module files for this specific module
            const moduleFileData = moduleFiles?.find(mf => mf.moduleIndex === i);

            // Handle intro video file upload for this module
            let introVideoUrl: string | undefined;
            if (moduleFileData?.introVideo) {
              introVideoUrl = StringHelper.generateRandomFileName(moduleFileData.introVideo.originalname);
              await SojebStorage.put(appConfig().storageUrl.module_file + introVideoUrl, moduleFileData.introVideo.buffer);
              this.logger.log(`Uploaded intro video for module ${i}: ${introVideoUrl}`);
            }

            // Handle end video file upload for this module
            let endVideoUrl: string | undefined;
            if (moduleFileData?.endVideo) {
              endVideoUrl = StringHelper.generateRandomFileName(moduleFileData.endVideo.originalname);
              await SojebStorage.put(appConfig().storageUrl.module_file + endVideoUrl, moduleFileData.endVideo.buffer);
              this.logger.log(`Uploaded end video for module ${i}: ${endVideoUrl}`);
            }

            const module = await prisma.module.create({
              data: {
                course_id: course.id,
                title: moduleDto.title,
                position: moduleDto.position || i,
                intro_video_url: introVideoUrl,
                end_video_url: endVideoUrl,
              },
            });

            // Handle lesson files for this specific module
            if (moduleFileData?.lessonFiles && moduleFileData.lessonFiles.length > 0) {
              this.logger.log(`Processing ${moduleFileData.lessonFiles.length} lesson files for module ${i}`);
              for (let j = 0; j < moduleFileData.lessonFiles.length; j++) {
                const lessonFile = moduleFileData.lessonFiles[j];
                const fileName = StringHelper.generateRandomFileName(lessonFile.originalname);
                await SojebStorage.put(appConfig().storageUrl.lesson_file + fileName, lessonFile.buffer);

                await prisma.lessonFile.create({
                  data: {
                    module_id: module.id,
                    url: fileName,
                    kind: this.getFileKind(lessonFile.mimetype),
                    alt: lessonFile.originalname,
                    position: j,
                  },
                });
              }
              this.logger.log(`Created ${moduleFileData.lessonFiles.length} lesson files for module ${i}`);
            }
          }
          this.logger.log(`Created ${createCourseDto.modules.length} modules for course`);
        }

        return course;
      });

      // Fetch the complete course with relations
      const courseWithRelations = await this.prisma.course.findUnique({
        where: { id: result.id },
        include: {
          modules: {
            orderBy: { position: 'asc' },
          },
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
            duration: true,
            start_date: true,
            end_date: true,
            thumbnail: true,
            price: true,
            code_type: true,
            course_type: true,
            note: true,
            created_at: true,
            updated_at: true,
            series: {
              select: {
                id: true,
                title: true,
              },
            },
            language: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
            modules: {
              select: {
                id: true,
                title: true,
                position: true,
                created_at: true,
                updated_at: true,
                intro_video_url: true,
                end_video_url: true,
                lesson_files: {
                  select: {
                    id: true,
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
                modules: true,
                quizzes: true,
                assignments: true,
              },
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
        if (course.modules && course.modules.length > 0) {
          for (const module of course.modules) {
            if (module.lesson_files && module.lesson_files.length > 0) {
              for (const lessonFile of module.lesson_files) {
                if (lessonFile.url) {
                  lessonFile['file_url'] = SojebStorage.url(appConfig().storageUrl.lesson_file + lessonFile.url);
                }
              }
            }
            if (module.intro_video_url) {
              module['intro_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + module.intro_video_url);
            }
            if (module.end_video_url) {
              module['end_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + module.end_video_url);
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
          series: {
            select: {
              id: true,
              title: true,
              description: true,
            },
          },
          modules: {
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
              modules: true,
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
      if (course.modules && course.modules.length > 0) {
        for (const module of course.modules) {
          if (module.lesson_files && module.lesson_files.length > 0) {
            for (const lessonFile of module.lesson_files) {
              if (lessonFile.url) {
                lessonFile['file_url'] = SojebStorage.url(appConfig().storageUrl.lesson_file + lessonFile.url);
              }
            }
          }
          if (module.intro_video_url) {
            module['intro_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + module.intro_video_url);
          }
          if (module.end_video_url) {
            module['end_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + module.end_video_url);
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
  async update(id: string, updateCourseDto: UpdateCourseDto, thumbnail?: Express.Multer.File): Promise<CourseResponse<any>> {
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

      // Update course in a transaction
      const updatedCourse = await this.prisma.$transaction(async (prisma) => {
        // Prepare update data
        const updateData: any = { ...updateCourseDto };
        if (slug) updateData.slug = slug;
        if (thumbnailFileName) updateData.thumbnail = thumbnailFileName;
        if (updateCourseDto.start_date) updateData.start_date = new Date(updateCourseDto.start_date);
        if (updateCourseDto.end_date) updateData.end_date = new Date(updateCourseDto.end_date);

        const course = await prisma.course.update({
          where: { id },
          data: updateData,
        });

        return course;
      });

      // Fetch the complete updated course with relations
      const courseWithRelations = await this.prisma.course.findUnique({
        where: { id },
        include: {
          modules: {
            orderBy: { position: 'asc' },
          },
          series: {
            select: {
              id: true,
              title: true,
              description: true,
            },
          },
        }
      });

      // Add thumbnail URL
      if (courseWithRelations?.thumbnail) {
        courseWithRelations.thumbnail = appConfig().storageUrl.course_thumbnail + courseWithRelations.thumbnail;
      }

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
          modules: {
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

      if (!existingCourse) {
        throw new NotFoundException(`Course with ID ${id} not found`);
      }

      // Delete all associated files before soft deleting the course
      try {
        // Delete thumbnail
        if (existingCourse.thumbnail) {
          await SojebStorage.delete(appConfig().storageUrl.course_thumbnail + existingCourse.thumbnail);
        }

        // Delete module video files
        if (existingCourse.modules && existingCourse.modules.length > 0) {
          for (const module of existingCourse.modules) {
            if (module.intro_video_url) {
              try {
                await SojebStorage.delete(appConfig().storageUrl.module_file + module.intro_video_url);
              } catch (error) {
                this.logger.warn(`Failed to delete module intro video: ${error.message}`);
              }
            }
            if (module.end_video_url) {
              try {
                await SojebStorage.delete(appConfig().storageUrl.module_file + module.end_video_url);
              } catch (error) {
                this.logger.warn(`Failed to delete module end video: ${error.message}`);
              }
            }
            // Delete lesson files
            if (module.lesson_files && module.lesson_files.length > 0) {
              for (const lessonFile of module.lesson_files) {
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

