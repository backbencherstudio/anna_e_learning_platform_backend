import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import { SojebStorage } from '../../../common/lib/Disk/SojebStorage';
import appConfig from '../../../config/app.config';
import { MessageGateway } from '../../chat/message/message.gateway';
import { NotificationRepository } from '../../../common/repository/notification/notification.repository';
import { MailService } from '../../../mail/mail.service';

@Injectable()
export class StudentService {
  private readonly logger = new Logger(StudentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messageGateway: MessageGateway,
    private readonly mailService: MailService,
  ) { }

  async findAll(
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
          enrollments: {
            select: {
              progress_percentage: true,
              status: true,
              series: { select: { id: true, title: true, courses: { select: { id: true, title: true } } } },
            }
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    await Promise.all(students.map(async (s) => {
      if (s.avatar) {
        (s as any).avatar_url = SojebStorage.url(appConfig().storageUrl.avatar + s.avatar);
      }
      const enrollments = s.enrollments as any[];
      const enrollmentsCount = enrollments.length;
      const avgCompletion = enrollmentsCount > 0
        ? Math.round((enrollments.reduce((acc, e) => acc + (e.progress_percentage ?? 0), 0) / enrollmentsCount) * 100) / 100
        : 0;
      const enrollmentStatuses = enrollments.map(e => e.status);

      // Build unique series and courses lists from enrollments
      const seriesMap = new Map<string, { id: string; title: string; courses: { id: string; title: string }[] }>();
      //  const courseMap = new Map<string, { id: string; title: string }>();
      for (const e of enrollments) {
        const series = e.series as any;
        if (!series) continue;

        const mappedCourses = ((series.courses || []) as any[]).map((c) => ({ id: c.id, title: c.title }));

        if (!seriesMap.has(series.id)) {
          seriesMap.set(series.id, { id: series.id, title: series.title, courses: mappedCourses });
        } else {
          const existing = seriesMap.get(series.id)!;
          const merged = new Map(existing.courses.map((c) => [c.id, c] as const));
          for (const c of mappedCourses) merged.set(c.id, c);
          existing.courses = Array.from(merged.values());
          seriesMap.set(series.id, existing);
        }

        // for (const c of mappedCourses) {
        //   if (!courseMap.has(c.id)) courseMap.set(c.id, c);
        // }
      }

      const [assignmentSubmissionsCount, quizSubmissionsCount] = await Promise.all([
        this.prisma.assignmentSubmission.count({ where: { student_id: s.id } }),
        this.prisma.quizSubmission.count({ where: { student_id: s.id } }),
      ]);

      (s as any).enrollments_count = enrollmentsCount;
      (s as any).completion_percentage = avgCompletion;
      (s as any).assignment_submissions_count = assignmentSubmissionsCount;
      (s as any).quiz_submissions_count = quizSubmissionsCount;
      (s as any).enrollment_statuses = enrollmentStatuses;
      (s as any).series = Array.from(seriesMap.values());
      //(s as any).courses = Array.from(courseMap.values());
      delete (s as any).enrollments;
    }));

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

  async findAllNameEmail() {
    const students = await this.prisma.user.findMany({
      where: { type: 'student', deleted_at: null },
      select: { id: true, name: true, email: true },
    });
    return students;
  }

  async findOne(id: string) {
    const student = await this.prisma.user.findFirst({
      where: { id, type: 'student', deleted_at: null },
      select: {
        id: true,
        name: true,
        first_name: true,
        last_name: true,
        email: true,
        username: true,
        avatar: true,
        created_at: true,
        enrollments: {
          select: {
            id: true,
            status: true,
            progress_percentage: true,
            series_id: true,
            series: { select: { id: true, title: true } },
          },
          orderBy: { enrolled_at: 'desc' },
        },
      },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    if (student.avatar) {
      (student as any).avatar_url = SojebStorage.url(appConfig().storageUrl.avatar + student.avatar);
    }

    // Compute per-series completion percentage from enrollment.progress_percentage
    const enrollmentsWithProgress = (student.enrollments || []).map((e: any) => ({
      ...e,
      completion_percentage: e.progress_percentage ?? 0,
    }));

    // Counts for submitted assignments and quizzes by this student
    const [assignmentSubmissionsCount, quizSubmissionsCount] = await Promise.all([
      this.prisma.assignmentSubmission.count({ where: { student_id: id } }),
      this.prisma.quizSubmission.count({ where: { student_id: id } }),
    ]);

    return {
      success: true,
      message: 'Student fetched',
      data: {
        ...student,
        enrollments: enrollmentsWithProgress,
        assignment_submissions_count: assignmentSubmissionsCount,
        quiz_submissions_count: quizSubmissionsCount,
      },
    };
  }

  async sendEmailNotification(student_id: string, message: string) {
    const student = await this.prisma.user.findFirst({
      where: { id: student_id, type: 'student', deleted_at: null },
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    // Create in-app notification
    await NotificationRepository.createNotification({
      receiver_id: student_id,
      text: message,
      type: 'message',
      entity_id: student_id,
    });

    // Emit realtime notification via websocket
    this.messageGateway.server.emit('notification', {
      receiver_id: student_id,
      text: message,
      type: 'message',
      entity_id: student_id,
    });

    // Send student notification email (dedicated method)
    await this.mailService.sendStudentNotificationEmail({
      to: 'nirob35-844@diu.edu.bd',
      recipientName: student.name || 'Student',
      subject: 'New notification',
      message,
    });

    return { success: true, message: 'Email notification sent' };
  }
}
