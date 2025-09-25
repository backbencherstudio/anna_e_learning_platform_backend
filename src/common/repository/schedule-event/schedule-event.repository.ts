import { PrismaClient, ScheduleStatus, ScheduleType } from '@prisma/client';

const prisma = new PrismaClient();

export class ScheduleEventRepository {
    // Create an event
    static async createEvent({
        user_id,
        title,
        start_at,
        end_at,
        type = ScheduleType.GENERAL,
        status = ScheduleStatus.SCHEDULED,
        description,
        timezone,
        metadata,
        series_id,
        course_id,
        assignment_id,
        quiz_id,
    }: {
        user_id?: string;
        title: string;
        start_at: Date | string;
        end_at: Date | string;
        type?: ScheduleType;
        status?: ScheduleStatus;
        description?: string;
        timezone?: string;
        metadata?: any;
        series_id?: string;
        course_id?: string;
        assignment_id?: string;
        quiz_id?: string;
    }) {
        const data: any = {
        };
        if (user_id) data.user_id = user_id;
        if (title) data.title = title;
        if (description) data.description = description;
        if (type) data.type = type;
        if (timezone) data.timezone = timezone;
        if (metadata !== undefined) data.metadata = metadata;
        if (series_id) data.series_id = series_id;
        if (course_id) data.course_id = course_id;
        if (assignment_id) data.assignment_id = assignment_id;
        if (quiz_id) data.quiz_id = quiz_id;
        if (status) data.status = status;
        if (start_at) data.start_at= start_at;
        if (end_at) data.end_at = end_at;

        return prisma.scheduleEvent.create({ data });
    }

    // Update an event
    static async updateEvent(
        id: string,
        payload: Partial<{
            title: string;
            description: string;
            start_at: Date | string;
            end_at: Date | string;
            timezone: string;
            status: ScheduleStatus;
            type: ScheduleType;
            metadata: any;
            series_id: string | null;
            course_id: string | null;
            assignment_id: string | null;
            quiz_id: string | null;
        }>,
    ) {
        const data: any = { ...payload };
        if (payload.start_at) data.start_at = new Date(payload.start_at);
        if (payload.end_at) data.end_at = new Date(payload.end_at);
        return prisma.scheduleEvent.update({
            where: { id },
            data,
        });
    }

    // Delete an event (hard delete)
    static async deleteEvent(id: string) {
        return prisma.scheduleEvent.delete({ where: { id } });
    }
}