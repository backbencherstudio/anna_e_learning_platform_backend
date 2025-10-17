import { Injectable, Logger, BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import { CreateScheduleEventDto } from "./dto/create-schedule-event.dto";
import { ScheduleStatus, ScheduleType, EnrollmentStatus } from "@prisma/client";
import { NotificationRepository } from "src/common/repository/notification/notification.repository";
import { MessageGateway } from "src/modules/chat/message/message.gateway";

type DateLike = Date | string | undefined;

@Injectable()
export class ScheduleEventService {
    private readonly logger = new Logger(ScheduleEventService.name);

    constructor(private readonly prisma: PrismaService, private readonly messageGateway: MessageGateway) { }

    async create(createScheduleEventDto: CreateScheduleEventDto) {
        try {
            this.logger.log("Creating schedule event");

            let userIds: string[] = [];

            // Determine user_id based on event type
            if (createScheduleEventDto.user_id) {
                // Specific user provided - validate user
                this.logger.log(`Creating event for specific user: ${createScheduleEventDto.user_id}`);

                const user = await this.prisma.user.findUnique({
                    where: {
                        id: createScheduleEventDto.user_id,
                        type: 'student' // Only students
                    },
                    select: { id: true }
                });

                if (!user) {
                    throw new BadRequestException("User ID is invalid or not a student");
                }

                userIds = [createScheduleEventDto.user_id];
                this.logger.log(`Validated user for event`);
            } else {
                // No specific user provided - send to ALL students
                this.logger.log(`Creating event for ALL students`);

                const allStudents = await this.prisma.user.findMany({
                    where: {
                        type: 'student',
                        deleted_at: null
                    },
                    select: { id: true }
                });

                if (allStudents.length === 0) {
                    throw new BadRequestException("No students found in the system");
                }

                userIds = allStudents.map(user => user.id);
                this.logger.log(`Found ${userIds.length} students for event`);
            }

            // Validate optional relations exist if provided
            if (createScheduleEventDto.assignment_id) {
                const assignment = await this.prisma.assignment.findUnique({
                    where: { id: createScheduleEventDto.assignment_id }
                });
                if (!assignment) {
                    throw new BadRequestException("Assignment not found");
                }
            }

            if (createScheduleEventDto.quiz_id) {
                const quiz = await this.prisma.quiz.findUnique({
                    where: { id: createScheduleEventDto.quiz_id }
                });
                if (!quiz) {
                    throw new BadRequestException("Quiz not found");
                }
            }

            if (createScheduleEventDto.course_id) {
                const course = await this.prisma.course.findUnique({
                    where: { id: createScheduleEventDto.course_id }
                });
                if (!course) {
                    throw new BadRequestException("Course not found");
                }
            }

            // Validate series_id if provided (optional)
            if (createScheduleEventDto.series_id) {
                const series = await this.prisma.series.findUnique({
                    where: { id: createScheduleEventDto.series_id }
                });
                if (!series) {
                    throw new BadRequestException("Series not found");
                }
                this.logger.log(`Validated series: ${series.title}`);
            }

            // Create schedule events for each user (since schema now uses single user_id)
            const events = [];

            for (const userId of userIds) {
                const event = await this.prisma.scheduleEvent.create({
                    data: {
                        title: createScheduleEventDto.title,
                        description: createScheduleEventDto.description,
                        class_link: createScheduleEventDto.class_link,
                        start_at: new Date(createScheduleEventDto.start_at),
                        end_at: new Date(createScheduleEventDto.end_at),
                        timezone: createScheduleEventDto.timezone,
                        status: createScheduleEventDto.status || ScheduleStatus.SCHEDULED,
                        type: createScheduleEventDto.type || ScheduleType.GENERAL,
                        metadata: createScheduleEventDto.metadata,
                        user_id: userId, // Single user_id per event
                        assignment_id: createScheduleEventDto.assignment_id,
                        quiz_id: createScheduleEventDto.quiz_id,
                        course_id: createScheduleEventDto.course_id,
                        series_id: createScheduleEventDto.series_id,
                    },
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                            }
                        },
                    }
                });
                events.push(event);
            }

            this.logger.log(`Created ${events.length} schedule events for ${userIds.length} users`);

            const notificationPromises = userIds.map((userId, index) =>
                NotificationRepository.createNotification({
                    receiver_id: userId,
                    text: `New "${events[index].title}" has been scheduled`,
                    type: 'event',
                    entity_id: events[index].id,
                })
            );

            await Promise.all(notificationPromises);

            // Send real-time notifications to all users
            userIds.forEach((userId, index) => {
                this.messageGateway.server.emit('notification', {
                    receiver_id: userId,
                    text: `New "${events[index].title}" has been scheduled`,
                    type: 'event',
                    entity_id: events[index].id,
                });
            });

            return {
                success: true,
                message: `Schedule events created successfully for ${events.length} users`,
                data: {
                    events,
                    total_events: events.length,
                    total_users: userIds.length,
                },
            };
        } catch (error) {
            this.logger.error(`Error creating schedule event: ${error.message}`, error.stack);

            if (error instanceof BadRequestException) {
                throw error;
            }

            return {
                success: false,
                message: "Failed to create schedule event",
                error: error.message,
            };
        }
    }

    async listScheduleEvents(
        date?: DateLike,
        page: number = 1,
        limit: number = 10,
        type?: string,
        status?: string,
        seriesId?: string,
    ) {
        try {
            // base where for admin: list all scheduled events, optionally filter by date
            const where: any = {
                deleted_at: null,
                status: status ? status : { in: ["SCHEDULED"] as any },
            };

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

            // Add series filter
            if (seriesId) {
                where.series_id = seriesId;
            }

            // Get all events first to group them
            const allEvents = await this.prisma.scheduleEvent.findMany({
                where,
                orderBy: { start_at: "asc" },
                include: {
                    user: {
                        select: {
                            id: true,
                            username: true,
                            email: true,
                            first_name: true,
                            last_name: true,
                        }
                    },
                    assignment: { select: { id: true, title: true } },
                    quiz: { select: { id: true, title: true } },
                    course: { select: { id: true, title: true } },
                    series: { select: { id: true, title: true } },
                },
            });

            // Group events by unique combination of title, start_at, end_at, and other key fields
            const groupedEvents = new Map();

            allEvents.forEach(event => {
                // Create a unique key based on event details (excluding user_id)
                const key = `${event.title}-${event.start_at.toISOString()}-${event.end_at.toISOString()}-${event.type}-${event.assignment_id || 'null'}-${event.quiz_id || 'null'}-${event.course_id || 'null'}-${event.series_id || 'null'}`;

                if (!groupedEvents.has(key)) {
                    // Create a representative event (use the first one found)
                    const representativeEvent = {
                        ...event,
                        // Remove user-specific data from the main event
                        user: null,
                        user_id: null,
                        // Add student count and list
                        student_count: 0,
                        students: []
                    };
                    groupedEvents.set(key, representativeEvent);
                }

                // Add user to the students list and increment count
                const groupedEvent = groupedEvents.get(key);
                if (event.user) {
                    groupedEvent.students.push(event.user);
                    groupedEvent.student_count++;
                }
            });

            // Convert map to array and apply pagination
            const uniqueEvents = Array.from(groupedEvents.values());
            const total = uniqueEvents.length;
            const skip = (page - 1) * limit;
            const paginatedEvents = uniqueEvents.slice(skip, skip + limit);

            const totalPages = Math.ceil(total / limit);
            const hasNextPage = page < totalPages;
            const hasPreviousPage = page > 1;

            return {
                success: true,
                message: "Schedule events fetched",
                data: {
                    events: paginatedEvents,
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
            return { success: false, message: "Failed to fetch schedule events", error: error.message };
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

    async remove(id: string) {
        try {
            const event = await this.prisma.scheduleEvent.findUnique({ where: { id, deleted_at: null } });
            if (!event) throw new NotFoundException('Schedule event not found');
            await this.prisma.scheduleEvent.delete({ where: { id } });
            return { success: true, message: 'Schedule event deleted successfully', data: { id } };
        } catch (error) {
            this.logger.error(`Failed to delete schedule event: ${error.message}`, error.stack);
            return { success: false, message: 'Failed to delete schedule event', error: error.message };
        }
    }
}
