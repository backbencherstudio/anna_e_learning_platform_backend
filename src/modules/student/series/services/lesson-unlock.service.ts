import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { LessonUnlockResult } from '../types/video-progress.types';
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../constants/video-progress.constants';

@Injectable()
export class LessonUnlockService {
    private readonly logger = new Logger(LessonUnlockService.name);

    constructor(private readonly prisma: PrismaService) { }

    /**
     * Unlock next lesson after completing current one
     */
    async unlockNextLesson(userId: string, completedLessonId: string, courseId: string): Promise<void> {
        try {
            // Get current lesson
            const currentLesson = await this.prisma.lessonFile.findFirst({
                where: { id: completedLessonId, deleted_at: null },
                select: { created_at: true },
            });

            console.log(currentLesson)

            if (!currentLesson) return;

            // Find next lesson in the same course (next by creation time)
            const nextLesson = await this.prisma.lessonFile.findFirst({
                where: {
                    course_id: courseId,
                    created_at: { gt: currentLesson.created_at },
                    deleted_at: null,
                },
                select: { id: true },
                orderBy: { created_at: 'asc' },
            });

            if (nextLesson) {
                // Get series_id for the course
                const course = await this.prisma.course.findUnique({
                    where: { id: courseId },
                    select: { series_id: true },
                });

                await this.unlockLessonForUser(userId, nextLesson.id, courseId, course?.series_id);
                this.logger.log(`Unlocked next lesson ${nextLesson.id} for user ${userId}`);
            } else {
                // If no next lesson in current course, check if there's a next course
                await this.handleNextCourseUnlock(userId, courseId);
            }
        } catch (error) {
            this.logger.error(`Error unlocking next lesson: ${error.message}`);
        }
    }

    /**
     * Ensure first course's intro video or first lesson is unlocked for a user
     */
    async unlockFirstLessonForUser(userId: string, seriesId: string): Promise<void> {
        try {
            this.logger.log(`Unlocking first course content for user ${userId} in series ${seriesId}`);

            // Get all courses in the series ordered by creation time
            const courses = await this.getCoursesInSeries(seriesId);

            if (!courses.length) {
                this.logger.warn(`No courses found for series ${seriesId}`);
                return;
            }

            // Initialize course progress for all courses in the series
            await this.initializeCourseProgressForAllCourses(userId, courses, seriesId);

            const firstCourse = courses[0];

            // First, try to unlock intro video if it exists
            if (firstCourse.intro_video_url) {
                await this.unlockIntroVideoForCourse(userId, firstCourse.id, seriesId);
            } else {
                // If no intro video, unlock the first lesson file
                await this.unlockFirstLessonInCourse(userId, firstCourse.id, seriesId);
            }

            this.logger.log(`Initialized course progress for ${courses.length} courses in series ${seriesId}`);
        } catch (error) {
            this.logger.error(`Error unlocking first course content: ${error.message}`);
        }
    }

    /**
     * Unlock first lesson after intro video completion
     */
    async unlockFirstLessonAfterIntroCompletion(userId: string, courseId: string, seriesId: string): Promise<boolean> {
        const firstLesson = await this.prisma.lessonFile.findFirst({
            where: {
                course_id: courseId,
                deleted_at: null,
            },
            select: { id: true },
            orderBy: { created_at: 'asc' },
        });

        if (!firstLesson) {
            return false;
        }

        return await this.unlockLessonForUser(userId, firstLesson.id, courseId, seriesId);
    }

    /**
     * Start the next course automatically when current course is completed
     */
    async startNextCourse(userId: string, completedCourseId: string, seriesId: string): Promise<void> {
        try {
            this.logger.log(`Starting next course for user ${userId} after completing course ${completedCourseId} in series ${seriesId}`);

            // Get current course
            const currentCourse = await this.getCurrentCourse(completedCourseId);
            if (!currentCourse) {
                this.logger.warn(`Current course ${completedCourseId} not found`);
                return;
            }

            // Find next course in the series
            const nextCourse = await this.getNextCourseInSeries(seriesId, currentCourse.created_at);
            if (!nextCourse) {
                this.logger.log(`No next course found for user ${userId} in series ${seriesId} - All courses completed!`);
                return;
            }

            // Create or update course progress for next course
            await this.createOrUpdateCourseProgress(userId, nextCourse.id, seriesId);

            // Unlock content for next course
            await this.unlockContentForNextCourse(userId, nextCourse.id, seriesId);
        } catch (error) {
            this.logger.error(`Error starting next course: ${error.message}`, error.stack);
        }
    }

    // Private helper methods

    private async getCoursesInSeries(seriesId: string) {
        return await this.prisma.course.findMany({
            where: {
                series_id: seriesId,
                deleted_at: null,
            },
            orderBy: { created_at: 'asc' },
            select: {
                id: true,
                intro_video_url: true,
                end_video_url: true
            },
        });
    }

    private async initializeCourseProgressForAllCourses(userId: string, courses: any[], seriesId: string) {
        for (const course of courses) {
            await this.initializeCourseProgress(userId, course.id, seriesId);
        }
    }

    private async initializeCourseProgress(userId: string, courseId: string, seriesId: string): Promise<void> {
        try {
            this.logger.log(`Initializing course progress for user ${userId} in course ${courseId}`);

            // Check if course progress already exists
            const existingProgress = await this.prisma.courseProgress.findFirst({
                where: {
                    user_id: userId,
                    course_id: courseId,
                },
            });

            if (!existingProgress) {
                // Create initial course progress
                await this.prisma.courseProgress.create({
                    data: {
                        user_id: userId,
                        course_id: courseId,
                        series_id: seriesId,
                        status: 'pending',
                        completion_percentage: 0,
                        is_completed: false,
                        started_at: new Date(),
                    },
                });

                this.logger.log(`Initialized course progress for user ${userId} in course ${courseId}`);
            }
        } catch (error) {
            this.logger.error(`Error initializing course progress: ${error.message}`);
        }
    }

    private async unlockIntroVideoForCourse(userId: string, courseId: string, seriesId: string) {
        this.logger.log(`Unlocking intro video for first course ${courseId} for user ${userId}`);

        await this.prisma.courseProgress.updateMany({
            where: {
                user_id: userId,
                course_id: courseId,
                series_id: seriesId,
                deleted_at: null,
            },
            data: {
                intro_video_unlocked: true,
                updated_at: new Date(),
            } as any,
        });

        this.logger.log(`Intro video unlocked for first course ${courseId} for user ${userId}`);
    }

    private async unlockFirstLessonInCourse(userId: string, courseId: string, seriesId: string) {
        this.logger.log(`No intro video found, unlocking first lesson for first course ${courseId} for user ${userId}`);

        const firstLesson = await this.prisma.lessonFile.findFirst({
            where: {
                course_id: courseId,
                deleted_at: null,
            },
            select: { id: true },
            orderBy: { created_at: 'asc' },
        });

        if (firstLesson) {
            await this.unlockLessonForUser(userId, firstLesson.id, courseId, seriesId);
            this.logger.log(`Unlocked first lesson ${firstLesson.id} for user ${userId} in series ${seriesId}`);
        } else {
            this.logger.warn(`No lessons found for first course ${courseId}`);
        }
    }

    private async unlockLessonForUser(userId: string, lessonId: string, courseId: string, seriesId?: string): Promise<boolean> {
        // Check if lesson progress already exists
        const existingProgress = await this.prisma.lessonProgress.findFirst({
            where: {
                user_id: userId,
                lesson_id: lessonId,
                deleted_at: null,
            },
        });

        if (!existingProgress) {
            // Get series_id if not provided
            if (!seriesId) {
                const course = await this.prisma.course.findUnique({
                    where: { id: courseId },
                    select: { series_id: true },
                });
                seriesId = course?.series_id || '';
            }

            // Create progress record for lesson (unlocked but not completed)
            await this.prisma.lessonProgress.create({
                data: {
                    user_id: userId,
                    lesson_id: lessonId,
                    course_id: courseId,
                    series_id: seriesId,
                    is_completed: false,
                    is_viewed: false,
                    is_unlocked: true,
                },
            });

            return true;
        }

        return true; // Already unlocked
    }

    private async handleNextCourseUnlock(userId: string, courseId: string) {
        const currentCourse = await this.prisma.course.findFirst({
            where: { id: courseId, deleted_at: null },
            select: { created_at: true, series_id: true },
        });

        if (currentCourse) {
            // Find next course in the series (next by creation time)
            const nextCourse = await this.prisma.course.findFirst({
                where: {
                    series_id: currentCourse.series_id,
                    created_at: { gt: currentCourse.created_at },
                    deleted_at: null,
                },
                select: { id: true, intro_video_url: true },
                orderBy: { created_at: 'asc' },
            });

            if (nextCourse) {
                // Check if next course has intro video
                if (nextCourse.intro_video_url) {
                    // Unlock intro video for next course
                    await this.prisma.courseProgress.updateMany({
                        where: {
                            user_id: userId,
                            course_id: nextCourse.id,
                            series_id: currentCourse.series_id,
                            deleted_at: null,
                        },
                        data: {
                            intro_video_unlocked: true,
                            updated_at: new Date(),
                        } as any,
                    });

                    this.logger.log(`Unlocked intro video for next course ${nextCourse.id} for user ${userId}`);
                } else {
                    // Find first lesson of next course (first by creation time)
                    const firstLessonOfNextCourse = await this.prisma.lessonFile.findFirst({
                        where: {
                            course_id: nextCourse.id,
                            deleted_at: null,
                        },
                        select: { id: true },
                        orderBy: { created_at: 'asc' },
                    });

                    if (firstLessonOfNextCourse) {
                        await this.unlockLessonForUser(userId, firstLessonOfNextCourse.id, nextCourse.id, currentCourse.series_id);
                        this.logger.log(`Unlocked first lesson ${firstLessonOfNextCourse.id} of next course ${nextCourse.id} for user ${userId}`);
                    }
                }
            }
        }
    }

    private async getCurrentCourse(courseId: string) {
        return await this.prisma.course.findFirst({
            where: {
                id: courseId,
                deleted_at: null
            },
            select: { created_at: true },
        });
    }

    private async getNextCourseInSeries(seriesId: string, currentCourseCreatedAt: Date) {
        return await this.prisma.course.findFirst({
            where: {
                series_id: seriesId,
                created_at: { gt: currentCourseCreatedAt },
                deleted_at: null,
            },
            select: {
                id: true,
                title: true,
            },
            orderBy: { created_at: 'asc' },
        });
    }

    private async createOrUpdateCourseProgress(userId: string, courseId: string, seriesId: string) {
        // Check if course progress already exists for next course
        const existingProgress = await this.prisma.courseProgress.findFirst({
            where: {
                user_id: userId,
                course_id: courseId,
            },
        });

        if (!existingProgress) {
            // Create course progress for next course
            await this.prisma.courseProgress.create({
                data: {
                    user_id: userId,
                    course_id: courseId,
                    series_id: seriesId,
                    status: 'in_progress',
                    completion_percentage: 0,
                    is_completed: false,
                    started_at: new Date(),
                },
            });

            this.logger.log(`Started course progress for next course: ${courseId}`);
        } else {
            // Update existing progress to in_progress if it was pending
            if (existingProgress.status === 'pending') {
                await this.prisma.courseProgress.update({
                    where: {
                        user_id_course_id: {
                            user_id: userId,
                            course_id: courseId,
                        },
                    },
                    data: {
                        status: 'in_progress',
                        started_at: new Date(),
                        updated_at: new Date(),
                    },
                });

                this.logger.log(`Updated course progress to in_progress for next course: ${courseId}`);
            }
        }
    }

    private async unlockContentForNextCourse(userId: string, courseId: string, seriesId: string) {
        // Check if next course has intro video
        const nextCourseWithIntro = await this.prisma.course.findFirst({
            where: {
                id: courseId,
                deleted_at: null,
            },
            select: { id: true, title: true, intro_video_url: true },
        });

        if (nextCourseWithIntro?.intro_video_url) {
            // Unlock intro video for next course
            await this.prisma.courseProgress.updateMany({
                where: {
                    user_id: userId,
                    course_id: courseId,
                    series_id: seriesId,
                    deleted_at: null,
                },
                data: {
                    intro_video_unlocked: true,
                    updated_at: new Date(),
                } as any,
            });

            this.logger.log(`Unlocked intro video for next course: ${nextCourseWithIntro.title}`);
        } else {
            // Unlock first lesson of next course
            const firstLesson = await this.prisma.lessonFile.findFirst({
                where: {
                    course_id: courseId,
                    deleted_at: null,
                },
                select: { id: true, title: true },
                orderBy: { created_at: 'asc' },
            });

            if (firstLesson) {
                await this.unlockLessonForUser(userId, firstLesson.id, courseId, seriesId);
                this.logger.log(`Unlocked first lesson of next course: ${firstLesson.title}`);
            } else {
                this.logger.warn(`No first lesson found for next course ${nextCourseWithIntro?.title}`);
            }
        }
    }
}
