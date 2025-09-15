import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateQuizSubmissionDto, SubmitQuizDto } from './dto/create-quiz-submission.dto';
import { UpdateQuizSubmissionDto } from './dto/update-quiz-submission.dto';
import { QuizResponse } from './interfaces/quiz-response.interface';
import { QuizSubmission, QuizAttemptStatus } from '@prisma/client';

@Injectable()
export class QuizSubmissionService {
    private readonly logger = new Logger(QuizSubmissionService.name);

    constructor(private readonly prisma: PrismaService) { }

    /**
     * Start a new quiz attempt
     */
    async startQuiz(createQuizSubmissionDto: CreateQuizSubmissionDto, userId: string): Promise<QuizResponse<QuizSubmission>> {
        try {
            this.logger.log(`Starting quiz attempt for user ${userId}, quiz ${createQuizSubmissionDto.quiz_id}`);

            // Check if quiz exists and is published
            const quiz = await this.prisma.quiz.findUnique({
                where: { id: createQuizSubmissionDto.quiz_id },
                include: {
                    questions: {
                        include: {
                            answers: true,
                        },
                    },
                },
            });

            if (!quiz) {
                throw new NotFoundException('Quiz not found');
            }

            if (!quiz.is_published) {
                throw new BadRequestException('Quiz is not published');
            }

            // Check if user already has a submission for this quiz
            const existingSubmission = await this.prisma.quizSubmission.findUnique({
                where: {
                    quiz_id_user_id: {
                        quiz_id: createQuizSubmissionDto.quiz_id,
                        user_id: userId,
                    },
                },
            });

            if (existingSubmission && existingSubmission.status !== 'IN_PROGRESS') {
                throw new BadRequestException('You have already submitted this quiz');
            }

            // Calculate total marks
            const totalMarks = quiz.questions.reduce((sum, question) => sum + question.points, 0);

            let submission: QuizSubmission;

            if (existingSubmission) {
                // Update existing submission
                submission = await this.prisma.quizSubmission.update({
                    where: { id: existingSubmission.id },
                    data: {
                        started_at: new Date(),
                        total_marks: totalMarks,
                        metadata: createQuizSubmissionDto.metadata,
                    },
                });
            } else {
                // Create new submission
                submission = await this.prisma.quizSubmission.create({
                    data: {
                        quiz_id: createQuizSubmissionDto.quiz_id,
                        user_id: userId,
                        status: 'IN_PROGRESS',
                        total_marks: totalMarks,
                        started_at: new Date(),
                        metadata: createQuizSubmissionDto.metadata,
                    },
                });
            }

            this.logger.log(`Quiz submission created/updated with ID: ${submission.id}`);

            return {
                success: true,
                message: 'Quiz attempt started successfully',
                data: submission,
            };
        } catch (error) {
            this.logger.error(`Error starting quiz attempt: ${error.message}`, error.stack);

            if (error instanceof BadRequestException || error instanceof NotFoundException) {
                throw error;
            }

            return {
                success: false,
                message: 'Failed to start quiz attempt',
                error: error.message,
            };
        }
    }

    /**
     * Save quiz answers (during the quiz)
     */
    async saveAnswers(submissionId: string, answers: any[], userId: string): Promise<QuizResponse<QuizSubmission>> {
        try {
            this.logger.log(`Saving answers for submission ${submissionId}`);

            // Verify submission belongs to user and is in progress
            const submission = await this.prisma.quizSubmission.findFirst({
                where: {
                    id: submissionId,
                    user_id: userId,
                    status: 'IN_PROGRESS',
                },
                include: {
                    quiz: {
                        include: {
                            questions: {
                                include: {
                                    answers: true,
                                },
                            },
                        },
                    },
                },
            });

            if (!submission) {
                throw new NotFoundException('Submission not found or not in progress');
            }

            // Save answers in a transaction
            await this.prisma.$transaction(async (prisma) => {
                // Delete existing answers for this submission
                await prisma.quizSubmissionAnswer.deleteMany({
                    where: { submission_id: submissionId },
                });

                // Create new answers
                for (const answer of answers) {
                    const question = submission.quiz.questions.find(q => q.id === answer.question_id);
                    if (!question) continue;

                    let isCorrect = false;
                    let pointsEarned = 0;
                    let selectedAnswer = null;

                    if (answer.answer_id) {
                        // Multiple choice answer
                        selectedAnswer = question.answers.find(a => a.id === answer.answer_id);
                        if (selectedAnswer) {
                            isCorrect = selectedAnswer.is_correct;
                            pointsEarned = isCorrect ? question.points : 0;
                        }
                    }

                    await prisma.quizSubmissionAnswer.create({
                        data: {
                            submission_id: submissionId,
                            question_id: answer.question_id,
                            answer_id: answer.answer_id,
                            answer_text: answer.answer_text,
                            is_correct: isCorrect,
                            points_earned: pointsEarned,
                            feedback: answer.feedback,
                        },
                    });
                }
            });

            // Get updated submission
            const updatedSubmission = await this.prisma.quizSubmission.findUnique({
                where: { id: submissionId },
            });

            return {
                success: true,
                message: 'Answers saved successfully',
                data: updatedSubmission,
            };
        } catch (error) {
            this.logger.error(`Error saving answers: ${error.message}`, error.stack);

            if (error instanceof NotFoundException || error instanceof BadRequestException) {
                throw error;
            }

            return {
                success: false,
                message: 'Failed to save answers',
                error: error.message,
            };
        }
    }

    /**
     * Submit quiz (final submission)
     */
    async submitQuiz(submitQuizDto: SubmitQuizDto, userId: string): Promise<QuizResponse<QuizSubmission>> {
        try {
            this.logger.log(`Submitting quiz ${submitQuizDto.submission_id}`);

            // Get submission with answers
            const submission = await this.prisma.quizSubmission.findFirst({
                where: {
                    id: submitQuizDto.submission_id,
                    user_id: userId,
                    status: 'IN_PROGRESS',
                },
                include: {
                    answers: true,
                    quiz: true,
                },
            });

            if (!submission) {
                throw new NotFoundException('Submission not found or not in progress');
            }

            // Calculate final score
            const totalScore = submission.answers.reduce((sum, answer) => sum + answer.points_earned, 0);
            const percentage = submission.total_marks > 0 ? (totalScore / submission.total_marks) * 100 : 0;

            // Update submission
            const updatedSubmission = await this.prisma.quizSubmission.update({
                where: { id: submitQuizDto.submission_id },
                data: {
                    status: 'SUBMITTED',
                    score: totalScore,
                    percentage: percentage,
                    submitted_at: new Date(),
                    time_taken: submitQuizDto.time_taken,
                },
            });

            this.logger.log(`Quiz submitted successfully. Score: ${totalScore}/${submission.total_marks} (${percentage.toFixed(2)}%)`);

            return {
                success: true,
                message: 'Quiz submitted successfully',
                data: updatedSubmission,
            };
        } catch (error) {
            this.logger.error(`Error submitting quiz: ${error.message}`, error.stack);

            if (error instanceof NotFoundException || error instanceof BadRequestException) {
                throw error;
            }

            return {
                success: false,
                message: 'Failed to submit quiz',
                error: error.message,
            };
        }
    }

    /**
     * Get quiz submission by ID
     */
    async findOne(id: string, userId?: string): Promise<QuizResponse<QuizSubmission>> {
        try {
            this.logger.log(`Fetching quiz submission ${id}`);

            const whereClause: any = { id };
            if (userId) {
                whereClause.user_id = userId;
            }

            const submission = await this.prisma.quizSubmission.findFirst({
                where: whereClause,
                include: {
                    quiz: {
                        include: {
                            questions: {
                                include: {
                                    answers: true,
                                },
                            },
                        },
                    },
                    answers: {
                        include: {
                            question: true,
                            answer: true,
                        },
                    },
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                },
            });

            if (!submission) {
                throw new NotFoundException('Quiz submission not found');
            }

            return {
                success: true,
                message: 'Quiz submission retrieved successfully',
                data: submission,
            };
        } catch (error) {
            this.logger.error(`Error fetching quiz submission: ${error.message}`, error.stack);

            if (error instanceof NotFoundException) {
                throw error;
            }

            return {
                success: false,
                message: 'Failed to fetch quiz submission',
                error: error.message,
            };
        }
    }

    /**
     * Get all quiz submissions with filtering
     */
    async findAll(
        page: number = 1,
        limit: number = 10,
        filters?: {
            quiz_id?: string;
            user_id?: string;
            status?: QuizAttemptStatus;
            search?: string;
        }
    ): Promise<QuizResponse<{ submissions: any[]; pagination: any }>> {
        try {
            this.logger.log('Fetching quiz submissions');

            const skip = (page - 1) * limit;
            const where: any = {};

            if (filters?.quiz_id) where.quiz_id = filters.quiz_id;
            if (filters?.user_id) where.user_id = filters.user_id;
            if (filters?.status) where.status = filters.status;

            if (filters?.search) {
                where.OR = [
                    {
                        user: {
                            name: { contains: filters.search, mode: 'insensitive' },
                        },
                    },
                    {
                        quiz: {
                            title: { contains: filters.search, mode: 'insensitive' },
                        },
                    },
                ];
            }

            const [submissions, total] = await Promise.all([
                this.prisma.quizSubmission.findMany({
                    where,
                    skip,
                    take: limit,
                    include: {
                        quiz: {
                            select: {
                                id: true,
                                title: true,
                                total_marks: true,
                            },
                        },
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                            },
                        },
                        _count: {
                            select: {
                                answers: true,
                            },
                        },
                    },
                    orderBy: { submitted_at: 'desc' },
                }),
                this.prisma.quizSubmission.count({ where }),
            ]);

            const totalPages = Math.ceil(total / limit);
            const hasNextPage = page < totalPages;
            const hasPreviousPage = page > 1;

            return {
                success: true,
                message: 'Quiz submissions retrieved successfully',
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
            this.logger.error(`Error fetching quiz submissions: ${error.message}`, error.stack);
            return {
                success: false,
                message: 'Failed to fetch quiz submissions',
                error: error.message,
            };
        }
    }

    /**
     * Grade a quiz submission (admin only)
     */
    async gradeSubmission(
        submissionId: string,
        gradingData: {
            feedback?: string;
            manual_adjustments?: { answer_id: string; points: number }[];
        }
    ): Promise<QuizResponse<QuizSubmission>> {
        try {
            this.logger.log(`Grading submission ${submissionId}`);

            const submission = await this.prisma.quizSubmission.findUnique({
                where: { id: submissionId },
                include: {
                    answers: true,
                },
            });

            if (!submission) {
                throw new NotFoundException('Quiz submission not found');
            }

            if (submission.status !== 'SUBMITTED') {
                throw new BadRequestException('Can only grade submitted quizzes');
            }

            let totalScore = submission.score;

            // Apply manual adjustments if provided
            if (gradingData.manual_adjustments) {
                await this.prisma.$transaction(async (prisma) => {
                    for (const adjustment of gradingData.manual_adjustments) {
                        await prisma.quizSubmissionAnswer.update({
                            where: { id: adjustment.answer_id },
                            data: { points_earned: adjustment.points },
                        });
                    }

                    // Recalculate total score
                    const updatedAnswers = await prisma.quizSubmissionAnswer.findMany({
                        where: { submission_id: submissionId },
                    });
                    totalScore = updatedAnswers.reduce((sum, answer) => sum + answer.points_earned, 0);
                });
            }

            const percentage = submission.total_marks > 0 ? (totalScore / submission.total_marks) * 100 : 0;

            const updatedSubmission = await this.prisma.quizSubmission.update({
                where: { id: submissionId },
                data: {
                    status: 'GRADED',
                    score: totalScore,
                    percentage: percentage,
                    graded_at: new Date(),
                    feedback: gradingData.feedback,
                },
            });

            return {
                success: true,
                message: 'Quiz submission graded successfully',
                data: updatedSubmission,
            };
        } catch (error) {
            this.logger.error(`Error grading submission: ${error.message}`, error.stack);

            if (error instanceof NotFoundException || error instanceof BadRequestException) {
                throw error;
            }

            return {
                success: false,
                message: 'Failed to grade submission',
                error: error.message,
            };
        }
    }
}
