import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

type DateLike = Date | string | undefined;

@Injectable()
export class ScheduleEventService {
    private readonly logger = new Logger(ScheduleEventService.name);

    constructor(private readonly prisma: PrismaService) { }

    async listScheduleEvents(
        date?: DateLike,
    ) {
        try {
            // base where for admin: list all scheduled events, optionally filter by date
            const where: any = {
                deleted_at: null,
                status: { in: ['SCHEDULED'] as any },
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
