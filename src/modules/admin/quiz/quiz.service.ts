import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { UpdateQuizDto } from './dto/update-quiz.dto';
import { QuizResponse } from './interfaces/quiz-response.interface';
import { Quiz, QuizQuestion, QuestionAnswer } from '@prisma/client';

@Injectable()
export class QuizService {
  private readonly logger = new Logger(QuizService.name);

  constructor(private readonly prisma: PrismaService) { }

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
        // Create the quiz
        const quiz = await prisma.quiz.create({
          data: {
            title: createQuizDto.title,
            instructions: createQuizDto.instructions,
            total_marks: totalMarks,
            due_at: createQuizDto.due_at ? new Date(createQuizDto.due_at) : undefined,
            is_published: createQuizDto.is_published || false,
            published_at: createQuizDto.published_at ? new Date(createQuizDto.published_at) : undefined,
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
            updated_at: true,
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
}
