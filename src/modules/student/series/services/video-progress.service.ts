import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { SeriesResponse } from '../interfaces/series-response.interface';
import {
    VideoProgressData,
    VideoProgressResponse,
    VideoValidationResult
} from '../types/video-progress.types';
import {
    VIDEO_PROGRESS_CONSTANTS,
    ERROR_MESSAGES,
    SUCCESS_MESSAGES
} from '../constants/video-progress.constants';

@Injectable()
export class VideoProgressService {
    private readonly logger = new Logger(VideoProgressService.name);

    constructor(private readonly prisma: PrismaService) { }

    /**
     * Update intro video progress and auto-complete if 100% watched
     */
    async updateIntroVideoProgress(
        userId: string,
        courseId: string,
        progressData: VideoProgressData
    ): Promise<VideoProgressResponse> {
        try {
            this.logger.log(`Updating intro video progress for course ${courseId}, user ${userId}`);

            // Validate intro video access
            const validationResult = await this.validateIntroVideoAccess(userId, courseId);
            if (!validationResult.isValid) {
                return this.createErrorResponse(validationResult.error!);
            }

            const { courseProgress } = validationResult;

            // Check if new completion percentage is lower than existing - don't allow regression
            const existingPercentage = courseProgress.intro_video_completion_percentage ?? 0;
            const newPercentage = progressData.completion_percentage ?? 0;

            if (newPercentage < existingPercentage) {
                this.logger.log(`Intro video completion percentage regression prevented: ${newPercentage}% < ${existingPercentage}% for course ${courseId}, user ${userId}`);
                return {
                    success: true,
                    message: 'Intro video progress not updated - completion percentage cannot decrease',
                    data: {
                        progress: courseProgress,
                        auto_completed: false,
                        prevented_regression: true,
                    } as any,
                };
            }

            // Update intro video progress
            const updatedProgress = await this.updateIntroVideoProgressData(userId, courseId, progressData);

            // Check if intro video should unlock first lesson at 90%
            if (this.shouldUnlockFirstLesson(progressData.completion_percentage, courseProgress.intro_video_completed)) {
                this.logger.log(`Unlocking first lesson for course ${courseId} (${progressData.completion_percentage}% watched)`);

                // Unlock first lesson without marking intro video as completed
                await this.unlockFirstLessonAfterIntroProgress(userId, courseId, courseProgress.series_id);

                return {
                    success: true,
                    message: 'Intro video progress updated and first lesson unlocked',
                    data: {
                        progress: updatedProgress,
                        auto_completed: false,
                        first_lesson_unlocked: true,
                    } as any,
                };
            }

            // Auto-complete intro video if 100% watched
            if (this.shouldAutoCompleteVideo(progressData.completion_percentage, courseProgress.intro_video_completed)) {
                this.logger.log(`Auto-completing intro video for course ${courseId} (${progressData.completion_percentage}% watched)`);

                const completionResult = await this.markIntroVideoAsCompleted(userId, courseId, progressData);

                return {
                    success: true,
                    message: 'Intro video progress updated and auto-completed',
                    data: {
                        progress: updatedProgress,
                        completion: completionResult.data,
                        auto_completed: true,
                    },
                };
            }

            return {
                success: true,
                message: SUCCESS_MESSAGES.INTRO_VIDEO_PROGRESS_UPDATED,
                data: {
                    progress: updatedProgress,
                    auto_completed: false,
                },
            };
        } catch (error) {
            this.logger.error(`Error updating intro video progress: ${error.message}`, error.stack);
            return this.createErrorResponse('Failed to update intro video progress');
        }
    }

    /**
     * Update end video progress and auto-complete if 100% watched
     */
    async updateEndVideoProgress(
        userId: string,
        courseId: string,
        progressData: VideoProgressData
    ): Promise<VideoProgressResponse> {
        try {
            this.logger.log(`Updating end video progress for course ${courseId}, user ${userId}`);

            // Validate end video access
            const validationResult = await this.validateEndVideoAccess(userId, courseId);
            if (!validationResult.isValid) {
                return this.createErrorResponse(validationResult.error!);
            }

            const { courseProgress } = validationResult;

            // Check if new completion percentage is lower than existing - don't allow regression
            const existingPercentage = courseProgress.end_video_completion_percentage ?? 0;
            const newPercentage = progressData.completion_percentage ?? 0;

            if (newPercentage < existingPercentage) {
                this.logger.log(`End video completion percentage regression prevented: ${newPercentage}% < ${existingPercentage}% for course ${courseId}, user ${userId}`);
                return {
                    success: true,
                    message: 'End video progress not updated - completion percentage cannot decrease',
                    data: {
                        progress: courseProgress,
                        auto_completed: false,
                        prevented_regression: true,
                    } as any,
                };
            }

            // Update end video progress
            const updatedProgress = await this.updateEndVideoProgressData(userId, courseId, progressData);

            // Auto-complete end video if 100% watched
            if (this.shouldAutoCompleteVideo(progressData.completion_percentage, courseProgress.end_video_completed)) {
                this.logger.log(`Auto-completing end video for course ${courseId} (${progressData.completion_percentage}% watched)`);

                const completionResult = await this.markEndVideoAsCompleted(userId, courseId, progressData);

                return {
                    success: true,
                    message: 'End video progress updated and auto-completed',
                    data: {
                        progress: updatedProgress,
                        completion: completionResult.data,
                        auto_completed: true,
                    },
                };
            }

            return {
                success: true,
                message: SUCCESS_MESSAGES.END_VIDEO_PROGRESS_UPDATED,
                data: {
                    progress: updatedProgress,
                    auto_completed: false,
                },
            };
        } catch (error) {
            this.logger.error(`Error updating end video progress: ${error.message}`, error.stack);
            return this.createErrorResponse('Failed to update end video progress');
        }
    }

    /**
     * Mark intro video as completed and unlock first lesson
     */
    async markIntroVideoAsCompleted(
        userId: string,
        courseId: string,
        completionData?: VideoProgressData
    ): Promise<SeriesResponse<any>> {
        try {
            this.logger.log(`Marking intro video as completed for user ${userId} in course ${courseId}`);

            // Validate course progress
            const courseProgress = await this.getCourseProgressForUser(userId, courseId);
            if (!courseProgress) {
                return this.createErrorResponse(ERROR_MESSAGES.COURSE_NOT_FOUND);
            }

            // Mark intro video as completed
            await this.updateIntroVideoCompletionStatus(userId, courseId, completionData);

            this.logger.log(`Intro video marked as completed for user ${userId} in course ${courseId}`);

            return {
                success: true,
                message: SUCCESS_MESSAGES.INTRO_VIDEO_COMPLETED,
                data: {
                    course_id: courseId,
                    intro_video_completed: true,
                },
            };
        } catch (error) {
            this.logger.error(`Error marking intro video as completed: ${error.message}`, error.stack);
            return this.createErrorResponse('Failed to mark intro video as completed');
        }
    }

    /**
     * Mark end video as completed
     */
    async markEndVideoAsCompleted(
        userId: string,
        courseId: string,
        completionData?: VideoProgressData
    ): Promise<SeriesResponse<any>> {
        try {
            this.logger.log(`Marking end video as completed for user ${userId} in course ${courseId}`);

            // Validate end video access
            const validationResult = await this.validateEndVideoAccess(userId, courseId);
            if (!validationResult.isValid) {
                return this.createErrorResponse(validationResult.error!);
            }

            // Mark end video as completed
            await this.updateEndVideoCompletionStatus(userId, courseId, completionData);

            this.logger.log(`End video marked as completed for user ${userId} in course ${courseId}`);

            return {
                success: true,
                message: SUCCESS_MESSAGES.END_VIDEO_COMPLETED,
                data: {
                    course_id: courseId,
                    end_video_completed: true,
                },
            };
        } catch (error) {
            this.logger.error(`Error marking end video as completed: ${error.message}`, error.stack);
            return this.createErrorResponse('Failed to mark end video as completed');
        }
    }

    // Private helper methods

    private async validateIntroVideoAccess(userId: string, courseId: string): Promise<VideoValidationResult> {
        const courseProgress = await this.prisma.courseProgress.findFirst({
            where: {
                user_id: userId,
                course_id: courseId,
                deleted_at: null,
            },
        });

        if (!courseProgress) {
            return {
                isValid: false,
                error: ERROR_MESSAGES.COURSE_NOT_FOUND,
            };
        }

        if (!courseProgress.intro_video_unlocked) {
            return {
                isValid: false,
                error: ERROR_MESSAGES.INTRO_VIDEO_NOT_UNLOCKED,
            };
        }

        return {
            isValid: true,
            courseProgress,
        };
    }

    private async validateEndVideoAccess(userId: string, courseId: string): Promise<VideoValidationResult> {
        const courseProgress = await this.prisma.courseProgress.findFirst({
            where: {
                user_id: userId,
                course_id: courseId,
                deleted_at: null,
            },
        });

        if (!courseProgress) {
            return {
                isValid: false,
                error: ERROR_MESSAGES.COURSE_NOT_FOUND,
            };
        }

        if (!courseProgress.is_completed) {
            return {
                isValid: false,
                error: ERROR_MESSAGES.COURSE_NOT_COMPLETED,
            };
        }

        if (!courseProgress.end_video_unlocked) {
            return {
                isValid: false,
                error: ERROR_MESSAGES.END_VIDEO_NOT_UNLOCKED,
            };
        }

        return {
            isValid: true,
            courseProgress,
        };
    }

    private async updateIntroVideoProgressData(
        userId: string,
        courseId: string,
        progressData: VideoProgressData
    ) {
        return await this.prisma.courseProgress.updateMany({
            where: {
                user_id: userId,
                course_id: courseId,
                deleted_at: null,
            },
            data: {
                intro_video_time_spent: progressData.time_spent,
                intro_video_last_position: progressData.last_position,
                intro_video_completion_percentage: progressData.completion_percentage,
                intro_video_viewed: (progressData.completion_percentage ?? 0) > VIDEO_PROGRESS_CONSTANTS.MIN_VIEWED_THRESHOLD,
                updated_at: new Date(),
            } as any,
        });
    }

    private async updateEndVideoProgressData(
        userId: string,
        courseId: string,
        progressData: VideoProgressData
    ) {
        return await this.prisma.courseProgress.updateMany({
            where: {
                user_id: userId,
                course_id: courseId,
                deleted_at: null,
            },
            data: {
                end_video_time_spent: progressData.time_spent,
                end_video_last_position: progressData.last_position,
                end_video_completion_percentage: progressData.completion_percentage,
                end_video_viewed: (progressData.completion_percentage ?? 0) > VIDEO_PROGRESS_CONSTANTS.MIN_VIEWED_THRESHOLD,
                updated_at: new Date(),
            } as any,
        });
    }

    private shouldUnlockFirstLesson(completionPercentage?: number, isAlreadyCompleted?: boolean): boolean {
        // Unlock if completion is >= 90% and intro video is not already completed
        // OR if intro video is already completed (for cases where it was completed before this logic)
        return ((completionPercentage ?? 0) >= VIDEO_PROGRESS_CONSTANTS.INTRO_VIDEO_UNLOCK_THRESHOLD && !isAlreadyCompleted) ||
            (isAlreadyCompleted && (completionPercentage ?? 0) >= VIDEO_PROGRESS_CONSTANTS.INTRO_VIDEO_UNLOCK_THRESHOLD);
    }

    private shouldAutoCompleteVideo(completionPercentage?: number, isAlreadyCompleted?: boolean): boolean {
        return (completionPercentage ?? 0) >= VIDEO_PROGRESS_CONSTANTS.AUTO_COMPLETION_THRESHOLD && !isAlreadyCompleted;
    }

    private async unlockFirstLessonAfterIntroProgress(userId: string, courseId: string, seriesId: string): Promise<void> {
        try {
            // Find first lesson in the course
            const firstLesson = await this.prisma.lessonFile.findFirst({
                where: {
                    course_id: courseId,
                    deleted_at: null,
                },
                select: { id: true },
                orderBy: { created_at: 'asc' },
            });

            if (!firstLesson) {
                this.logger.warn(`No lessons found for course ${courseId}`);
                return;
            }

            // Check if lesson progress already exists
            const existingProgress = await this.prisma.lessonProgress.findFirst({
                where: {
                    user_id: userId,
                    lesson_id: firstLesson.id,
                    deleted_at: null,
                },
            });

            if (!existingProgress) {
                // Create progress record for lesson (unlocked but not completed)
                await this.prisma.lessonProgress.create({
                    data: {
                        user_id: userId,
                        lesson_id: firstLesson.id,
                        course_id: courseId,
                        series_id: seriesId,
                        is_completed: false,
                        is_viewed: false,
                        is_unlocked: true,
                    },
                });

                this.logger.log(`Unlocked first lesson ${firstLesson.id} for user ${userId} in course ${courseId}`);
            }
        } catch (error) {
            this.logger.error(`Error unlocking first lesson after intro progress: ${error.message}`);
        }
    }

    private async getCourseProgressForUser(userId: string, courseId: string) {
        return await this.prisma.courseProgress.findFirst({
            where: {
                user_id: userId,
                course_id: courseId,
                deleted_at: null,
            },
        });
    }

    private async updateIntroVideoCompletionStatus(
        userId: string,
        courseId: string,
        completionData?: VideoProgressData
    ) {
        await this.prisma.courseProgress.updateMany({
            where: {
                user_id: userId,
                course_id: courseId,
                deleted_at: null,
            },
            data: {
                intro_video_completed: true,
                intro_video_viewed: true,
                intro_video_time_spent: completionData?.time_spent,
                intro_video_last_position: completionData?.last_position,
                intro_video_completion_percentage: completionData?.completion_percentage || VIDEO_PROGRESS_CONSTANTS.DEFAULT_COMPLETION_PERCENTAGE,
                updated_at: new Date(),
            } as any,
        });
    }

    private async updateEndVideoCompletionStatus(
        userId: string,
        courseId: string,
        completionData?: VideoProgressData
    ) {
        await this.prisma.courseProgress.updateMany({
            where: {
                user_id: userId,
                course_id: courseId,
                deleted_at: null,
            },
            data: {
                end_video_completed: true,
                end_video_viewed: true,
                end_video_time_spent: completionData?.time_spent,
                end_video_last_position: completionData?.last_position,
                end_video_completion_percentage: completionData?.completion_percentage || VIDEO_PROGRESS_CONSTANTS.DEFAULT_COMPLETION_PERCENTAGE,
                updated_at: new Date(),
            } as any,
        });
    }

    private createErrorResponse(message: string): VideoProgressResponse {
        return {
            success: false,
            message,
            error: message,
        };
    }
}
