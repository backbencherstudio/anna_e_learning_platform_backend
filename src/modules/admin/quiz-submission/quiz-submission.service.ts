import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { SojebStorage } from 'src/common/lib/Disk/SojebStorage';
import appConfig from 'src/config/app.config';

@Injectable()
export class QuizSubmissionService {
    private readonly logger = new Logger(QuizSubmissionService.name);

    constructor(private readonly prisma: PrismaService) { }

    async findAll(
        page: number = 1,
        limit: number = 10,
        search?: string,
        quiz_id?: string,
        student_id?: string,
        status?: string,
        series_id?: string,
        course_id?: string,
    ) {
        try {
            const skip = (page - 1) * limit;

            const where: any = {
                deleted_at: null,
            };

            if (quiz_id) where.quiz_id = quiz_id;
            if (student_id) where.student_id = student_id;
            if (status) where.status = status;
            if (series_id) {
                where.quiz = {
                    ...(where.assignment || {}),
                    series_id: series_id,
                };
            }

            if (course_id) {
                where.quiz = {
                    ...(where.assignment || {}),
                    course_id: course_id,
                };
            }
            if (search) {
                where.OR = [
                    { student: { name: { contains: search, mode: 'insensitive' as any } } },
                    { student: { email: { contains: search, mode: 'insensitive' as any } } },
                    { quiz: { title: { contains: search, mode: 'insensitive' as any } } },
                ];
            }

            const [submissions, total] = await Promise.all([
                this.prisma.quizSubmission.findMany({
                    where,
                    skip,
                    take: limit,
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
                        quiz: {
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
                        _count: {
                            select: {
                                answers: true,
                            },
                        },
                    },
                    orderBy: { created_at: 'desc' },
                }),
                this.prisma.quizSubmission.count({ where }),
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

    async findOne(id: string) {
        try {
            const submission = await this.prisma.quizSubmission.findUnique({
                where: { id },
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
                    metadata: true,
                    created_at: true,
                    quiz: {
                        select: {
                            id: true,
                            title: true,
                            instructions: true,
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
                    answers: {
                        select: {
                            id: true,
                            question_id: true,
                            answer_id: true,
                            answer_text: true,
                            is_correct: true,
                            points_earned: true,
                            feedback: true,
                            question: {
                                select: {
                                    id: true,
                                    prompt: true,
                                    points: true,
                                    position: true,
                                    answers: {
                                        select: {
                                            id: true,
                                            option: true,
                                            is_correct: true,
                                        },
                                    },
                                },
                            },
                        },
                        orderBy: { id: 'asc' },
                    },
                },
            });

            if (!submission) {
                throw new NotFoundException(`Quiz submission with ID ${id} not found`);
            }

            // add avatar url to student
            if (submission.student.avatar) {
                submission.student['avatar_url'] = SojebStorage.url(
                    appConfig().storageUrl.avatar + submission.student.avatar,
                );
            }

            return {
                success: true,
                message: 'Quiz submission retrieved successfully',
                data: submission,
            };
        } catch (error) {
            this.logger.error(`Error fetching quiz submission ${id}: ${error.message}`, error.stack);

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
}
