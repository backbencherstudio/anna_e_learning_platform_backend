import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { SojebStorage } from 'src/common/lib/Disk/SojebStorage';
import appConfig from 'src/config/app.config';
import { UserRepository } from 'src/common/repository/user/user.repository';
import { Role } from 'src/common/guard/role/role.enum';

@Injectable()
export class NotificationService {
  constructor(private prisma: PrismaService) { }

  async findAll(user_id: string) {
    try {
      const where_condition = {};
      const userDetails = await UserRepository.getUserDetails(user_id);

      if (userDetails.type == Role.STUDENT) {
        where_condition['receiver_id'] = user_id;
      }

      const notifications = await this.prisma.notification.findMany({
        where: {
          ...where_condition,
        },
        select: {
          id: true,
          sender_id: true,
          receiver_id: true,
          entity_id: true,
          created_at: true,
          sender: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
            },
          },
          receiver: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
            },
          },
          notification_event: {
            select: {
              id: true,
              type: true,
              text: true,
            },
          },
        },
        orderBy: { created_at: 'desc' },
      });

      // add url to avatar
      if (notifications.length > 0) {
        for (const notification of notifications) {
          if (notification.sender && notification.sender.avatar) {
            notification.sender['avatar_url'] = SojebStorage.url(
              appConfig().storageUrl.avatar + notification.sender.avatar,
            );
          }

          if (notification.receiver && notification.receiver.avatar) {
            notification.receiver['avatar_url'] = SojebStorage.url(
              appConfig().storageUrl.avatar + notification.receiver.avatar,
            );
          }
        }
      }

      return {
        success: true,
        data: notifications,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async remove(id: string, user_id: string) {
    try {
      // check if notification exists and belongs to user
      const notification = await this.prisma.notification.findUnique({
        where: {
          id: id,
          receiver_id: user_id,
        },
      });

      if (!notification) {
        return {
          success: false,
          message: 'Notification not found',
        };
      }

      await this.prisma.notification.delete({
        where: {
          id: id,
        },
      });

      return {
        success: true,
        message: 'Notification deleted successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async removeAll(user_id: string) {
    try {
      // check if notifications exist for user
      const notifications = await this.prisma.notification.findMany({
        where: {
          receiver_id: user_id,
        },
      });

      if (notifications.length == 0) {
        return {
          success: false,
          message: 'No notifications found',
        };
      }

      await this.prisma.notification.deleteMany({
        where: {
          receiver_id: user_id,
        },
      });

      return {
        success: true,
        message: 'All notifications deleted successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async markAsRead(id: string, user_id: string) {
    try {
      // check if notification exists and belongs to user
      const notification = await this.prisma.notification.findUnique({
        where: {
          id: id,
          receiver_id: user_id,
        },
      });

      if (!notification) {
        return {
          success: false,
          message: 'Notification not found',
        };
      }

      await this.prisma.notification.update({
        where: {
          id: id,
        },
        data: {
          read_at: new Date(),
        },
      });

      return {
        success: true,
        message: 'Notification marked as read',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async markAllAsRead(user_id: string) {
    try {
      await this.prisma.notification.updateMany({
        where: {
          receiver_id: user_id,
          read_at: null,
        },
        data: {
          read_at: new Date(),
        },
      });

      return {
        success: true,
        message: 'All notifications marked as read',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }
}
