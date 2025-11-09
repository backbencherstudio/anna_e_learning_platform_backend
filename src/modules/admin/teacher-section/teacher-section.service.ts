import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateTeacherSectionDto } from './dto/create-teacher-section.dto';
import { UpdateTeacherSectionDto } from './dto/update-teacher-section.dto';
import { SojebStorage } from '../../../common/lib/Disk/SojebStorage';
import appConfig from '../../../config/app.config';
import { StringHelper } from '../../../common/helper/string.helper';
import { TeacherSectionPublishService } from '../../queue/teacher-section-publish.service';

@Injectable()
export class TeacherSectionService {
  private readonly logger = new Logger(TeacherSectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly teacherSectionPublishService: TeacherSectionPublishService,
  ) { }

  async create(createDto: CreateTeacherSectionDto, file?: Express.Multer.File) {
    try {
      this.logger.log('Creating teacher section');

      let storedFileName: string | undefined;
      if (file) {
        storedFileName = StringHelper.generateRandomFileName(file.originalname);
        await SojebStorage.put(appConfig().storageUrl.teacher_section_file + storedFileName, file.buffer);
      }

      const now = new Date();
      const releaseAt = createDto.release_date ? new Date(createDto.release_date) : undefined;

      // decide release status
      let release_status: string = 'DRAFT';
      let scheduled_release_at: Date = null;
      let is_released = false;
      let status = createDto.status ?? 'published';

      if (releaseAt && releaseAt > now) {
        release_status = 'SCHEDULED';
        scheduled_release_at = releaseAt;
        is_released = false;
        status = 'scheduled';
      } else if (releaseAt && releaseAt <= now) {
        release_status = 'PUBLISHED';
        is_released = true;
        status = 'published';
      }

      const section = await this.prisma.teacherSection.create({
        data: {
          section_type: createDto.section_type,
          title: createDto.title,
          description: createDto.description,
          duration: createDto.duration,
          release_date: createDto.release_date ? new Date(createDto.release_date) : undefined,
          position: createDto.position ?? 0,
          category: createDto.category,
          status,
          is_released,
          release_status,
          scheduled_release_at,
          file_url: storedFileName,
        },
      });

      // schedule if needed
      if (release_status === 'SCHEDULED' && scheduled_release_at) {
        try {
          await this.teacherSectionPublishService.scheduleRelease(section.id, scheduled_release_at);
        } catch (e) {
          this.logger.warn(`Failed to schedule teacher section release: ${e.message}`);
        }
      }

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

  async findAll(page: number = 1, limit: number = 10, search?: string, section_type?: string) {
    try {
      const skip = (page - 1) * limit;
      const where: any = {};
      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' as any } },
          { description: { contains: search, mode: 'insensitive' as any } },
        ];
      }

      if (section_type) {
        where.section_type = section_type;
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

      const now = new Date();

      // compute updated release state
      let release_status = exists.release_status;
      let scheduled_release_at = exists.scheduled_release_at as any;
      let is_released = exists.is_released as any;
      let status = updateDto.status ?? exists.status;

      if (updateDto.release_date) {
        const newReleaseAt = new Date(updateDto.release_date);
        if (newReleaseAt > now) {
          release_status = 'SCHEDULED';
          scheduled_release_at = newReleaseAt as any;
          is_released = false;
          status = 'scheduled';
        } else {
          release_status = 'PUBLISHED';
          scheduled_release_at = null as any;
          is_released = true;
          status = 'published';
        }
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
          category: updateDto.category ?? exists.category,
          status,
          is_released,
          release_status,
          scheduled_release_at,
          file_url: storedFileName,
        },
      });

      // manage schedule
      try {
        if (release_status === 'SCHEDULED' && scheduled_release_at) {
          await this.teacherSectionPublishService.scheduleRelease(id, scheduled_release_at);
        } else {
          await this.teacherSectionPublishService.cancelScheduledRelease(id);
        }
      } catch (e) {
        this.logger.warn(`Failed to manage teacher section schedule: ${e.message}`);
      }

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
