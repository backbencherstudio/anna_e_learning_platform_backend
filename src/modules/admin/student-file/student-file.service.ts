import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateStudentFileDto } from './dto/create-student-file.dto';
import { UpdateStudentFileDto } from './dto/update-student-file.dto';
import { StudentFileResponse } from './interfaces/student-file-response.interface';
import { StudentFile } from '@prisma/client';
import { SojebStorage } from '../../../common/lib/Disk/SojebStorage';
import appConfig from '../../../config/app.config';
import { StringHelper } from '../../../common/helper/string.helper';

@Injectable()
export class StudentFileService {
  private readonly logger = new Logger(StudentFileService.name);

  constructor(private readonly prisma: PrismaService) { }


  async findAllStudent(
    page: number = 1,
    limit: number = 10,
    search?: string,
    series_id?: string,
    course_id?: string,
  ) {
    const skip = (page - 1) * limit;

    const where: any = {
      type: 'student',
      deleted_at: null,
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' as any } },
        { email: { contains: search, mode: 'insensitive' as any } },
        { username: { contains: search, mode: 'insensitive' as any } },
      ];
    }

    if (series_id || course_id) {
      where.enrollments = {
        some: {
          ...(series_id ? { series_id } : {}),
          ...(course_id ? { series: { courses: { some: { id: course_id } } } } : {}),
        },
      } as any;
    }

    const [students, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          name: true,
          first_name: true,
          last_name: true,
          email: true,
          username: true,
          avatar: true,
          created_at: true,
          student_files: {
            select: {
              id: true,
              url: true,
              section_type: true,
              week_number: true,
              series: { select: { id: true, title: true, } },
              course: { select: { id: true, title: true, } },
            },
          }
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    for (const student of students) {
      if (student.student_files) {
        student.student_files.forEach(file => {
          file['file_url'] = SojebStorage.url(appConfig().storageUrl.student_file + file.url);
        });
      }
    }
    // add avatar url to students
    students.forEach(student => {
      if (student.avatar) {
        student['avatar_url'] = SojebStorage.url(appConfig().storageUrl.avatar + student.avatar);
      }
    });


    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    return {
      success: true,
      message: 'Students fetched',
      data: {
        students,
        pagination: { total, page, limit, totalPages, hasNextPage, hasPreviousPage },
      },
    };
  }


  /**
   * Get all student files with pagination and filtering
   */
  async findAll(
    page: number = 1,
    limit: number = 10,
    search?: string,
    series_id?: string,
    course_id?: string,
    section_type?: string,
    week_number?: number,
  ): Promise<StudentFileResponse<{ student_files: any[]; pagination: any }>> {
    try {
      this.logger.log('Fetching all student files');

      const skip = (page - 1) * limit;
      const where: any = {
        deleted_at: null,
      };

      // Add search filter
      if (search) {
        where.OR = [
          { alt: { contains: search, mode: 'insensitive' as any } },
          { section_type: { contains: search, mode: 'insensitive' as any } },
        ];
      }

      // Add series filter
      if (series_id) {
        where.series_id = series_id;
      }

      // Add course filter
      if (course_id) {
        where.course_id = course_id;
      }

      // Add section type filter
      if (section_type) {
        where.section_type = section_type;
      }

      // Add week number filter
      if (week_number !== undefined) {
        where.week_number = week_number;
      }

      const [studentFiles, total] = await Promise.all([
        this.prisma.studentFile.findMany({
          where,
          skip,
          take: limit,
          include: {
            series: {
              select: {
                id: true,
                title: true,
              },
            },
            course: {
              select: {
                id: true,
                title: true,
              },
            },
            student: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
              },
            },
          },
          orderBy: [
            { week_number: 'asc' },
            { created_at: 'desc' },
          ],
        }),
        this.prisma.studentFile.count({ where }),
      ]);

      // Add file URLs to all student files
      for (const studentFile of studentFiles) {
        if (studentFile.url) {
          studentFile['file_url'] = SojebStorage.url(appConfig().storageUrl.student_file + studentFile.url);
        }
        if (studentFile.student.avatar) {
          studentFile.student['avatar_url'] = SojebStorage.url(appConfig().storageUrl.avatar + studentFile.student.avatar);
        }
      }
      // Calculate pagination values
      const totalPages = Math.ceil(total / limit);
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;

      return {
        success: true,
        message: 'Student files retrieved successfully',
        data: {
          student_files: studentFiles,
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
      this.logger.error(`Error fetching student files: ${error.message}`, error.stack);
      return {
        success: false,
        message: 'Failed to fetch student files',
        error: error.message,
      };
    }
  }


  /**
   * Get student files by student id with optional section_type filter and pagination
   */
  async getStudentFilesByStudentId(
    student_id: string,
    section_type?: string,
    page: number = 1,
    limit: number = 10,
  ) {
    try {
      this.logger.log(`Fetching student files for student: ${student_id}`);

      const skip = (page - 1) * limit;
      const where: any = { deleted_at: null, student_id };
      if (section_type) where.section_type = section_type;

      const [studentFiles, total] = await Promise.all([
        this.prisma.studentFile.findMany({
          where,
          skip,
          take: limit,
          include: {
            series: { select: { id: true, title: true } },
            course: { select: { id: true, title: true } },
            student: { select: { id: true, name: true, email: true, avatar: true } },
          },
          orderBy: [{ week_number: 'asc' }, { created_at: 'desc' }],
        }),
        this.prisma.studentFile.count({ where }),
      ]);

      for (const sf of studentFiles) {
        if (sf.url) {
          sf['file_url'] = SojebStorage.url(appConfig().storageUrl.student_file + sf.url);
        }
        if (sf.student?.avatar) {
          sf.student['avatar_url'] = SojebStorage.url(appConfig().storageUrl.avatar + sf.student.avatar);
        }
      }

      const totalPages = Math.ceil(total / limit);
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;

      return {
        success: true,
        message: 'Student files retrieved successfully',
        data: {
          student_files: studentFiles,
          pagination: { total, page, limit, totalPages, hasNextPage, hasPreviousPage },
        },
      };
    } catch (error) {
      this.logger.error(`Error fetching student files for student ${student_id}: ${error.message}`, error.stack);
      return {
        success: false,
        message: 'Failed to fetch student files',
        error: error.message,
      };
    }
  }
  /**
   * Get a single student file by ID
   */
  async findOne(id: string): Promise<StudentFileResponse<StudentFile>> {
    try {
      this.logger.log(`Fetching student file with ID: ${id}`);

      const studentFile = await this.prisma.studentFile.findFirst({
        where: {
          id,
          deleted_at: null,
        },
        include: {
          series: {
            select: {
              id: true,
              title: true,
            },
          },
          course: {
            select: {
              id: true,
              title: true,
            },
          },
          student: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
            },
          },
        },
      });

      if (!studentFile) {
        throw new NotFoundException('Student file not found');
      }

      // Add file URL to response
      if (studentFile.url) {
        studentFile['file_url'] = SojebStorage.url(appConfig().storageUrl.student_file + studentFile.url);
      }

      // Add avatar url to student
      if (studentFile.student.avatar) {
        studentFile.student['avatar_url'] = SojebStorage.url(appConfig().storageUrl.avatar + studentFile.student.avatar);
      }

      return {
        success: true,
        message: 'Student file retrieved successfully',
        data: studentFile,
      };
    } catch (error) {
      this.logger.error(`Error fetching student file: ${error.message}`, error.stack);
      return {
        success: false,
        message: 'Failed to fetch student file',
        error: error.message,
      };
    }
  }

  async update(id: string, updateStudentFileDto: UpdateStudentFileDto, file?: Express.Multer.File): Promise<StudentFileResponse<StudentFile>> {
    try {
      this.logger.log(`Updating student file with ID: ${id}`);

      // Check if student file exists
      const existingStudentFile = await this.prisma.studentFile.findFirst({
        where: {
          id,
          deleted_at: null,
        },
      });

      if (!existingStudentFile) {
        throw new NotFoundException('Student file not found');
      }

      // Validate series_id if provided
      if (updateStudentFileDto.series_id) {
        const series = await this.prisma.series.findUnique({ where: { id: updateStudentFileDto.series_id } });
        if (!series) {
          throw new BadRequestException('Series not found');
        }
      }

      // Validate course_id if provided
      if (updateStudentFileDto.course_id) {
        const course = await this.prisma.course.findUnique({ where: { id: updateStudentFileDto.course_id } });
        if (!course) {
          throw new BadRequestException('Course not found');
        }
      }

      // Handle file upload if provided
      let fileUrl = updateStudentFileDto.url;
      if (file) {
        const fileName = StringHelper.generateRandomFileName(file.originalname);
        await SojebStorage.put(appConfig().storageUrl.student_file + fileName, file.buffer);
        fileUrl = fileName;
        this.logger.log(`Uploaded updated student file: ${fileName}`);
      }

      const studentFile = await this.prisma.studentFile.update({
        where: { id },
        data: {
          ...updateStudentFileDto,
          url: fileUrl,
          updated_at: new Date(),
        },
        include: {
          series: {
            select: {
              id: true,
              title: true,
            },
          },
          course: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      });

      // Add file URL to response
      if (studentFile.url) {
        studentFile['file_url'] = SojebStorage.url(appConfig().storageUrl.student_file + studentFile.url);
      }

      return {
        success: true,
        message: 'Student file updated successfully',
        data: studentFile,
      };
    } catch (error) {
      this.logger.error(`Error updating student file: ${error.message}`, error.stack);
      return {
        success: false,
        message: 'Failed to update student file',
        error: error.message,
      };
    }
  }

  /**
   * Soft delete a student file
   */
  async remove(id: string): Promise<StudentFileResponse<null>> {
    try {
      this.logger.log(`Deleting student file with ID: ${id}`);

      // Check if student file exists
      const existingStudentFile = await this.prisma.studentFile.findFirst({
        where: {
          id,
          deleted_at: null,
        },
      });

      if (!existingStudentFile) {
        throw new NotFoundException('Student file not found');
      }

      await this.prisma.studentFile.update({
        where: { id },
        data: {
          deleted_at: new Date(),
        },
      });

      return {
        success: true,
        message: 'Student file deleted successfully',
        data: null,
      };
    } catch (error) {
      this.logger.error(`Error deleting student file: ${error.message}`, error.stack);
      return {
        success: false,
        message: 'Failed to delete student file',
        error: error.message,
      };
    }
  }
}