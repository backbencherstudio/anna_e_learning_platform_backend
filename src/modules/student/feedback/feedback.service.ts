import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { UpdateFeedbackDto } from './dto/update-feedback.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import { SojebStorage } from '../../../common/lib/Disk/SojebStorage';
import appConfig from '../../../config/app.config';
import { StringHelper } from '../../../common/helper/string.helper';

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(private readonly prisma: PrismaService) { }

  async create(userId: string, dto: CreateFeedbackDto, file?: Express.Multer.File) {
    try {
      // optional file upload
      let storedFileName: string | null = null;
      if (file) {
        const fileName = StringHelper.generateRandomFileName(file.originalname);
        await SojebStorage.put(appConfig().storageUrl.feedback_file + fileName, file.buffer);
        storedFileName = fileName;
      }

      const feedback = await this.prisma.feedback.create({
        data: {
          user_id: userId,
          course_id: dto.course_id,
          week_number: dto.week_number || null,
          type: dto.type || undefined,
          title: dto.title || null,
          description: dto.description || null,
          status: dto.status || undefined,
          file_url: storedFileName || dto.file_url || null,
        },
      });
      // attach absolute url
      if (feedback.file_url) {
        (feedback as any).file_download_url = SojebStorage.url(appConfig().storageUrl.feedback_file + feedback.file_url);
      }
      return { success: true, message: 'Feedback created', data: feedback };
    } catch (error) {
      this.logger.error(`Error creating feedback: ${error.message}`, error.stack);
      return { success: false, message: 'Failed to create feedback', error: error.message };
    }
  }

  async findAll(
    userId: string,
    page: number = 1,
    limit: number = 10,
    search?: string,
    course_id?: string,
    week_number?: string,
    type?: string,
    status?: string,
  ) {
    try {
      const skip = (page - 1) * limit;
      const where: any = { status: 'approved', deleted_at: null };
      if (course_id) where.course_id = course_id;
      if (week_number) where.week_number = week_number;
      if (type) where.type = type;
      if (status) where.status = status;
      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' as any } },
          { description: { contains: search, mode: 'insensitive' as any } },
        ];
      }

      const [items, total] = await Promise.all([
        this.prisma.feedback.findMany({
          where,
          skip,
          take: limit,
          select: {
            id: true,
            week_number: true,
            type: true,
            title: true,
            description: true,
            status: true,
            file_url: true,
            created_at: true,
            updated_at: true,
            course: { select: { id: true, title: true } },
            user: { select: { id: true, name: true, avatar: true } },
          },
          orderBy: { created_at: 'desc' },
        }),
        this.prisma.feedback.count({ where }),
      ]);

      // attach absolute file urls
      for (const item of items) {
        if (item.file_url) {
          (item as any).file_download_url = SojebStorage.url(appConfig().storageUrl.feedback_file + item.file_url);
        }
      }

      for (const item of items) {
        if (item.user.avatar) {
          (item as any).user['avatar_url'] = SojebStorage.url(appConfig().storageUrl.avatar + item.user.avatar);
        }
      }

      const totalPages = Math.ceil(total / limit);
      return {
        success: true,
        message: 'Feedback list',
        data: {
          feedbacks: items,
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
      this.logger.error(`Error listing feedback: ${error.message}`, error.stack);
      return { success: false, message: 'Failed to list feedback', error: error.message };
    }
  }

  async findOne(userId: string, id: string) {
    try {
      const feedback = await this.prisma.feedback.findFirst({
        where: { id, user_id: userId, deleted_at: null },
        select: {
          id: true,
          week_number: true,
          type: true,
          title: true,
          description: true,
          status: true,
          file_url: true,
          created_at: true,
          updated_at: true,
          course: { select: { id: true, title: true } },
        },
      });
      if (!feedback) throw new NotFoundException('Feedback not found');
      if (feedback.file_url) {
        (feedback as any).file_download_url = SojebStorage.url(appConfig().storageUrl.feedback_file + feedback.file_url);
      }
      return { success: true, message: 'Feedback details', data: feedback };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Error retrieving feedback ${id}: ${error.message}`, error.stack);
      return { success: false, message: 'Failed to get feedback', error: error.message };
    }
  }

  async update(userId: string, id: string, dto: UpdateFeedbackDto, file?: Express.Multer.File) {
    try {
      const exists = await this.prisma.feedback.findFirst({ where: { id, user_id: userId, deleted_at: null }, select: { id: true, file_url: true } });
      if (!exists) throw new NotFoundException('Feedback not found');

      // handle new file (replace old)
      let newFileName: string | undefined;
      if (file) {
        const fileName = StringHelper.generateRandomFileName(file.originalname);
        await SojebStorage.put(appConfig().storageUrl.feedback_file + fileName, file.buffer);
        newFileName = fileName;
        // delete old file if exists
        if (exists.file_url) {
          await SojebStorage.delete(appConfig().storageUrl.feedback_file + exists.file_url);
        }
      }

      const updated = await this.prisma.feedback.update({
        where: { id },
        data: {
          week_number: dto.week_number ?? undefined,
          type: dto.type ?? undefined,
          title: dto.title ?? undefined,
          description: dto.description ?? undefined,
          status: dto.status ?? undefined,
          file_url: newFileName ?? dto.file_url ?? undefined,
        },
        select: { id: true },
      });
      return { success: true, message: 'Feedback updated', data: updated };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Error updating feedback ${id}: ${error.message}`, error.stack);
      return { success: false, message: 'Failed to update feedback', error: error.message };
    }
  }

  async remove(userId: string, id: string) {
    try {
      const exists = await this.prisma.feedback.findFirst({ where: { id, user_id: userId, deleted_at: null }, select: { id: true, file_url: true } });
      if (!exists) throw new NotFoundException('Feedback not found');
      await this.prisma.feedback.delete({ where: { id } });
      // delete stored file if any
      if (exists.file_url) {
        await SojebStorage.delete(appConfig().storageUrl.feedback_file + exists.file_url);
      }
      return { success: true, message: 'Feedback deleted', data: { id } };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Error deleting feedback ${id}: ${error.message}`, error.stack);
      return { success: false, message: 'Failed to delete feedback', error: error.message };
    }
  }
}
