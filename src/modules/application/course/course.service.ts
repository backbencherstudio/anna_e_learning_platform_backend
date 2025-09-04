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

}

