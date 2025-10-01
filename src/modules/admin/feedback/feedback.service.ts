import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
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

  async findAll(
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
      const where: any = { deleted_at: null };
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
            user: { select: { id: true, name: true, email: true, avatar: true } },
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

  async findOne(id: string) {
    try {
      const feedback = await this.prisma.feedback.findFirst({
        where: { id, deleted_at: null },
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
          user: { select: { id: true, name: true, email: true, avatar: true } },
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

  async update(id: string, dto: UpdateFeedbackDto, file?: Express.Multer.File) {
    try {
      const exists = await this.prisma.feedback.findFirst({ where: { id, deleted_at: null }, select: { id: true, file_url: true } });
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

  // async remove(userId: string, id: string) {
  //   try {
  //     const exists = await this.prisma.feedback.findFirst({ where: { id, user_id: userId, deleted_at: null }, select: { id: true, file_url: true } });
  //     if (!exists) throw new NotFoundException('Feedback not found');
  //     await this.prisma.feedback.delete({ where: { id } });
  //     // delete stored file if any
  //     if (exists.file_url) {
  //       await SojebStorage.delete(appConfig().storageUrl.feedback_file + exists.file_url);
  //     }
  //     return { success: true, message: 'Feedback deleted', data: { id } };
  //   } catch (error) {
  //     if (error instanceof NotFoundException) throw error;
  //     this.logger.error(`Error deleting feedback ${id}: ${error.message}`, error.stack);
  //     return { success: false, message: 'Failed to delete feedback', error: error.message };
  //   }
  // }


  async remove(userId: string, id: string) {
    try {
      // find the feedback
      const feedback = await this.prisma.feedback.findFirst({
        where: { id, deleted_at: null },
        select: { id: true, file_url: true, user_id: true },
      });

      if (!feedback) throw new NotFoundException('Feedback not found');

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { type: true },
      });

      if (!user) throw new NotFoundException('User not found');

      if (feedback.user_id !== userId && user.type !== 'admin') {
        throw new ForbiddenException('You do not have permission to delete this feedback');
      }

      await this.prisma.feedback.delete({ where: { id } });
      
      if (feedback.file_url) {
        await SojebStorage.delete(appConfig().storageUrl.feedback_file + feedback.file_url);
      }

      return { success: true, message: 'Feedback deleted', data: { id } };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) throw error;

      this.logger.error(`Error deleting feedback ${id}: ${error.message}`, error.stack);
      return { success: false, message: 'Failed to delete feedback', error: error.message };
    }
  }


  async approve(id: string) {
    try {
      const exists = await this.prisma.feedback.findUnique({ where: { id }, select: { id: true } });
      if (!exists) throw new NotFoundException('Feedback not found');

      const updated = await this.prisma.feedback.update({
        where: { id },
        data: { status: 'approved' },
        select: { id: true, status: true },
      });

      return { success: true, message: 'Feedback approved', data: updated };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Error approving feedback ${id}: ${error.message}`, error.stack);
      return { success: false, message: 'Failed to approve feedback', error: error.message };
    }
  }

  async reject(id: string) {
    try {
      const exists = await this.prisma.feedback.findUnique({ where: { id }, select: { id: true } });
      if (!exists) throw new NotFoundException('Feedback not found');

      const updated = await this.prisma.feedback.update({
        where: { id },
        data: { status: 'reject' },
        select: { id: true, status: true },
      });

      return { success: true, message: 'Feedback rejected', data: updated };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Error rejecting feedback ${id}: ${error.message}`, error.stack);
      return { success: false, message: 'Failed to reject feedback', error: error.message };
    }
  }
}
