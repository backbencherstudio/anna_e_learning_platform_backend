import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

type DateLike = Date | string | undefined;

@Injectable()
export class ScheduleEventService {
    private readonly logger = new Logger(ScheduleEventService.name);

    constructor(private readonly prisma: PrismaService) { }

    async listForEnrolledSeries(
        studentId: string,
        date?: DateLike,
        page: number = 1,
        limit: number = 10,
        type?: string,
        status?: string,
        seriesId?: string,
    ) {
        try {
            // get student's active/completed enrollments
            const enrollments = await this.prisma.enrollment.findMany({
                where: {
                    user_id: studentId,
                    deleted_at: null,
                    status: { in: ['ACTIVE', 'COMPLETED'] as any },
                },
                select: { series_id: true },
            });

            const seriesIds = enrollments.map((e) => e.series_id).filter(Boolean) as string[];

            if (seriesIds.length === 0) {
                return {
                    success: true,
                    message: 'No enrolled series found',
                    data: { events: [] },
                };
            }

            // collect assignment, quiz, and course ids under those series
            const [assignments, quizzes, courses] = await Promise.all([
                this.prisma.assignment.findMany({
                    where: { series_id: { in: seriesIds } },
                    select: { id: true, title: true },
                }),
                this.prisma.quiz.findMany({
                    where: { series_id: { in: seriesIds } },
                    select: { id: true, title: true },
                }),
                this.prisma.course.findMany({
                    where: { series_id: { in: seriesIds } },
                    select: { id: true, title: true },
                }),
            ]);

            const assignmentIds = assignments.map((a) => a.id);
            const quizIds = quizzes.map((q) => q.id);
            const courseIds = courses.map((c) => c.id);

            const where: any = {
                deleted_at: null,
                status: status || 'SCHEDULED', // Filter by status or default to scheduled
                OR: [
                    { user_id: studentId }, // Events directly assigned to the student
                    seriesIds.length ? { series_id: { in: seriesIds } } : undefined,
                    courseIds.length ? { course_id: { in: courseIds } } : undefined,
                    assignmentIds.length ? { assignment_id: { in: assignmentIds } } : undefined,
                    quizIds.length ? { quiz_id: { in: quizIds } } : undefined,
                ].filter(Boolean),
            };

            // Add date filter
            if (date) {
                const startOfDay = new Date(new Date(date as any).setHours(0, 0, 0, 0));
                const endOfDay = new Date(new Date(date as any).setHours(23, 59, 59, 999));
                where.AND = [
                    { start_at: { gte: startOfDay } },
                    { start_at: { lte: endOfDay } },
                ];
            }

            // Add type filter
            if (type) {
                where.type = type;
            }

            // Add series filter (if student wants to filter by specific series)
            if (seriesId) {
                where.series_id = seriesId;
            }

            const skip = (page - 1) * limit;

            const [events, total] = await Promise.all([
                this.prisma.scheduleEvent.findMany({
                    where,
                    orderBy: { start_at: 'asc' },
                    skip,
                    take: limit,
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                            }
                        },
                        assignment: { select: { id: true, title: true } },
                        quiz: { select: { id: true, title: true } },
                        course: { select: { id: true, title: true } },
                        series: { select: { id: true, title: true } },
                    },
                }),
                this.prisma.scheduleEvent.count({ where }),
            ]);

            const totalPages = Math.ceil(total / limit);
            const hasNextPage = page < totalPages;
            const hasPreviousPage = page > 1;

            return {
                success: true,
                message: 'Schedule events fetched',
                data: {
                    events,
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
            this.logger.error(`Failed to list schedule events: ${error.message}`, error.stack);
            return { success: false, message: 'Failed to fetch schedule events', error: error.message };
        }
    }


    async getSingleScheduleEvent(id: string) {
        try {
            const event = await this.prisma.scheduleEvent.findFirst({ where: { id, deleted_at: null } });
            if (!event) throw new NotFoundException('Schedule event not found');
            return { success: true, message: 'Schedule event retrieved successfully', data: event };
        } catch (error) {
            this.logger.error(`Failed to get single schedule event: ${error.message}`, error.stack);
            return { success: false, message: 'Failed to fetch schedule event', error: error.message };
        }
    }
}
