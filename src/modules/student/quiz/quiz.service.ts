import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DateHelper } from '../../../common/helper/date.helper';

@Injectable()
export class QuizService {
  constructor(private readonly prisma: PrismaService) { }

  async findAll(
    userId: string,
    page: number = 1,
    limit: number = 10,
    search?: string,
    series_id?: string,
    course_id?: string,
    submission_status?: 'submitted' | 'not_submitted',
  ) {
    const skip = (page - 1) * limit;

    // enrollment gate
    const enrollmentFilter: any = {
      user_id: userId,
      deleted_at: null,
      status: 'ACTIVE',
      payment_status: 'completed',
    };
    if (series_id) enrollmentFilter.series_id = series_id;

    const enrollments = await this.prisma.enrollment.findMany({
      where: enrollmentFilter,
      select: { series_id: true },
    });
    const enrolledSeriesIds = Array.from(new Set(enrollments.map(e => e.series_id))).filter(Boolean) as string[];
    if (enrolledSeriesIds.length === 0) {
      return { success: true, message: 'Quizzes retrieved successfully', data: { quizzes: [], pagination: { total: 0, page, limit, totalPages: 0, hasNextPage: false, hasPreviousPage: false } } };
    }

    const where: any = {
      deleted_at: null,
      series_id: { in: enrolledSeriesIds },
      publication_status: 'PUBLISHED',
      is_published: true,
    };
    if (course_id) where.course_id = course_id;
    if (search) where.title = { contains: search, mode: 'insensitive' as any };

    const [quizzes, total] = await Promise.all([
      this.prisma.quiz.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          instructions: true,
          total_marks: true,
          published_at: true,
          due_at: true,
          is_published: true,
          publication_status: true,
          created_at: true,
          updated_at: true,
          series: { select: { id: true, title: true } },
          course: { select: { id: true, title: true } },
          submissions: {
            where: { student_id: userId },
            select: {
              id: true,
              status: true,
              submitted_at: true,
              total_grade: true,
              percentage: true,
              graded_at: true,
            },
          },
        },
        orderBy: [{ published_at: 'desc' }, { created_at: 'desc' }],
      }),
      this.prisma.quiz.count({ where }),
    ]);

    // Process quizzes to include submission status
    let processedQuizzes = quizzes.map(quiz => {
      const submission = quiz.submissions[0] || null;
      const remainingTime = quiz.due_at ? DateHelper.getRemainingTime(quiz.due_at) : { formatted: '0 days' };

      return {
        ...quiz,
        remaining_time: remainingTime.formatted,
        submission_status: submission ? {
          id: submission.id,
          status: submission.status,
          submitted_at: submission.submitted_at,
          total_grade: submission.total_grade,
          percentage: submission.percentage,
          graded_at: submission.graded_at,
          is_submitted: true,
        } : {
          is_submitted: false,
        },
        submissions: undefined, // Remove the submissions array as we've processed it
      };
    });

    // Filter by submission status if provided
    if (submission_status === 'submitted') {
      processedQuizzes = processedQuizzes.filter(quiz => quiz.submission_status.is_submitted);
    } else if (submission_status === 'not_submitted') {
      processedQuizzes = processedQuizzes.filter(quiz => !quiz.submission_status.is_submitted);
    }

    // Recalculate pagination for filtered results
    const filteredTotal = processedQuizzes.length;
    const totalPages = Math.ceil(filteredTotal / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    return {
      success: true,
      message: 'Quizzes retrieved successfully',
      data: {
        quizzes: processedQuizzes,
        pagination: {
          total: filteredTotal,
          page,
          limit,
          totalPages,
          hasNextPage,
          hasPreviousPage
        }
      }
    };
  }

  async findOne(userId: string, id: string) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        instructions: true,
        total_marks: true,
        published_at: true,
        is_published: true,
        publication_status: true,
        created_at: true,
        updated_at: true,
        series_id: true,
        course_id: true,
        questions: {
          select: {
            id: true,
            prompt: true,
            points: true,
            position: true,
            created_at: true,
            answers: { select: { id: true, option: true } },
          }, orderBy: { position: 'asc' }
        },
        series: { select: { id: true, title: true } },
        course: { select: { id: true, title: true } },
      },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');

    const isEnrolled = await this.prisma.enrollment.findFirst({
      where: {
        user_id: userId,
        series_id: quiz.series_id || undefined,
        deleted_at: null,
        status: { in: ['ACTIVE', 'COMPLETED'] },
      },
      select: { id: true },
    });
    if (!isEnrolled) throw new NotFoundException('Quiz not available');

    return { success: true, message: 'Quiz retrieved successfully', data: quiz };
  }

  async submit(userId: string, quizId: string, payload: { answers: { question_id: string; answer_id?: string; answer_text?: string }[] }) {
    const quiz = await this.prisma.quiz.findUnique({ where: { id: quizId }, select: { id: true, series_id: true } });
    if (!quiz) throw new NotFoundException('Quiz not found');

    // check user submitted quiz
    const submittedQuiz = await this.prisma.quizSubmission.findFirst({
      where: { quiz_id: quizId, student_id: userId },
      select: { id: true },
    });
    if (submittedQuiz) throw new NotFoundException('Quiz already submitted');

    const isEnrolled = await this.prisma.enrollment.findFirst({
      where: { user_id: userId, series_id: quiz.series_id || undefined, deleted_at: null, status: { in: ['ACTIVE', 'COMPLETED'] } },
      select: { id: true },
    });
    if (!isEnrolled) throw new NotFoundException('Not enrolled');

    const submission = await this.prisma.quizSubmission.upsert({
      where: { quiz_id_student_id: { quiz_id: quizId, student_id: userId } },
      update: { updated_at: new Date() },
      create: { quiz_id: quizId, student_id: userId, status: 'IN_PROGRESS' as any },
      select: { id: true },
    });

    const incoming = payload?.answers || [];
    const questionIds = incoming.map(a => a.question_id);
    // Load quiz questions with points and correct options
    const questions = await this.prisma.quizQuestion.findMany({
      where: { quiz_id: quizId, ...(questionIds.length ? { id: { in: questionIds } } : {}) },
      select: { id: true, points: true, answers: { select: { id: true, is_correct: true } } },
    });
    const validSet = new Set(questions.map(q => q.id));
    for (const qid of questionIds) {
      if (!validSet.has(qid)) throw new NotFoundException('Invalid question for this quiz');
    }

    const questionPoints = new Map<string, number>();
    const correctAnswerIds = new Map<string, Set<string>>();
    for (const q of questions) {
      questionPoints.set(q.id, q.points || 0);
      const set = new Set<string>();
      for (const a of q.answers) if (a.is_correct) set.add(a.id);
      correctAnswerIds.set(q.id, set);
    }

    // Upsert answers with auto-marking
    let earned = 0;
    for (const ans of incoming) {
      const qPoints = questionPoints.get(ans.question_id) || 0;
      const correctSet = correctAnswerIds.get(ans.question_id) || new Set<string>();
      const isCorrect = ans.answer_id ? correctSet.has(ans.answer_id) : false;
      const pointsEarned = isCorrect ? qPoints : 0;

      if (pointsEarned > 0) earned += pointsEarned;

      await this.prisma.quizSubmissionAnswer.upsert({
        where: { submission_id_question_id: { submission_id: submission.id, question_id: ans.question_id } },
        update: { answer_id: ans.answer_id || null, answer_text: ans.answer_text || null, is_correct: isCorrect, points_earned: pointsEarned },
        create: { submission_id: submission.id, question_id: ans.question_id, answer_id: ans.answer_id || null, answer_text: ans.answer_text || null, is_correct: isCorrect, points_earned: pointsEarned },
      });
    }

    // Total marks is sum of all quiz question points
    const allQuestions = await this.prisma.quizQuestion.findMany({ where: { quiz_id: quizId }, select: { points: true } });
    const totalMarks = allQuestions.reduce((s, q) => s + (q.points || 0), 0);
    const percentage = totalMarks > 0 ? Math.round((earned / totalMarks) * 100) : 0;

    await this.prisma.quizSubmission.update({
      where: { id: submission.id },
      data: { total_grade: earned, percentage, status: 'SUBMITTED' as any, submitted_at: new Date() },
    });

    return { success: true, message: 'Quiz submitted', data: { submission_id: submission.id, total_grade: earned, total_marks: totalMarks, percentage } };
  }

  async getSubmission(userId: string, quizId: string) {


    const submission = await this.prisma.quizSubmission.findUnique({
      where: {
        quiz_id_student_id: {
          quiz_id: quizId,
          student_id: userId,
        },
      },
      select: {
        id: true,
        status: true,
        total_grade: true,
        percentage: true,
        time_taken: true,
        started_at: true,
        submitted_at: true,
        graded_at: true,
        feedback: true,
        created_at: true,
        updated_at: true,
        answers: {
          select: {
            id: true,
            question_id: true,
            answer_id: true,
            answer_text: true,
            is_correct: true,
            points_earned: true,
            feedback: true,
            question: { select: { id: true, prompt: true, points: true, position: true } },
          },
          orderBy: { id: 'asc' },
        },
      },
    });

    return { success: true, message: 'Submission retrieved', data: submission };
  }
}
