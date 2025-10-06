import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import { SojebStorage } from '../../../common/lib/Disk/SojebStorage';
import appConfig from '../../../config/app.config';
import { MessageGateway } from '../../chat/message/message.gateway';
import { NotificationRepository } from '../../../common/repository/notification/notification.repository';
import { MailService } from '../../../mail/mail.service';
import csvParser from 'csv-parser';
import { createWriteStream, createReadStream } from 'fs';
import { Readable } from 'stream';

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

  async downloadUserDetailsAsCSV(id: string) {
    const student = await this.prisma.user.findFirst({
      where: { id, deleted_at: null },
      select: {
        id: true,
        name: true,
        first_name: true,
        last_name: true,
        email: true,
        username: true,
        phone_number: true,
        address: true,
        date_of_birth: true,
        gender: true,
        created_at: true,
        updated_at: true,
        enrollments: {
          select: {
            id: true,
            status: true,
            progress_percentage: true,
            enrolled_at: true,
            completed_at: true,
            expires_at: true,
            payment_status: true,
            series: {
              select: {
                id: true,
                title: true,
                course_type: true,
                total_price: true,
                duration: true,
                start_date: true,
                end_date: true,
              },
            },
          },
          orderBy: { enrolled_at: 'desc' },
        },
        assignment_submissions: {
          select: {
            id: true,
            status: true,
            total_grade: true,
            percentage: true,
            submitted_at: true,
            overall_feedback: true,
            assignment: {
              select: {
                id: true,
                title: true,
                series: { select: { title: true } },
              },
            },
          },
          orderBy: { submitted_at: 'desc' },
        },
        quiz_submissions: {
          select: {
            id: true,
            status: true,
            total_grade: true,
            percentage: true,
            submitted_at: true,
            feedback: true,
            quiz: {
              select: {
                id: true,
                title: true,
                series: { select: { title: true } },
              },
            },
          },
          orderBy: { submitted_at: 'desc' },
        },
        certificates: {
          select: {
            id: true,
            certificate_number: true,
            created_at: true,
            series: { select: { title: true } },
          },
          orderBy: { created_at: 'desc' },
        },
      },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    // Type cast the student object to include all relations
    const studentData = student as any;

    // Calculate statistics
    const totalEnrollments = studentData.enrollments.length;
    const activeEnrollments = studentData.enrollments.filter((e: any) => e.status === 'ACTIVE').length;
    const completedEnrollments = studentData.enrollments.filter((e: any) => e.status === 'COMPLETED').length;
    const avgProgress = totalEnrollments > 0
      ? Math.round((studentData.enrollments.reduce((acc: number, e: any) => acc + (e.progress_percentage ?? 0), 0) / totalEnrollments) * 100) / 100
      : 0;

    const totalAssignments = studentData.assignment_submissions.length;
    const completedAssignments = studentData.assignment_submissions.filter((s: any) => s.status === 'COMPLETED').length;
    const avgAssignmentScore = completedAssignments > 0
      ? Math.round((studentData.assignment_submissions.reduce((acc: number, s: any) => acc + (s.total_grade ?? 0), 0) / completedAssignments) * 100) / 100
      : 0;

    const totalQuizzes = studentData.quiz_submissions.length;
    const avgQuizScore = totalQuizzes > 0
      ? Math.round((studentData.quiz_submissions.reduce((acc: number, q: any) => acc + (q.total_grade ?? 0), 0) / totalQuizzes) * 100) / 100
      : 0;

    const totalCertificates = studentData.certificates.length;
    const totalPaid = studentData.enrollments.reduce((acc: number, e: any) => acc + (e.series.total_price || 0), 0);

    // Generate CSV content
    const csvData = this.generateUserCSV(student, studentData, {
      totalEnrollments,
      activeEnrollments,
      completedEnrollments,
      avgProgress,
      totalAssignments,
      completedAssignments,
      avgAssignmentScore,
      totalQuizzes,
      avgQuizScore,
      totalCertificates,
      totalPaid,
    });

    return {
      success: true,
      message: 'Student details CSV generated successfully',
      data: {
        csv: csvData,
        filename: `Student_Report_${(student.username || student.name || 'Student').replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`,
      },
    };
  }

  private generateUserCSV(student: any, studentData: any, stats: any): string {
    const escapeCSV = (value: any): string => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const formatDate = (date: any): string => {
      if (!date) return '';
      return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    };

    const formatCurrency = (amount: any): string => {
      if (!amount) return '$0.00';
      return `$${parseFloat(amount).toFixed(2)}`;
    };

    const formatPercentage = (value: any): string => {
      if (!value) return '0%';
      return `${parseFloat(value).toFixed(1)}%`;
    };

    const generateSeparator = (title: string, length: number = 80): string => {
      const dashes = '='.repeat(Math.max(0, length - title.length - 4));
      return `=== ${title} ${dashes}`;
    };

    const rows = [
      // Beautiful Header
      [generateSeparator('STUDENT DETAILS REPORT')],
      [''],
      ['COMPREHENSIVE STUDENT ANALYSIS'],
      [`Generated: ${new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}`],
      [''],
      [generateSeparator('')],
      [''],

      // Basic Information Section
      ['BASIC INFORMATION'],
      [generateSeparator('Personal Details')],
      ['Field', 'Value', ' ', 'Details'],
      [generateSeparator('')],
      ['Student ID', '', escapeCSV(student.id)],
      ['Full Name', '', escapeCSV(student.name)],
      ['First Name', '', escapeCSV(student.first_name)],
      ['Last Name', '', escapeCSV(student.last_name)],
      ['Email Address', '', escapeCSV(student.email)],
      ['Username', '', escapeCSV(student.username)],
      ['Phone Number', '', escapeCSV(student.phone_number)],
      ['Address', '', escapeCSV(student.address)],
      ['Date of Birth', '', formatDate(student.date_of_birth)],
      ['Gender', '', escapeCSV(student.gender)],
      ['Account Created', '', formatDate(student.created_at)],
      ['Last Updated', '', formatDate(student.updated_at)],
      [''],

      // Performance Statistics
      ['PERFORMANCE STATISTICS'],
      [generateSeparator('Learning Analytics')],
      ['Metric', 'Value', ' ', 'Description'],
      [generateSeparator('')],
      ['Total Enrollments', '', escapeCSV(stats.totalEnrollments)],
      ['Active Enrollments', '', escapeCSV(stats.activeEnrollments)],
      ['Completed Enrollments', '', escapeCSV(stats.completedEnrollments)],
      ['Average Progress', '', formatPercentage(stats.avgProgress)],
      ['Total Assignments', '', escapeCSV(stats.totalAssignments)],
      ['Completed Assignments', '', escapeCSV(stats.completedAssignments)],
      ['Avg Assignment Score', '', formatPercentage(stats.avgAssignmentScore)],
      ['Total Quizzes', '', escapeCSV(stats.totalQuizzes)],
      ['Avg Quiz Score', '', formatPercentage(stats.avgQuizScore)],
      ['Total Certificates', '', escapeCSV(stats.totalCertificates)],
      ['Total Invested', '', formatCurrency(stats.totalPaid)],
      [''],

      // Enrollments Section
      ['ENROLLMENT HISTORY'],
      [generateSeparator('Series & Courses')],
      ['Enrollment ID', 'Series Title', 'Type', 'Status', 'Progress', 'Enrolled', 'Payment'],
      [generateSeparator('')],
      ...studentData.enrollments.map((enrollment: any) => [
        escapeCSV(enrollment.id.substring(0, 8) + '...'),
        escapeCSV(enrollment.series.title),
        escapeCSV(enrollment.series.course_type),
        escapeCSV(enrollment.status),
        formatPercentage(enrollment.progress_percentage),
        formatDate(enrollment.enrolled_at),
        escapeCSV(enrollment.payment_status)
      ]),
      [''],

      // Assignment Submissions
      ['ASSIGNMENT SUBMISSIONS'],
      [generateSeparator('Academic Performance')],
      ['Submission ID', 'Assignment', 'Series', 'Status', 'Score', 'Percentage', 'Submitted'],
      [generateSeparator('')],
      ...studentData.assignment_submissions.map((submission: any) => [
        escapeCSV(submission.id.substring(0, 8) + '...'),
        escapeCSV(submission.assignment.title),
        escapeCSV(submission.assignment.series.title),
        escapeCSV(submission.status),
        escapeCSV(submission.total_grade),
        formatPercentage(submission.percentage),
        formatDate(submission.submitted_at)
      ]),
      [''],

      // Quiz Submissions
      ['QUIZ PERFORMANCE'],
      [generateSeparator('Knowledge Assessment')],
      ['Submission ID', 'Quiz Title', 'Series', 'Status', 'Score', 'Percentage', 'Completed'],
      [generateSeparator('')],
      ...studentData.quiz_submissions.map((submission: any) => [
        escapeCSV(submission.id.substring(0, 8) + '...'),
        escapeCSV(submission.quiz.title),
        escapeCSV(submission.quiz.series.title),
        escapeCSV(submission.status),
        escapeCSV(submission.total_grade),
        formatPercentage(submission.percentage),
        formatDate(submission.submitted_at)
      ]),
      [''],

      // Certificates Section
      ['CERTIFICATES & ACHIEVEMENTS'],
      [generateSeparator('Accomplishments')],
      ['Certificate ID', 'Certificate #', 'Series Title', 'Issued Date', 'Status', ''],
      [generateSeparator('')],
      ...studentData.certificates.map((certificate: any) => [
        escapeCSV(certificate.id.substring(0, 8) + '...'),
        escapeCSV(certificate.certificate_number),
        escapeCSV(certificate.series.title),
        formatDate(certificate.created_at),
        'Earned',
        ''
      ]),
      [''],

      // Footer
      [generateSeparator('REPORT SUMMARY')],
      ['This report contains comprehensive analytics for student performance and engagement'],
      ['Report generated automatically by Anna E-Learning Platform'],
      ['All data is confidential and should be handled securely'],
      [generateSeparator('')],
      ['']
    ];

    // Use csv-parser compatible format
    return this.generateCSVWithParser(rows);
  }

  private generateCSVWithParser(rows: string[][]): string {
    // Convert array of arrays to proper CSV format using csv-parser compatible formatting
    const csvContent = rows.map(row => {
      return row.map(cell => {
        // Escape CSV values properly
        if (cell === null || cell === undefined) return '';
        const str = String(cell);
        // If cell contains comma, quote, or newline, wrap in quotes and escape internal quotes
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(',');
    }).join('\n');

    return csvContent;
  }

  private calculateLearningStreak(enrollments: any[]): number {
    // Simple implementation - could be enhanced with actual learning activity tracking
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));

    const recentEnrollments = enrollments.filter(e =>
      e.enrolled_at && new Date(e.enrolled_at) >= thirtyDaysAgo
    );

    return recentEnrollments.length;
  }

  async sendEmailNotification(student_id: string, message: string) {
    const student = await this.prisma.user.findFirst({
      where: { id: student_id, deleted_at: null },
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
      to: student.email,
      recipientName: student.name || 'Student',
      subject: 'New notification',
      message,
    });

    return { success: true, message: 'Email notification sent' };
  }

  async remove(id: string) {
    try {
      this.logger.log(`Soft deleting student with ID: ${id}`);

      // First check if student exists and is not already deleted
      const student = await this.prisma.user.findFirst({
        where: {
          id,
          type: 'student',
          deleted_at: null
        },
        select: { id: true, name: true, email: true },
      });

      if (!student) {
        throw new NotFoundException('Student not found or already deleted');
      }

      // Soft delete the student by setting deleted_at timestamp
      const deletedStudent = await this.prisma.user.update({
        where: { id },
        data: {
          deleted_at: new Date(),
          updated_at: new Date(),
        },
        select: {
          id: true,
          name: true,
          email: true,
          deleted_at: true,
        },
      });

      this.logger.log(`Successfully soft deleted student: ${student.name} (${student.email})`);

      return {
        success: true,
        message: 'Student soft deleted successfully',
        data: {
          id: deletedStudent.id,
          name: deletedStudent.name,
          email: deletedStudent.email,
          deleted_at: deletedStudent.deleted_at,
        },
      };
    } catch (error) {
      this.logger.error(`Error soft deleting student ${id}: ${error.message}`, error.stack);

      if (error instanceof NotFoundException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to soft delete student',
        error: error.message,
      };
    }
  }

}
