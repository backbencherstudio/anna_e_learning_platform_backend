import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { SeriesResponse } from '../interfaces/series-response.interface';
import { CourseProgressData } from '../types/video-progress.types';
import { COURSE_STATUS, ERROR_MESSAGES, SUCCESS_MESSAGES } from '../constants/video-progress.constants';

@Injectable()
export class CourseProgressService {
    private readonly logger = new Logger(CourseProgressService.name);

    constructor(private readonly prisma: PrismaService) { }

    /**
     * Update course progress based on completed lessons
     */
    async updateCourseProgress(userId: string, courseId: string, seriesId: string): Promise<void> {
        try {
            this.logger.log(`Updating course progress for user ${userId} in course ${courseId}`);

            // Get all lessons in the course
            const totalLessons = await this.getTotalLessonsInCourse(courseId);
            if (totalLessons === 0) {
                this.logger.warn(`No lessons found for course ${courseId}`);
                return;
            }

            // Get completed lessons for this user in this course
            const completedLessons = await this.getCompletedLessonsCount(userId, courseId);

            // Calculate completion percentage
            const completionPercentage = Math.round((completedLessons / totalLessons) * 100);
            const isCourseCompleted = completionPercentage === 100;

             // If course is completed, unlock end video and start next course
             if (isCourseCompleted) {
                await this.handleCourseCompletion(userId, courseId, seriesId);
            }

            // Update course progress
            await this.updateCourseProgressRecord(userId, courseId, seriesId, completionPercentage, isCourseCompleted);

            this.logger.log(`Updated course progress: ${completedLessons}/${totalLessons} lessons completed (${completionPercentage}%) - Course ${isCourseCompleted ? 'COMPLETED' : 'IN PROGRESS'}`);

        } catch (error) {
            this.logger.error(`Error updating course progress: ${error.message}`);
        }
    }

    /**
     * Update course progress status only
     */
    async updateCourseProgressStatus(userId: string, courseId: string, seriesId: string, status: string): Promise<void> {
        try {
            // Check if course progress exists
            const existingProgress = await this.prisma.courseProgress.findFirst({
                where: {
                    user_id: userId,
                    course_id: courseId,
                    deleted_at: null,
                },
            });

            if (existingProgress) {
                // Update existing progress
                await this.prisma.courseProgress.update({
                    where: {
                        user_id_course_id: {
                            user_id: userId,
                            course_id: courseId,
                        },
                    },
                    data: {
                        status: status,
                        updated_at: new Date(),
                    },
                });
            } else {
                // Create new progress
                await this.prisma.courseProgress.create({
                    data: {
                        user_id: userId,
                        course_id: courseId,
                        series_id: seriesId,
                        status: status,
                        completion_percentage: 0,
                        is_completed: false,
                        started_at: new Date(),
                    },
                });
            }
        } catch (error) {
            this.logger.error(`Error updating course progress status: ${error.message}`);
        }
    }

    /**
     * Update enrollment progress percentage based on completed lessons
     */
    async updateEnrollmentProgress(userId: string, seriesId: string): Promise<void> {
        try {
            this.logger.log(`Updating enrollment progress for user ${userId} in series ${seriesId}`);

            // Get all lessons in the series
            const totalLessons = await this.getTotalLessonsInSeries(seriesId);
            if (totalLessons === 0) {
                this.logger.warn(`No lessons found for series ${seriesId}`);
                return;
            }

            // Get completed lessons for this user in this series
            const completedLessons = await this.getCompletedLessonsInSeries(userId, seriesId);

            // Calculate progress percentage
            const progressPercentage = Math.round((completedLessons / totalLessons) * 100);
            const isSeriesCompleted = progressPercentage === 100;

            // Update enrollment progress
            await this.updateEnrollmentRecord(userId, seriesId, progressPercentage, isSeriesCompleted);

            this.logger.log(`Updated enrollment progress: ${completedLessons}/${totalLessons} lessons completed (${progressPercentage}%) - Enrollment ${isSeriesCompleted ? 'COMPLETED' : 'ACTIVE'}`);
        } catch (error) {
            this.logger.error(`Error updating enrollment progress: ${error.message}`);
        }
    }

    /**
     * Get course progress for a user
     */
    async getCourseProgress(userId: string, courseId: string): Promise<SeriesResponse<any>> {
        try {
            this.logger.log(`Fetching course progress for user ${userId} in course ${courseId}`);

            const courseProgress = await this.prisma.courseProgress.findFirst({
                where: {
                    user_id: userId,
                    course_id: courseId,
                    deleted_at: null,
                },
                include: {
                    course: {
                        select: {
                            id: true,
                            title: true,
                        },
                    },
                    series: {
                        select: {
                            id: true,
                            title: true,
                        },
                    },
                },
            });

            if (!courseProgress) {
                return {
                    success: false,
                    message: 'Course progress not found',
                };
            }

            return {
                success: true,
                message: 'Course progress retrieved successfully',
                data: courseProgress,
            };
        } catch (error) {
            this.logger.error(`Error fetching course progress: ${error.message}`, error.stack);
            return {
                success: false,
                message: 'Failed to fetch course progress',
                error: error.message,
            };
        }
    }

    /**
     * Get all course progress for a user in a series
     */
    async getAllCourseProgress(userId: string, seriesId: string): Promise<SeriesResponse<{ courseProgress: any[] }>> {
        try {
            this.logger.log(`Fetching all course progress for user ${userId} in series ${seriesId}`);

            const courseProgress = await this.prisma.courseProgress.findMany({
                where: {
                    user_id: userId,
                    series_id: seriesId,
                    deleted_at: null,
                },
                include: {
                    course: {
                        select: {
                            id: true,
                            title: true,
                        },
                    },
                    series: {
                        select: {
                            id: true,
                            title: true,
                        },
                    },
                },
                orderBy: {
                    course: {
                        created_at: 'asc',
                    },
                },
            });

            return {
                success: true,
                message: 'Course progress retrieved successfully',
                data: {
                    courseProgress,
                },
            };
        } catch (error) {
            this.logger.error(`Error fetching course progress: ${error.message}`, error.stack);
            return {
                success: false,
                message: 'Failed to fetch course progress',
                error: error.message,
            };
        }
    }

    // Private helper methods

    private async getTotalLessonsInCourse(courseId: string): Promise<number> {
        return await this.prisma.lessonFile.count({
            where: {
                course_id: courseId,
                deleted_at: null,
            },
        });
    }

    private async getCompletedLessonsCount(userId: string, courseId: string): Promise<number> {
        return await this.prisma.lessonProgress.count({
            where: {
                user_id: userId,
                course_id: courseId,
                is_completed: true,
                deleted_at: null,
            },
        });
    }

    private async getTotalLessonsInSeries(seriesId: string): Promise<number> {
        return await this.prisma.lessonFile.count({
            where: {
                course: {
                    series_id: seriesId,
                    deleted_at: null,
                },
                deleted_at: null,
            },
        });
    }

    private async getCompletedLessonsInSeries(userId: string, seriesId: string): Promise<number> {
        return await this.prisma.lessonProgress.count({
            where: {
                user_id: userId,
                series_id: seriesId,
                is_completed: true,
                deleted_at: null,
            },
        });
    }

    private async updateCourseProgressRecord(
        userId: string,
        courseId: string,
        seriesId: string,
        completionPercentage: number,
        isCourseCompleted: boolean
    ) {

        // Check if course progress exists
        const existingProgress = await this.prisma.courseProgress.findFirst({
            where: {
                user_id: userId,
                course_id: courseId,
                deleted_at: null,
            },
        });

        if (existingProgress) {
            // Update existing progress
            await this.prisma.courseProgress.update({
                where: {
                    user_id_course_id: {
                        user_id: userId,
                        course_id: courseId,
                    },
                },
                data: {
                    status: isCourseCompleted ? COURSE_STATUS.COMPLETED : COURSE_STATUS.IN_PROGRESS,
                    completion_percentage: completionPercentage,
                    is_completed: isCourseCompleted,
                    completed_at: isCourseCompleted ? new Date() : null,
                    updated_at: new Date(),
                },
            });
        } else {
            // Create new progress
            await this.prisma.courseProgress.create({
                data: {
                    user_id: userId,
                    course_id: courseId,
                    series_id: seriesId,
                    status: isCourseCompleted ? COURSE_STATUS.COMPLETED : COURSE_STATUS.IN_PROGRESS,
                    completion_percentage: completionPercentage,
                    is_completed: isCourseCompleted,
                    started_at: new Date(),
                    completed_at: isCourseCompleted ? new Date() : null,
                },
            });
        }
    }

    private async updateEnrollmentRecord(
        userId: string,
        seriesId: string,
        progressPercentage: number,
        isSeriesCompleted: boolean
    ) {
        await this.prisma.enrollment.updateMany({
            where: {
                user_id: userId,
                series_id: seriesId,
                status: { in: ['ACTIVE', 'COMPLETED'] as any },
                payment_status: 'completed',
                deleted_at: null,
            },
            data: {
                progress_percentage: progressPercentage,
                status: isSeriesCompleted ? 'COMPLETED' as any : 'ACTIVE' as any,
                last_accessed_at: new Date(),
                updated_at: new Date(),
            },
        });
    }

    private async handleCourseCompletion(userId: string, courseId: string, seriesId: string) {
        this.logger.log(`Course ${courseId} is completed! Unlocking end video and starting next course...`);

        // Check if course has end video and unlock it
        const course = await this.prisma.course.findFirst({
            where: {
                id: courseId,
                deleted_at: null,
            },
            select: { id: true, end_video_url: true },
        });

        if (course?.end_video_url) {
            await this.prisma.courseProgress.updateMany({
                where: {
                    user_id: userId,
                    course_id: courseId,
                    series_id: seriesId,
                    deleted_at: null,
                },
                data: {
                    end_video_unlocked: true,
                    updated_at: new Date(),
                } as any,
            });
            this.logger.log(`End video unlocked for completed course ${courseId}`);
        }

        // Start next course (this would be called from the main service)
        // await this.startNextCourse(userId, courseId, seriesId);
    }
}
