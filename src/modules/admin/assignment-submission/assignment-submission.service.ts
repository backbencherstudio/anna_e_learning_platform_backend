import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import appConfig from 'src/config/app.config';
import { SojebStorage } from 'src/common/lib/Disk/SojebStorage';

@Injectable()
export class AssignmentSubmissionService {
  private readonly logger = new Logger(AssignmentSubmissionService.name);

  constructor(private readonly prisma: PrismaService) { }

  async findAll(
    page: number = 1,
    limit: number = 10,
    search?: string,
    assignment_id?: string,
    student_id?: string,
    status?: string,
    series_id?: string,
    course_id?: string,
  ) {
    try {
      const skip = (page - 1) * limit;

      const where: any = {
      };

      if (assignment_id) where.assignment_id = assignment_id;
      if (student_id) where.student_id = student_id;
      if (status) where.status = status;
      if (series_id) {
        where.assignment = {
          ...(where.assignment || {}),
          series_id: series_id,
        };
      }

      if (course_id) {
        where.assignment = {
          ...(where.assignment || {}),
          course_id: course_id,
        };
      }
      if (search) {
        where.OR = [
          { student: { name: { contains: search, mode: 'insensitive' as any } } },
          { student: { email: { contains: search, mode: 'insensitive' as any } } },
          { assignment: { title: { contains: search, mode: 'insensitive' as any } } },
        ];
      }

      const [submissions, total] = await Promise.all([
        this.prisma.assignmentSubmission.findMany({
          where,
          skip,
          take: limit,
          select: {
            id: true,
            status: true,
            total_grade: true,
            overall_feedback: true,
            graded_by_id: true,
            graded_at: true,
            created_at: true,
            submitted_at: true,
            assignment: {
              select: {
                id: true,
                title: true,
                total_marks: true,
                series: { select: { id: true, title: true } },
                course: { select: { id: true, title: true } },
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
          orderBy: { created_at: 'desc' },
        }),
        this.prisma.assignmentSubmission.count({ where }),
      ]);

      // add avatar url to student
      for (const submission of submissions) {
        if (submission.student.avatar) {
          submission.student['avatar_url'] = SojebStorage.url(
            appConfig().storageUrl.avatar + submission.student.avatar,
          );
        }
      }

      const totalPages = Math.ceil(total / limit);
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;

      return {
        success: true,
        message: 'Assignment submissions retrieved successfully',
        data: {
          submissions,
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
      this.logger.error(`Error fetching assignment submissions: ${error.message}`, error.stack);
      return {
        success: false,
        message: 'Failed to fetch assignment submissions',
        error: error.message,
      };
    }
  }

  async findOne(id: string) {
    try {
      const submission = await this.prisma.assignmentSubmission.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          total_grade: true,
          overall_feedback: true,
          graded_by_id: true,
          graded_at: true,
          created_at: true,
          updated_at: true,
          assignment: {
            select: {
              id: true,
              title: true,
              description: true,
              total_marks: true,
              due_at: true,
              series: { select: { id: true, title: true } },
              course: { select: { id: true, title: true } },
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
          graded_by: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          answers: {
            select: {
              id: true,
              question_id: true,
              answer_text: true,
              marks_awarded: true,
              feedback: true,
              question: {
                select: {
                  id: true,
                  title: true,
                  points: true,
                  position: true,
                },
              },
            },
            orderBy: { id: 'asc' },
          },
          files: {
            select: {
              id: true,
              url: true,
              name: true,
              created_at: true,
            },
            orderBy: { created_at: 'asc' },
          },
        },
      });

      if (!submission) {
        throw new NotFoundException(`Assignment submission with ID ${id} not found`);
      }

      // add avatar url to student
      if (submission.student.avatar) {
        submission.student['avatar_url'] = SojebStorage.url(
          appConfig().storageUrl.avatar + submission.student.avatar,
        );
      }

      return {
        success: true,
        message: 'Assignment submission retrieved successfully',
        data: submission,
      };
    } catch (error) {
      this.logger.error(`Error fetching assignment submission ${id}: ${error.message}`, error.stack);

      if (error instanceof NotFoundException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to fetch assignment submission',
        error: error.message,
      };
    }
  }

  async gradeSubmission(
    submissionId: string,
    answers: { question_id: string; marks_awarded: number; feedback?: string }[],
    overall_feedback?: string,
  ) {
    try {
      this.logger.log(`Grading assignment submission: ${submissionId}`);

      // Check if submission exists
      const submission = await this.prisma.assignmentSubmission.findUnique({
        where: { id: submissionId },
        select: {
          id: true,
          assignment_id: true,
          student_id: true,
          status: true,
        },
      });

      if (!submission) {
        throw new NotFoundException(`Assignment submission with ID ${submissionId} not found`);
      }

      // Get assignment questions to validate marks
      const assignmentQuestions = await this.prisma.assignmentQuestion.findMany({
        where: { assignment_id: submission.assignment_id },
        select: { id: true, points: true },
      });

      const questionPointsMap = new Map(assignmentQuestions.map(q => [q.id, q.points]));

      // Validate marks for each answer
      for (const answer of answers) {
        const maxPoints = questionPointsMap.get(answer.question_id);
        if (maxPoints === undefined) {
          throw new BadRequestException(`Question ${answer.question_id} not found in assignment`);
        }
        if (answer.marks_awarded > maxPoints) {
          throw new BadRequestException(`Marks awarded (${answer.marks_awarded}) cannot exceed question points (${maxPoints})`);
        }
        if (answer.marks_awarded < 0) {
          throw new BadRequestException(`Marks awarded cannot be negative`);
        }
      }

      // Calculate total grade
      const totalGrade = answers.reduce((sum, answer) => sum + answer.marks_awarded, 0);

      // Update submission and answers in a transaction
      const result = await this.prisma.$transaction(async (prisma) => {
        // Update individual answers
        for (const answer of answers) {
          await prisma.assignmentAnswer.upsert({
            where: {
              submission_id_question_id: {
                submission_id: submissionId,
                question_id: answer.question_id,
              },
            },
            update: {
              marks_awarded: answer.marks_awarded,
              feedback: answer.feedback || null,
            },
            create: {
              submission_id: submissionId,
              question_id: answer.question_id,
              marks_awarded: answer.marks_awarded,
              feedback: answer.feedback || null,
            },
          });
        }

        // Update submission with total grade and status
        const updatedSubmission = await prisma.assignmentSubmission.update({
          where: { id: submissionId },
          data: {
            total_grade: totalGrade,
            overall_feedback: overall_feedback || null,
            graded_at: new Date(),
            status: 'GRADED',
          },
          select: {
            id: true,
            total_grade: true,
            overall_feedback: true,
            graded_by_id: true,
            graded_at: true,
            status: true,
            assignment: {
              select: {
                id: true,
                title: true,
                total_marks: true,
              },
            },
            student: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            graded_by: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        });

        return updatedSubmission;
      });

      this.logger.log(`Assignment submission ${submissionId} graded successfully with total grade: ${totalGrade}`);

      return {
        success: true,
        message: 'Assignment submission graded successfully',
        data: result,
      };
    } catch (error) {
      this.logger.error(`Error grading assignment submission ${submissionId}: ${error.message}`, error.stack);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to grade assignment submission',
        error: error.message,
      };
    }
  }

  async updateGrade(
    submissionId: string,
    answers: { question_id: string; marks_awarded: number; feedback?: string }[],
    overall_feedback?: string,
  ) {
    try {
      this.logger.log(`Updating grade for assignment submission: ${submissionId}`);

      // Check if submission exists and is already graded
      const submission = await this.prisma.assignmentSubmission.findUnique({
        where: { id: submissionId },
        select: {
          id: true,
          assignment_id: true,
          student_id: true,
          status: true,
          total_grade: true,
        },
      });

      if (!submission) {
        throw new NotFoundException(`Assignment submission with ID ${submissionId} not found`);
      }

      if (submission.status !== 'GRADED') {
        throw new BadRequestException(`Submission must be graded before updating grades. Current status: ${submission.status}`);
      }

      // Get assignment questions to validate marks
      const assignmentQuestions = await this.prisma.assignmentQuestion.findMany({
        where: { assignment_id: submission.assignment_id },
        select: { id: true, points: true },
      });

      const questionPointsMap = new Map(assignmentQuestions.map(q => [q.id, q.points]));

      // Validate marks for each answer
      for (const answer of answers) {
        const maxPoints = questionPointsMap.get(answer.question_id);
        if (maxPoints === undefined) {
          throw new BadRequestException(`Question ${answer.question_id} not found in assignment`);
        }
        if (answer.marks_awarded > maxPoints) {
          throw new BadRequestException(`Marks awarded (${answer.marks_awarded}) cannot exceed question points (${maxPoints})`);
        }
        if (answer.marks_awarded < 0) {
          throw new BadRequestException(`Marks awarded cannot be negative`);
        }
      }

      // Update submission and answers in a transaction
      const result = await this.prisma.$transaction(async (prisma) => {
        // Update individual answers
        for (const answer of answers) {
          await prisma.assignmentAnswer.updateMany({
            where: {
              submission_id: submissionId,
              question_id: answer.question_id,
            },
            data: {
              marks_awarded: answer.marks_awarded,
              feedback: answer.feedback || null,
            },
          });
        }

        // Recalculate total grade from ALL answers in the submission
        const allAnswers = await prisma.assignmentAnswer.findMany({
          where: { submission_id: submissionId },
          select: { marks_awarded: true },
        });

        const newTotalGrade = allAnswers.reduce((sum, answer) => sum + answer.marks_awarded, 0);

        // Update submission with recalculated total grade
        const updatedSubmission = await prisma.assignmentSubmission.update({
          where: { id: submissionId },
          data: {
            total_grade: newTotalGrade,
            overall_feedback: overall_feedback !== undefined ? overall_feedback : undefined,
            graded_at: new Date(), // Update grading timestamp
          },
          select: {
            id: true,
            total_grade: true,
            overall_feedback: true,
            graded_by_id: true,
            graded_at: true,
            status: true,
            assignment: {
              select: {
                id: true,
                title: true,
                total_marks: true,
              },
            },
            student: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            graded_by: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        });

        return updatedSubmission;
      });

      this.logger.log(`Assignment submission ${submissionId} grade updated successfully. New total grade: ${result.total_grade} (was: ${submission.total_grade})`);

      return {
        success: true,
        message: 'Assignment submission grade updated successfully',
        data: result,
      };
    } catch (error) {
      this.logger.error(`Error updating grade for assignment submission ${submissionId}: ${error.message}`, error.stack);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to update assignment submission grade',
        error: error.message,
      };
    }
  }
}
