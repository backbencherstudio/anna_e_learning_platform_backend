import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class AssignmentService {
  private readonly logger = new Logger(AssignmentService.name);
  constructor(private readonly prisma: PrismaService) { }

  async findAll(
    userId: string,
    page: number = 1,
    limit: number = 10,
    search?: string,
    series_id?: string,
    course_id?: string,
  ) {
    const skip = (page - 1) * limit;

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');

    // Ensure the student is enrolled (active/paid) in the filtered series if provided
    const enrollmentFilter: any = {
      user_id: userId,
      deleted_at: null,
      status: 'ACTIVE',
      payment_status: 'completed',
    };
    if (series_id) enrollmentFilter.series_id = series_id;

    // Get enrolled series ids for the user
    const enrollments = await this.prisma.enrollment.findMany({
      where: enrollmentFilter,
      select: { series_id: true },
    });


    const enrolledSeriesIds = Array.from(new Set(enrollments.map((e) => e.series_id))).filter(Boolean) as string[];

    // If no enrollment, return empty
    if (enrolledSeriesIds.length === 0) {
      return {
        success: true,
        message: 'Assignments retrieved successfully',
        data: { assignments: [], pagination: { total: 0, page, limit, totalPages: 0, hasNextPage: false, hasPreviousPage: false } },
      };
    }

    const where: any = {
      deleted_at: null,
      publication_status: 'PUBLISHED',
      series_id: { in: enrolledSeriesIds },
    };
    if (course_id) where.course_id = course_id;
    if (search) where.title = { contains: search, mode: 'insensitive' as any };

    const [assignments, total] = await Promise.all([
      this.prisma.assignment.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          description: true,
          published_at: true,
          publication_status: true,
          total_marks: true,
          created_at: true,
          updated_at: true,
          series: { select: { id: true, title: true } },
          course: { select: { id: true, title: true } },
        },
        orderBy: [{ published_at: 'desc' }, { created_at: 'desc' }],
      }),
      this.prisma.assignment.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    return {
      success: true,
      message: 'Assignments retrieved successfully',
      data: { assignments, pagination: { total, page, limit, totalPages, hasNextPage, hasPreviousPage } },
    };
  }

  async findOne(userId: string, id: string) {
    // Verify the assignment exists and belongs to a series the user is enrolled in
    const assignment = await this.prisma.assignment.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        description: true,
        published_at: true,
        publication_status: true,
        total_marks: true,
        created_at: true,
        updated_at: true,
        series_id: true,
        course_id: true,
        questions: { select: { id: true, title: true, points: true, position: true }, orderBy: { position: 'asc' } },
        series: { select: { id: true, title: true } },
        course: { select: { id: true, title: true } },
      },
    });

    if (!assignment) throw new NotFoundException('Assignment not found');

    const isEnrolled = await this.prisma.enrollment.findFirst({
      where: {
        user_id: userId,
        series_id: assignment.series_id || undefined,
        deleted_at: null,
        status: { in: ['ACTIVE', 'COMPLETED'] },
      },
      select: { id: true },
    });
    if (!isEnrolled) throw new NotFoundException('Assignment not available');

    return { success: true, message: 'Assignment retrieved successfully', data: assignment };
  }

  async submit(studentId: string, assignmentId: string, payload: { answers: { question_id: string; answer_text?: string }[] }) {
    // ensure assignment exists and student enrolled
    const assignment = await this.prisma.assignment.findUnique({ where: { id: assignmentId }, select: { id: true, series_id: true } });
    if (!assignment) throw new NotFoundException('Assignment not found');

    // check user submitted assignment
    const submittedAssignment = await this.prisma.assignmentSubmission.findFirst({
      where: { assignment_id: assignmentId, student_id: studentId },
      select: { id: true },
    });
    if (submittedAssignment) throw new NotFoundException('Assignment already submitted');

    const student = await this.prisma.user.findUnique({ where: { id: studentId }, select: { id: true } });
    if (!student) throw new NotFoundException('Student not found');

    const isEnrolled = await this.prisma.enrollment.findFirst({
      where: {
        user_id: studentId,
        series_id: assignment.series_id || undefined,
        deleted_at: null,
        status: { in: ['ACTIVE', 'COMPLETED'] },
      },
      select: { id: true },
    });
    if (!isEnrolled) throw new NotFoundException('Not enrolled');

    // validate that all question_ids belong to the assignment
    const incoming = payload?.answers || [];
    const questionIds = incoming.map(a => a.question_id);
    if (questionIds.length > 0) {
      const valid = await this.prisma.assignmentQuestion.findMany({
        where: { assignment_id: assignmentId, id: { in: questionIds } },
        select: { id: true },
      });
      const validSet = new Set(valid.map(v => v.id));
      for (const qid of questionIds) {
        if (!validSet.has(qid)) {
          throw new NotFoundException('Invalid question for this assignment');
        }
      }
    }

    // upsert submission
    const submission = await this.prisma.assignmentSubmission.upsert({
      where: {
        assignment_id_student_id: {
          assignment_id: assignmentId,
          student_id: studentId,
        },
      },
      update: { updated_at: new Date() },
      create: { assignment_id: assignmentId, student_id: studentId, status: 'DRAFT' as any },
      select: { id: true },
    });

    // upsert answers per question
    for (const ans of incoming) {
      await this.prisma.assignmentAnswer.upsert({
        where: { submission_id_question_id: { submission_id: submission.id, question_id: ans.question_id } },
        update: { answer_text: ans.answer_text || null },
        create: { submission_id: submission.id, question_id: ans.question_id, answer_text: ans.answer_text || null },
      });
    }

    await this.prisma.assignmentSubmission.update({
      where: { id: submission.id },
      data: { status: 'SUBMITTED' as any, submitted_at: new Date() },
    });

    return { success: true, message: 'Submission saved', data: { submission_id: submission.id } };
  }

  async getSubmission(studentId: string, assignmentId: string) {
    // Ensure student exists (lightweight guard)
    const student = await this.prisma.user.findUnique({ where: { id: studentId }, select: { id: true } });
    if (!student) throw new NotFoundException('Student not found');

    const submission = await this.prisma.assignmentSubmission.findUnique({
      where: {
        assignment_id_student_id: {
          assignment_id: assignmentId,
          student_id: studentId,
        },
      },
      select: {
        id: true,
        status: true,
        total_grade: true,
        overall_feedback: true,
        graded_by_id: true,
        graded_at: true,
        submitted_at: true,
        answers: {
          select: {
            id: true,
            question_id: true,
            answer_text: true,
            marks_awarded: true,
            feedback: true,
            question: { select: { id: true, title: true, points: true, position: true } },
          },
          orderBy: { id: 'asc' },
        },
      },
    });

    return { success: true, message: 'Submission retrieved', data: submission };
  }
}

