import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

type DateLike = Date | string | undefined;

@Injectable()
export class ScheduleEventService {
    private readonly logger = new Logger(ScheduleEventService.name);

    constructor(private readonly prisma: PrismaService) { }

    async listForEnrolledSeries(
        studentId: string,
        date?: DateLike,
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
                status: 'SCHEDULED', // Only show scheduled events
                OR: [
                    { user_id: studentId }, // Events directly assigned to the student
                    seriesIds.length ? { series_id: { in: seriesIds } } : undefined,
                    courseIds.length ? { course_id: { in: courseIds } } : undefined,
                    assignmentIds.length ? { assignment_id: { in: assignmentIds } } : undefined,
                    quizIds.length ? { quiz_id: { in: quizIds } } : undefined,
                ].filter(Boolean),
            };

            if (date) {
                const startOfDay = new Date(new Date(date as any).setHours(0, 0, 0, 0));
                const endOfDay = new Date(new Date(date as any).setHours(23, 59, 59, 999));
                where.AND = [
                    { start_at: { gte: startOfDay } },
                    { start_at: { lte: endOfDay } },
                ];
            }

            const events = await this.prisma.scheduleEvent.findMany({
                where,
                orderBy: { start_at: 'asc' },
                include: {
                    assignment: { select: { id: true, title: true } },
                    quiz: { select: { id: true, title: true } },
                    course: { select: { id: true, title: true } },
                    series: { select: { id: true, title: true } },
                },
            });

            return {
                success: true,
                message: 'Schedule events fetched',
                data: { events },
            };
        } catch (error) {
            this.logger.error(`Failed to list schedule events: ${error.message}`, error.stack);
            return { success: false, message: 'Failed to fetch schedule events', error: error.message };
        }
    }
}
