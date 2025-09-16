import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateTeacherSectionDto } from './dto/create-teacher-section.dto';
import { UpdateTeacherSectionDto } from './dto/update-teacher-section.dto';
import { SojebStorage } from '../../../common/lib/Disk/SojebStorage';
import appConfig from '../../../config/app.config';
import { StringHelper } from '../../../common/helper/string.helper';

@Injectable()
export class TeacherSectionService {
  private readonly logger = new Logger(TeacherSectionService.name);

  constructor(private readonly prisma: PrismaService) { }

  async create(createDto: CreateTeacherSectionDto, file?: Express.Multer.File) {
    try {
      this.logger.log('Creating teacher section');

      let storedFileName: string | undefined;
      if (file) {
        storedFileName = StringHelper.generateRandomFileName(file.originalname);
        await SojebStorage.put(appConfig().storageUrl.teacher_section_file + storedFileName, file.buffer);
      }

      const section = await this.prisma.teacherSection.create({
        data: {
          section_type: createDto.section_type,
          title: createDto.title,
          description: createDto.description,
          duration: createDto.duration,
          release_date: createDto.release_date ? new Date(createDto.release_date) : undefined,
          position: createDto.position ?? 0,
          status: createDto.status ?? 'published',
          file_url: storedFileName,
        },
      });

      return {
        success: true,
        message: 'Teacher section created successfully',
        data: {
          ...section,
          file_full_url: section.file_url
            ? SojebStorage.url(appConfig().storageUrl.teacher_section_file + section.file_url)
            : null,
        },
      };
    } catch (error) {
      this.logger.error(`Create teacher section failed: ${error.message}`, error.stack);
      return { success: false, message: 'Failed to create teacher section', error: error.message };
    }
  }

  async findAll(page: number = 1, limit: number = 10, search?: string) {
    try {
      const skip = (page - 1) * limit;
      const where: any = {};
      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' as any } },
          { description: { contains: search, mode: 'insensitive' as any } },
        ];
      }

      const [items, total] = await Promise.all([
        this.prisma.teacherSection.findMany({
          where,
          skip,
          take: limit,
          orderBy: [{ position: 'asc' }, { created_at: 'desc' }],
        }),
        this.prisma.teacherSection.count({ where }),
      ]);

      for (const it of items) {
        if (it.file_url) {
          (it as any).file_url = SojebStorage.url(appConfig().storageUrl.teacher_section_file + it.file_url);
        }
      }

      const totalPages = Math.ceil(total / limit);
      return {
        success: true,
        message: 'Teacher sections retrieved successfully',
        data: {
          sections: items,
          pagination: {
            total,
            page,
            limit,
            totalPages,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1,
          },
        },
      };
    } catch (error) {
      this.logger.error(`Fetch teacher sections failed: ${error.message}`, error.stack);
      return { success: false, message: 'Failed to fetch teacher sections', error: error.message };
    }
  }

  async findOne(id: string) {
    try {
      const section = await this.prisma.teacherSection.findUnique({ where: { id } });
      if (!section) throw new NotFoundException('Teacher section not found');

      return {
        success: true,
        message: 'Teacher section retrieved successfully',
        data: {
          ...section,
          file_url: section.file_url
            ? SojebStorage.url(appConfig().storageUrl.teacher_section_file + section.file_url)
            : null,
        },
      };
    } catch (error) {
      this.logger.error(`Fetch teacher section failed: ${error.message}`, error.stack);
      return { success: false, message: 'Failed to fetch teacher section', error: error.message };
    }
  }

  async update(id: string, updateDto: UpdateTeacherSectionDto, file?: Express.Multer.File) {
    try {
      const exists = await this.prisma.teacherSection.findUnique({ where: { id } });
      if (!exists) throw new NotFoundException('Teacher section not found');

      let storedFileName = exists.file_url;
      if (file) {
        storedFileName = StringHelper.generateRandomFileName(file.originalname);
        await SojebStorage.put(appConfig().storageUrl.teacher_section_file + storedFileName, file.buffer);
      }

      const section = await this.prisma.teacherSection.update({
        where: { id },
        data: {
          section_type: updateDto.section_type ?? exists.section_type,
          title: updateDto.title ?? exists.title,
          description: updateDto.description ?? exists.description,
          duration: updateDto.duration ?? exists.duration,
          release_date: updateDto.release_date ? new Date(updateDto.release_date) : exists.release_date,
          position: updateDto.position ?? exists.position,
          status: updateDto.status ?? exists.status,
          file_url: storedFileName,
        },
      });

      return {
        success: true,
        message: 'Teacher section updated successfully',
        data: {
          ...section,
          file_full_url: section.file_url
            ? SojebStorage.url(appConfig().storageUrl.teacher_section_file + section.file_url)
            : null,
        },
      };
    } catch (error) {
      this.logger.error(`Update teacher section failed: ${error.message}`, error.stack);
      return { success: false, message: 'Failed to update teacher section', error: error.message };
    }
  }

  async remove(id: string) {
    try {
      const exists = await this.prisma.teacherSection.findUnique({ where: { id } });
      if (!exists) throw new NotFoundException('Teacher section not found');
      await this.prisma.teacherSection.delete({ where: { id } });
      return { success: true, message: 'Teacher section deleted successfully', data: null };
    } catch (error) {
      this.logger.error(`Delete teacher section failed: ${error.message}`, error.stack);
      return { success: false, message: 'Failed to delete teacher section', error: error.message };
    }
  }
}
