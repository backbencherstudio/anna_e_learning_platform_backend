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

            // Determine user_ids based on event type
            if (createScheduleEventDto.series_id && (!createScheduleEventDto.user_ids || createScheduleEventDto.user_ids.length === 0)) {
                // Combined event - get all users enrolled in the series
                this.logger.log(`Creating combined event for series: ${createScheduleEventDto.series_id}`);

                const enrolledUsers = await this.prisma.user.findMany({
                    where: {
                        enrollments: {
                            some: {
                                series_id: createScheduleEventDto.series_id,
                                status: EnrollmentStatus.ACTIVE
                            }
                        }
                    },
                    select: { id: true }
                });

                if (enrolledUsers.length === 0) {
                    throw new BadRequestException("No active users found for the specified series");
                }

                userIds = enrolledUsers.map(user => user.id);
                this.logger.log(`Found ${userIds.length} enrolled users for series`);
            } else if (createScheduleEventDto.user_ids && createScheduleEventDto.user_ids.length === 1) {
                // Individual event - validate single user
                this.logger.log(`Creating individual event for user: ${createScheduleEventDto.user_ids[0]}`);

                const user = await this.prisma.user.findUnique({
                    where: { id: createScheduleEventDto.user_ids[0] },
                    select: { id: true }
                });

                if (!user) {
                    throw new BadRequestException("Invalid user ID");
                }

                userIds = createScheduleEventDto.user_ids;
            } else if (createScheduleEventDto.user_ids && createScheduleEventDto.user_ids.length > 1) {
                // Multiple users provided - validate all
                this.logger.log(`Creating event for ${createScheduleEventDto.user_ids.length} specified users`);

                const users = await this.prisma.user.findMany({
                    where: { id: { in: createScheduleEventDto.user_ids } },
                    select: { id: true }
                });

                if (users.length !== createScheduleEventDto.user_ids.length) {
                    throw new BadRequestException("One or more user IDs are invalid");
                }

                userIds = createScheduleEventDto.user_ids;
            } else {
                throw new BadRequestException("Either user_ids or series_id must be provided");
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

            if (createScheduleEventDto.series_id) {
                const series = await this.prisma.series.findUnique({
                    where: { id: createScheduleEventDto.series_id }
                });
                if (!series) {
                    throw new BadRequestException("Series not found");
                }
            }

            // Create the schedule event
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
                    user_ids: userIds, // Use the processed userIds
                    assignment_id: createScheduleEventDto.assignment_id,
                    quiz_id: createScheduleEventDto.quiz_id,
                    course_id: createScheduleEventDto.course_id,
                    series_id: createScheduleEventDto.series_id,
                },
                include: {
                    users: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        }
                    },
                }
            });

            this.logger.log(`Schedule event created with ID: ${event.id}`);

            const notificationPromises = userIds.map(userId =>
                NotificationRepository.createNotification({
                    receiver_id: userId,
                    text: `New "${event.title}" has been scheduled`,
                    type: 'event',
                    entity_id: event.id,
                })
            );


            await Promise.all(notificationPromises);

            // Send real-time notifications to all enrolled students
            userIds.forEach(userId => {
                this.messageGateway.server.emit('notification', {
                    receiver_id: userId,
                    text: `New "${event.title}" has been scheduled`,
                    type: 'event',
                    entity_id: event.id,
                });
            });

            return {
                success: true,
                message: "Schedule event created successfully",
                data: event,
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

            const skip = (page - 1) * limit;

            const [events, total] = await Promise.all([
                this.prisma.scheduleEvent.findMany({
                    where,
                    orderBy: { start_at: "asc" },
                    skip,
                    take: limit,
                    include: {
                        users: {
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
                }),
                this.prisma.scheduleEvent.count({ where }),
            ]);

            const totalPages = Math.ceil(total / limit);
            const hasNextPage = page < totalPages;
            const hasPreviousPage = page > 1;

            return {
                success: true,
                message: "Schedule events fetched",
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
            return { success: false, message: "Failed to fetch schedule events", error: error.message };
        }
    }
}
