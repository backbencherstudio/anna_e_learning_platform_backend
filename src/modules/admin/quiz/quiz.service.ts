import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { UpdateQuizDto } from './dto/update-quiz.dto';
import { QuizResponse } from './interfaces/quiz-response.interface';
import { Quiz, QuizQuestion, QuestionAnswer } from '@prisma/client';
import { DateHelper } from 'src/common/helper/date.helper';
import { QuizPublishService } from '../../queue/quiz-publish.service';

@Injectable()
export class QuizService {
  private readonly logger = new Logger(QuizService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly quizPublishService: QuizPublishService,
  ) { }

  /**
   * Get quiz dashboard data - published and unpublished quizzes with submission stats
   */
  async getDashboard(query?: { series_id?: string; course_id?: string; limit?: number }): Promise<any> {
    try {
      this.logger.log('Fetching quiz dashboard data');

      const limit = query?.limit || 10;
      const whereClause: any = {};

      if (query?.series_id) {
        whereClause.series_id = query.series_id;
      }
      if (query?.course_id) {
        whereClause.course_id = query.course_id;
      }

      const submittedQuizzes = await this.prisma.quiz.findMany({
        where: {
          ...whereClause,
          is_published: true,
          // todo submissions: {
          //   some: {
          //     status: {
          //       in: ['SUBMITTED', 'GRADED'],
          //     },
          //   },
          // },
        },
        take: limit,
        select: {
          id: true,
          title: true,
          due_at: true,
          published_at: true,
          is_published: true,
          created_at: true,
          total_marks: true,
          series: {
            select: {
              id: true,
              title: true,
            },
          },
          course: {
            select: {
              id: true,
              title: true,
            },
          },
          _count: {
            select: {
              submissions: true,
            },
          },
          submissions: {
            select: {
              id: true,
              status: true,
              score: true,
              percentage: true,
            },
          },
        },
        orderBy: { created_at: 'desc' },
      });

      // Fetch published quizzes with submission counts and stats
      const publishedQuizzes = await this.prisma.quiz.findMany({
        where: {
          ...whereClause,
          is_published: true,
        },
        take: limit,
        select: {
          id: true,
          title: true,
          due_at: true,
          published_at: true,
          is_published: true,
          created_at: true,
          total_marks: true,
        },
        orderBy: { created_at: 'desc' },
      });

      // Fetch unpublished quizzes
      const unpublishedQuizzes = await this.prisma.quiz.findMany({
        where: {
          ...whereClause,
          is_published: false,
        },
        take: limit,
        select: {
          id: true,
          title: true,
          due_at: true,
          published_at: true,
          is_published: true,
          created_at: true,
          total_marks: true,
        },
        orderBy: { created_at: 'desc' },
      });

      // Calculate submission statistics for published quizzes
      const submittedQuizzesWithStats = submittedQuizzes.map(quiz => {
        const submittedCount = quiz.submissions.filter(s => s.status === 'SUBMITTED' || s.status === 'GRADED').length;
        const gradedCount = quiz.submissions.filter(s => s.status === 'GRADED').length;
        const remainingTime = quiz.due_at ? DateHelper.diff(quiz.due_at.toISOString(), DateHelper.now().toISOString(), 'days') : null;
        const averageScore = gradedCount > 0
          ? quiz.submissions
            .filter(s => s.status === 'GRADED')
            .reduce((sum, s) => sum + (s.percentage || 0), 0) / gradedCount
          : 0;

        return {
          ...quiz,
          submission_count: submittedCount,
          total_students: 34,  //todo: This should be calculated from actual enrollments
        };
      });

      const publishedQuizzesWithStats = publishedQuizzes.map(quiz => {
        const remainingTime = quiz.due_at ? DateHelper.diff(quiz.due_at.toISOString(), DateHelper.now().toISOString(), 'days') : null;
        return {
          ...quiz,
          remaining_time: remainingTime,
        };
      });

      // Get counts for summary
      const [totalPublishedQuizzes, totalUnpublishedQuizzes, totalQuizSubmissions] = await Promise.all([
        this.prisma.quiz.count({ where: { ...whereClause, is_published: true } }),
        this.prisma.quiz.count({ where: { ...whereClause, is_published: false } }),
        this.prisma.quizSubmission.count({
          where: {
            quiz: whereClause,
            status: { in: ['SUBMITTED', 'GRADED'] }
          }
        }),
      ]);

      return {
        success: true,
        message: 'Quiz dashboard data retrieved successfully',
        data: {
          submitted_quizzes: submittedQuizzesWithStats,
          published_quizzes: publishedQuizzesWithStats,
          unpublished_quizzes: unpublishedQuizzes,
          total_published_quizzes: totalPublishedQuizzes,
          total_unpublished_quizzes: totalUnpublishedQuizzes,
          total_submissions: totalQuizSubmissions,
          summary: {
            total_quizzes: totalPublishedQuizzes + totalUnpublishedQuizzes,
            active_quizzes: totalPublishedQuizzes,
            pending_publication: totalUnpublishedQuizzes,
            total_submissions: totalQuizSubmissions,
          }
        },
      };
    } catch (error) {
      this.logger.error(`Error fetching quiz dashboard data: ${error.message}`, error.stack);
      return {
        success: false,
        message: 'Failed to fetch quiz dashboard data',
        error: error.message,
      };
    }
  }

  /**
   * Create a new quiz with questions and answers
   */
  async create(createQuizDto: CreateQuizDto): Promise<QuizResponse<Quiz>> {
    try {
      this.logger.log('Creating new quiz');

      // Validate that at least one question is provided
      if (!createQuizDto.questions || createQuizDto.questions.length === 0) {
        throw new BadRequestException('At least one question is required');
      }

      // Validate that each question has at least 2 answers
      for (const question of createQuizDto.questions) {
        if (!question.answers || question.answers.length < 2) {
          throw new BadRequestException(`Question "${question.prompt}" must have at least 2 answers`);
        }

        // Validate that at least one answer is marked as correct
        const hasCorrectAnswer = question.answers.some(answer => answer.is_correct);
        if (!hasCorrectAnswer) {
          throw new BadRequestException(`Question "${question.prompt}" must have at least one correct answer`);
        }
      }

      // Calculate total marks if not provided
      let totalMarks = createQuizDto.total_marks;
      if (!totalMarks) {
        totalMarks = createQuizDto.questions.reduce((sum, question) => sum + (question.points || 1), 0);
      }

      // Create quiz with questions and answers in a transaction
      const result = await this.prisma.$transaction(async (prisma) => {
        // Determine publication status and scheduling
        const now = new Date();
        const publishAt = createQuizDto.published_at ? new Date(createQuizDto.published_at) : undefined;
        const shouldPublishImmediately = createQuizDto.is_published || (publishAt && publishAt <= now);

        let publicationStatus = 'DRAFT';
        let scheduledPublishAt = null;

        if (shouldPublishImmediately) {
          publicationStatus = 'PUBLISHED';
        } else if (publishAt && publishAt > now) {
          publicationStatus = 'SCHEDULED';
          scheduledPublishAt = publishAt;
        }

        // Create the quiz
        const quiz = await prisma.quiz.create({
          data: {
            title: createQuizDto.title,
            instructions: createQuizDto.instructions,
            total_marks: totalMarks,
            due_at: createQuizDto.due_at ? new Date(createQuizDto.due_at) : undefined,
            is_published: shouldPublishImmediately,
            published_at: shouldPublishImmediately ? now : undefined,
            publication_status: publicationStatus,
            scheduled_publish_at: scheduledPublishAt,
            metadata: createQuizDto.metadata,
            series_id: createQuizDto.series_id,
            course_id: createQuizDto.course_id,
          },
        });

        this.logger.log(`Created quiz with ID: ${quiz.id}`);

        // Create questions and answers
        for (const questionDto of createQuizDto.questions) {
          const question = await prisma.quizQuestion.create({
            data: {
              quiz_id: quiz.id,
              prompt: questionDto.prompt,
              points: questionDto.points || 1,
              position: questionDto.position || 0,
            },
          });

          this.logger.log(`Created question with ID: ${question.id}`);

          // Create answers for this question
          for (const answerDto of questionDto.answers) {
            const answer = await prisma.questionAnswer.create({
              data: {
                question_id: question.id,
                option: answerDto.option,
                position: answerDto.position || 0,
                is_correct: answerDto.is_correct || false,
              },
            });

            this.logger.log(`Created answer with ID: ${answer.id}, is_correct: ${answer.is_correct}`);
          }
        }

        return quiz;
      });

      // Schedule publication if needed (outside transaction)
      if (result.publication_status === 'SCHEDULED' && result.scheduled_publish_at) {
        try {
          await this.quizPublishService.scheduleQuizPublication(result.id, result.scheduled_publish_at);
          this.logger.log(`Quiz ${result.id} scheduled for publication at ${result.scheduled_publish_at.toISOString()}`);
        } catch (error) {
          this.logger.error(`Failed to schedule quiz publication for ${result.id}: ${error.message}`, error.stack);
          // Don't throw error here as the quiz was created successfully
        }
      }

      // Fetch the complete quiz with relations
      const quizWithRelations = await this.prisma.quiz.findUnique({
        where: { id: result.id },
      });

      this.logger.log(`Quiz created successfully with ID: ${result.id}`);

      return {
        success: true,
        message: 'Quiz created successfully',
        data: quizWithRelations,
      };
    } catch (error) {
      this.logger.error(`Error creating quiz: ${error.message}`, error.stack);

      if (error instanceof BadRequestException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to create quiz',
        error: error.message,
      };
    }
  }

  /**
   * Get all quizzes with pagination and filtering
   */
  async findAll(page: number = 1, limit: number = 10, search?: string): Promise<QuizResponse<{ quizzes: any[]; pagination: any }>> {
    try {
      this.logger.log('Fetching all quizzes');

      const skip = (page - 1) * limit;

      const where = search ? {
        OR: [
          { title: { contains: search, mode: 'insensitive' as any } },
          { instructions: { contains: search, mode: 'insensitive' as any } },
        ],
      } : {};

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
            due_at: true,
            is_published: true,
            published_at: true,
            created_at: true,
            series: {
              select: {
                id: true,
                title: true,
                slug: true,
              },
            },
            questions: {
              select: {
                id: true,
                prompt: true,
                points: true,
                position: true,
                created_at: true,
                _count: {
                  select: {
                    answers: true,
                  },
                },
              },
              orderBy: { position: 'asc' },
            },
            _count: {
              select: {
                questions: true,
              },
            },
          },
          orderBy: { created_at: 'desc' },
        }),
        this.prisma.quiz.count({ where }),
      ]);

      // Calculate pagination values
      const totalPages = Math.ceil(total / limit);
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;

      return {
        success: true,
        message: 'Quizzes retrieved successfully',
        data: {
          quizzes,
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
      this.logger.error(`Error fetching quizzes: ${error.message}`, error.stack);

      return {
        success: false,
        message: 'Failed to fetch quizzes',
        error: error.message,
      };
    }
  }

  /**
   * Get a single quiz by ID
   */
  async findOne(id: string): Promise<QuizResponse<Quiz>> {
    try {
      this.logger.log(`Fetching quiz with ID: ${id}`);

      const quiz = await this.prisma.quiz.findUnique({
        where: { id },
        include: {
          series: {
            select: {
              id: true,
              title: true,
              slug: true,
            },
          },
          course: {
            select: {
              id: true,
              title: true,
              position: true,
            },
          },
          questions: {
            orderBy: { position: 'asc' },
            include: {
              answers: {
                orderBy: { position: 'asc' },
              },
            },
          },
        },
      });

      if (!quiz) {
        throw new NotFoundException(`Quiz with ID ${id} not found`);
      }

      return {
        success: true,
        message: 'Quiz retrieved successfully',
        data: quiz,
      };
    } catch (error) {
      this.logger.error(`Error fetching quiz ${id}: ${error.message}`, error.stack);

      if (error instanceof NotFoundException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to fetch quiz',
        error: error.message,
      };
    }
  }

  /**
   * Update a quiz by ID
   */
  async update(id: string, updateQuizDto: UpdateQuizDto): Promise<QuizResponse<any>> {
    try {
      this.logger.log(`Updating quiz with ID: ${id}`);

      // Check if quiz exists
      const existingQuiz = await this.prisma.quiz.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!existingQuiz) {
        throw new NotFoundException(`Quiz with ID ${id} not found`);
      }

      // Update quiz and handle questions/answers in a transaction
      const updatedQuiz = await this.prisma.$transaction(async (prisma) => {
        // Prepare update data
        const updateData: any = { ...updateQuizDto };
        if (updateQuizDto.due_at) updateData.due_at = new Date(updateQuizDto.due_at);
        if (updateQuizDto.published_at) updateData.published_at = new Date(updateQuizDto.published_at);

        // Handle publication scheduling
        const now = new Date();
        const publishAt = updateQuizDto.published_at ? new Date(updateQuizDto.published_at) : undefined;
        const shouldPublishImmediately = updateQuizDto.is_published || (publishAt && publishAt <= now);

        let publicationStatus = 'DRAFT';
        let scheduledPublishAt = null;

        if (shouldPublishImmediately) {
          publicationStatus = 'PUBLISHED';
          updateData.published_at = now;
        } else if (publishAt && publishAt > now) {
          publicationStatus = 'SCHEDULED';
          scheduledPublishAt = publishAt;
        } else if (updateQuizDto.published_at === null) {
          // If published_at is explicitly set to null, cancel scheduling
          publicationStatus = 'DRAFT';
          scheduledPublishAt = null;
        }

        updateData.publication_status = publicationStatus;
        updateData.scheduled_publish_at = scheduledPublishAt;
        updateData.is_published = shouldPublishImmediately;

        // Remove questions from updateData as we'll handle them separately
        delete updateData.questions;

        const quiz = await prisma.quiz.update({
          where: { id },
          data: updateData,
        });

        // Handle questions and answers if provided
        if (updateQuizDto.questions && updateQuizDto.questions.length > 0) {
          // Delete existing questions and answers
          await prisma.questionAnswer.deleteMany({
            where: {
              question: {
                quiz_id: id,
              },
            },
          });
          await prisma.quizQuestion.deleteMany({
            where: { quiz_id: id },
          });

          // Create new questions and answers
          for (const questionDto of updateQuizDto.questions) {
            const question = await prisma.quizQuestion.create({
              data: {
                quiz_id: quiz.id,
                prompt: questionDto.prompt,
                points: questionDto.points || 1,
                position: questionDto.position || 0,
              },
            });

            // Create answers for this question
            for (const answerDto of questionDto.answers) {
              await prisma.questionAnswer.create({
                data: {
                  question_id: question.id,
                  option: answerDto.option,
                  position: answerDto.position || 0,
                  is_correct: answerDto.is_correct || false,
                },
              });
            }
          }
        }

        return quiz;
      });

      // Handle queue scheduling after transaction is committed
      if (updatedQuiz.publication_status === 'SCHEDULED' && updatedQuiz.scheduled_publish_at) {
        try {
          await this.quizPublishService.scheduleQuizPublication(id, updatedQuiz.scheduled_publish_at);
          this.logger.log(`Quiz ${id} scheduled for publication at ${updatedQuiz.scheduled_publish_at.toISOString()}`);
        } catch (error) {
          this.logger.error(`Failed to schedule quiz publication for ${id}: ${error.message}`, error.stack);
        }
      } else if (updatedQuiz.publication_status === 'DRAFT' || updatedQuiz.publication_status === 'PUBLISHED') {
        try {
          await this.quizPublishService.cancelScheduledPublication(id);
          this.logger.log(`Cancelled scheduled publication for quiz ${id}`);
        } catch (error) {
          this.logger.error(`Failed to cancel scheduled publication for quiz ${id}: ${error.message}`, error.stack);
        }
      }

      // Fetch the complete updated quiz with relations
      const quizWithRelations = await this.prisma.quiz.findUnique({
        where: { id },
        include: {
          questions: {
            orderBy: { position: 'asc' },
            include: {
              answers: {
                orderBy: { position: 'asc' },
              },
            },
          },
        },
      });

      this.logger.log(`Quiz updated successfully with ID: ${id}`);

      return {
        success: true,
        message: 'Quiz updated successfully',
        data: quizWithRelations,
      };
    } catch (error) {
      this.logger.error(`Error updating quiz ${id}: ${error.message}`, error.stack);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to update quiz',
        error: error.message,
      };
    }
  }

  /**
   * Delete a quiz by ID (soft delete)
   */
  async remove(id: string): Promise<QuizResponse<{ id: string }>> {
    try {
      this.logger.log(`Deleting quiz with ID: ${id}`);

      // Check if quiz exists
      const existingQuiz = await this.prisma.quiz.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!existingQuiz) {
        throw new NotFoundException(`Quiz with ID ${id} not found`);
      }

      // Soft delete the quiz (Prisma middleware will handle this)
      await this.prisma.quiz.delete({
        where: { id },
      });

      this.logger.log(`Quiz deleted successfully with ID: ${id}`);

      return {
        success: true,
        message: 'Quiz deleted successfully',
        data: { id },
      };
    } catch (error) {
      this.logger.error(`Error deleting quiz ${id}: ${error.message}`, error.stack);

      if (error instanceof NotFoundException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to delete quiz',
        error: error.message,
      };
    }
  }


  /**
   * Get quiz publication status
   */
  async getQuizPublicationStatus(id: string): Promise<QuizResponse<any>> {
    try {
      this.logger.log(`Getting publication status for quiz: ${id}`);

      // Check if quiz exists
      const quiz = await this.prisma.quiz.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          publication_status: true,
          scheduled_publish_at: true,
          is_published: true,
          published_at: true,
        },
      });

      if (!quiz) {
        throw new NotFoundException(`Quiz with ID ${id} not found`);
      }

      // Get queue status
      const queueStatus = await this.quizPublishService.getQuizPublicationStatus(id);

      return {
        success: true,
        message: 'Quiz publication status retrieved successfully',
        data: {
          ...quiz,
          queue_status: queueStatus,
        },
      };
    } catch (error) {
      this.logger.error(`Error getting quiz publication status ${id}: ${error.message}`, error.stack);

      if (error instanceof NotFoundException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to get quiz publication status',
        error: error.message,
      };
    }
  }

  /**
   * Cancel scheduled quiz publication
   */
  async cancelScheduledPublication(id: string): Promise<QuizResponse<any>> {
    try {
      this.logger.log(`Cancelling scheduled publication for quiz: ${id}`);

      // Check if quiz exists
      const existingQuiz = await this.prisma.quiz.findUnique({
        where: { id },
        select: { id: true, title: true, publication_status: true },
      });

      if (!existingQuiz) {
        throw new NotFoundException(`Quiz with ID ${id} not found`);
      }

      // Cancel scheduled publication
      await this.quizPublishService.cancelScheduledPublication(id);

      // Update quiz status to DRAFT
      const updatedQuiz = await this.prisma.quiz.update({
        where: { id },
        data: {
          publication_status: 'DRAFT',
          scheduled_publish_at: null,
        },
      });

      this.logger.log(`Cancelled scheduled publication for quiz ${id}`);

      return {
        success: true,
        message: `Scheduled publication cancelled for quiz "${updatedQuiz.title}"`,
        data: updatedQuiz,
      };
    } catch (error) {
      this.logger.error(`Error cancelling scheduled publication for quiz ${id}: ${error.message}`, error.stack);

      if (error instanceof NotFoundException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to cancel scheduled publication',
        error: error.message,
      };
    }
  }
}
