import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { SeriesResponse } from '../interfaces/series-response.interface';
import { VideoProgressData } from '../types/video-progress.types';
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../constants/video-progress.constants';

@Injectable()
export class LessonProgressService {
    private readonly logger = new Logger(LessonProgressService.name);

    constructor(private readonly prisma: PrismaService) { }

    /**
     * Mark lesson as viewed
     */
    async markLessonAsViewed(userId: string, lessonId: string): Promise<SeriesResponse<any>> {
        try {
            this.logger.log(`Marking lesson ${lessonId} as viewed for user ${userId}`);

            // Validate lesson access
            const validation = await this.validateLessonAccess(userId, lessonId);
            if (!validation.isValid) {
                return {
                    success: false,
                    message: validation.error,
                    error: validation.error,
                };
            }

            const { lesson, existingProgress } = validation;

            // Update lesson progress to viewed
            const progress = await this.prisma.lessonProgress.update({
                where: {
                    user_id_lesson_id: {
                        user_id: userId,
                        lesson_id: lessonId,
                    },
                },
                data: {
                    is_viewed: true,
                    viewed_at: new Date(),
                    updated_at: new Date(),
                },
            });

            // Update course progress to in_progress if it's still pending
            await this.updateCourseProgressStatus(userId, lesson.course.id, lesson.course.series_id, 'in_progress');

            this.logger.log(`Lesson ${lessonId} marked as viewed for user ${userId}`);

            return {
                success: true,
                message: 'Lesson marked as viewed',
                data: progress,
            };
        } catch (error) {
            this.logger.error(`Error marking lesson as viewed: ${error.message}`, error.stack);
            return {
                success: false,
                message: 'Failed to mark lesson as viewed',
                error: error.message,
            };
        }
    }

    /**
     * Mark lesson as completed
     */
    async markLessonAsCompleted(
        userId: string,
        lessonId: string,
        completionData?: VideoProgressData
    ): Promise<SeriesResponse<any>> {
        try {
            this.logger.log(`Marking lesson ${lessonId} as completed for user ${userId}`);

            // Validate lesson access
            const validation = await this.validateLessonAccess(userId, lessonId);
            if (!validation.isValid) {
                return {
                    success: false,
                    message: validation.error,
                    error: validation.error,
                };
            }

            const { lesson, existingProgress } = validation;

            // Allow completion if lesson is viewed or if called from updateVideoProgress (auto-completion)
            if (!existingProgress.is_viewed && !completionData) {
                this.logger.warn(`User ${userId} attempted to complete lesson ${lessonId} without viewing it first`);
                return {
                    success: false,
                    message: ERROR_MESSAGES.LESSON_NOT_VIEWED,
                    error: 'Lesson not viewed',
                };
            }

            // Update lesson progress to completed
            const progress = await this.prisma.lessonProgress.update({
                where: {
                    user_id_lesson_id: {
                        user_id: userId,
                        lesson_id: lessonId,
                    },
                },
                data: {
                    is_completed: true,
                    is_viewed: true,
                    completed_at: new Date(),
                    viewed_at: new Date(),
                    time_spent: completionData?.time_spent,
                    last_position: completionData?.last_position,
                    completion_percentage: completionData?.completion_percentage || 100,
                    updated_at: new Date(),
                },
            });

            this.logger.log(`Lesson ${lessonId} marked as completed for user ${userId}`);

            return {
                success: true,
                message: 'Lesson marked as completed',
                data: progress,
            };
        } catch (error) {
            this.logger.error(`Error marking lesson as completed: ${error.message}`, error.stack);
            return {
                success: false,
                message: 'Failed to mark lesson as completed',
                error: error.message,
            };
        }
    }

    /**
     * Update video progress and auto-complete lesson if 90%+ watched
     */
    async updateVideoProgress(
        userId: string,
        lessonId: string,
        progressData: VideoProgressData
    ): Promise<SeriesResponse<any>> {
        try {
            this.logger.log(`Updating video progress for lesson ${lessonId}, user ${userId}`);

            // Validate lesson access
            const validation = await this.validateLessonAccess(userId, lessonId);
            if (!validation.isValid) {
                return {
                    success: false,
                    message: validation.error,
                    error: validation.error,
                };
            }

            const { lesson, existingProgress } = validation;

            // Check if lesson is viewed before allowing video progress tracking
            if (!existingProgress.is_viewed) {
                return {
                    success: false,
                    message: 'You must view this lesson before tracking video progress',
                    error: 'Lesson not viewed',
                };
            }

            // Check if new completion percentage is lower than existing - don't allow regression
            const existingPercentage = existingProgress.completion_percentage ?? 0;
            const newPercentage = progressData.completion_percentage ?? 0;

            // Prepare update data - always update time_spent and last_position
            const updateData: any = {
                time_spent: progressData.time_spent,
                last_position: progressData.last_position,
                updated_at: new Date(),
            };

            // Only update completion_percentage if it's not regressing
            if (newPercentage >= existingPercentage) {
                updateData.completion_percentage = progressData.completion_percentage;
                updateData.is_viewed = (progressData.completion_percentage ?? 0) > 0;
                updateData.viewed_at = (progressData.completion_percentage ?? 0) > 0 ? new Date() : undefined;
            } else {
                // Keep existing completion_percentage but log the prevention
                this.logger.log(`Completion percentage regression prevented: ${newPercentage}% < ${existingPercentage}% for lesson ${lessonId}, user ${userId}. Updating time_spent and last_position only.`);
            }

            // Update progress using existing schema fields
            const progress = await this.prisma.lessonProgress.update({
                where: {
                    user_id_lesson_id: {
                        user_id: userId,
                        lesson_id: lessonId,
                    },
                },
                data: updateData,
            });

            // Auto-complete lesson if 90%+ watched (only if completion_percentage was updated)
            if (newPercentage >= existingPercentage && (progressData.completion_percentage ?? 0) >= 90) {
                this.logger.log(`Auto-completing lesson ${lessonId} for user ${userId} (${progressData.completion_percentage}% watched)`);

                // Mark lesson as completed
                const completionResult = await this.markLessonAsCompleted(userId, lessonId, {
                    time_spent: progressData.time_spent,
                    last_position: progressData.last_position,
                    completion_percentage: progressData.completion_percentage,
                });

                return {
                    success: true,
                    message: 'Video progress updated and lesson auto-completed',
                    data: {
                        progress,
                        completion: completionResult.data,
                        auto_completed: true,
                    },
                };
            }

            // Return appropriate message based on whether completion_percentage was updated
            const message = newPercentage < existingPercentage
                ? 'Video progress updated (time and position only - completion percentage prevented from decreasing)'
                : 'Video progress updated';

            return {
                success: true,
                message,
                data: {
                    progress,
                    auto_completed: false,
                    prevented_regression: newPercentage < existingPercentage,
                },
            };
        } catch (error) {
            this.logger.error(`Error updating video progress: ${error.message}`, error.stack);
            return {
                success: false,
                message: 'Failed to update video progress',
                error: error.message,
            };
        }
    }

    /**
     * Get lesson progress for a specific lesson
     */
    async getLessonProgress(userId: string, lessonId: string): Promise<SeriesResponse<any>> {
        try {
            const progress = await this.prisma.lessonProgress.findFirst({
                where: {
                    user_id: userId,
                    lesson_id: lessonId,
                    deleted_at: null,
                },
                include: {
                    lesson: {
                        select: {
                            id: true,
                            title: true,
                        },
                    },
                },
            });

            return {
                success: true,
                message: 'Lesson progress retrieved successfully',
                data: progress,
            };
        } catch (error) {
            this.logger.error(`Error fetching lesson progress: ${error.message}`, error.stack);
            return {
                success: false,
                message: 'Failed to fetch lesson progress',
                error: error.message,
            };
        }
    }

    /**
     * Get lesson progress for a specific course
     */
    async getLessonProgressForCourse(userId: string, courseId: string) {
        try {
            const progress = await this.prisma.lessonProgress.findMany({
                where: {
                    user_id: userId,
                    course_id: courseId,
                    deleted_at: null,
                },
                select: {
                    id: true,
                    lesson_id: true,
                    is_completed: true,
                    is_viewed: true,
                    completed_at: true,
                    viewed_at: true,
                    time_spent: true,
                    last_position: true,
                    completion_percentage: true,
                },
            });
            return progress;
        } catch (error) {
            this.logger.error(`Error fetching lesson progress: ${error.message}`);
            return [];
        }
    }

    // Private helper methods

    private async validateLessonAccess(userId: string, lessonId: string): Promise<{
        isValid: boolean;
        lesson?: any;
        courseProgress?: any;
        enrollment?: any;
        existingProgress?: any;
        error?: string;
    }> {
        try {
            // Get lesson details to find course and series
            const lesson = await this.prisma.lessonFile.findFirst({
                where: { id: lessonId, deleted_at: null },
                include: {
                    course: {
                        select: {
                            id: true,
                            series_id: true,
                        },
                    },
                },
            });

            if (!lesson || !lesson.course) {
                return { isValid: false, error: 'Lesson not found' };
            }

            // Check if user has course progress (enrollment and course progress must exist)
            const courseProgress = await this.prisma.courseProgress.findFirst({
                where: {
                    user_id: userId,
                    course_id: lesson.course.id,
                    series_id: lesson.course.series_id,
                    deleted_at: null,
                },
            });

            if (!courseProgress) {
                return { isValid: false, error: ERROR_MESSAGES.COURSE_NOT_FOUND };
            }

            // Check if user is enrolled in the series
            const enrollment = await this.prisma.enrollment.findFirst({
                where: {
                    user_id: userId,
                    series_id: lesson.course.series_id,
                    status: { in: ['ACTIVE', 'COMPLETED'] },
                    deleted_at: null,
                },
            });

            if (!enrollment) {
                return { isValid: false, error: ERROR_MESSAGES.SERIES_NOT_ENROLLED };
            }

            // Check if lesson has progress record (is unlocked)
            const existingProgress = await this.prisma.lessonProgress.findFirst({
                where: {
                    user_id: userId,
                    lesson_id: lessonId,
                    deleted_at: null,
                },
            });

            if (!existingProgress) {
                return { isValid: false, error: ERROR_MESSAGES.LESSON_NOT_UNLOCKED };
            }

            return {
                isValid: true,
                lesson,
                courseProgress,
                enrollment,
                existingProgress,
            };
        } catch (error) {
            this.logger.error(`Error validating lesson access: ${error.message}`);
            return { isValid: false, error: 'Validation failed' };
        }
    }

    private async updateCourseProgressStatus(userId: string, courseId: string, seriesId: string, status: string): Promise<void> {
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
}
