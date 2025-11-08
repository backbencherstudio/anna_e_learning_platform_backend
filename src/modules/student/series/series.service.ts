import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { SojebStorage } from 'src/common/lib/Disk/SojebStorage';
import appConfig from 'src/config/app.config';
import { SeriesResponse } from './interfaces/series-response.interface';

@Injectable()
export class SeriesService {
    private readonly logger = new Logger(SeriesService.name);

    constructor(private readonly prisma: PrismaService) { }


    async getEnrolledSeries(userId: string, page: number = 1, limit: number = 10, search?: string): Promise<SeriesResponse<{ series: any[]; pagination: any }>> {
        try {
            this.logger.log(`Fetching enrolled series for user: ${userId}`);

            const skip = (page - 1) * limit;

            // Base where clause for enrolled series
            const where: any = {
                user_id: userId,
                status: { in: ['ACTIVE', 'COMPLETED'] as any },
                payment_status: 'completed',
                deleted_at: null,
            };

            // Add search condition if provided
            if (search) {
                where.series = {
                    OR: [
                        { title: { contains: search, mode: 'insensitive' as any } },
                        { summary: { contains: search, mode: 'insensitive' as any } },
                        { description: { contains: search, mode: 'insensitive' as any } },
                    ],
                };
            }

            // Get enrollments with pagination at database level
            const [enrollments, total] = await Promise.all([
                this.prisma.enrollment.findMany({
                    where,
                    skip,
                    take: limit,
                    include: {
                        series: {
                            select: {
                                id: true,
                                title: true,
                                slug: true,
                                summary: true,
                                description: true,
                                visibility: true,
                                video_length: true,
                                duration: true,
                                start_date: true,
                                end_date: true,
                                thumbnail: true,
                                total_price: true,
                                course_type: true,
                                note: true,
                                available_site: true,
                                created_at: true,
                                updated_at: true,
                                language: true,
                                courses: {
                                    select: {
                                        id: true,
                                        title: true,
                                        price: true,
                                        video_length: true,
                                        intro_video_url: true,
                                        end_video_url: true,
                                        lesson_files: {
                                            select: {
                                                id: true,
                                                title: true,
                                                url: true,
                                                doc: true,
                                                kind: true,
                                                video_length: true,
                                            },
                                            orderBy: { created_at: 'asc' },
                                        },
                                    },
                                    orderBy: { created_at: 'asc' },
                                },
                                _count: {
                                    select: {
                                        courses: true,
                                        quizzes: true,
                                        assignments: true,
                                    },
                                },
                            },
                        },
                    },
                    orderBy: { enrolled_at: 'desc' },
                }),
                this.prisma.enrollment.count({ where }),
            ]);

            // Extract series from enrollments and add enrollment info
            const series = enrollments.map(enrollment => {
                const seriesData = enrollment.series;
                return {
                    ...seriesData,
                    enrollment: {
                        id: enrollment.id,
                        enrolled_at: enrollment.enrolled_at,
                        status: enrollment.status,
                        progress_percentage: enrollment.progress_percentage,
                        last_accessed_at: enrollment.last_accessed_at,
                    },
                };
            });

            // Calculate pagination values
            const totalPages = Math.ceil(total / limit);
            const hasNextPage = page < totalPages;
            const hasPreviousPage = page > 1;

            // Add file URLs to series
            for (const seriesItem of series) {
                if (seriesItem.thumbnail) {
                    seriesItem['thumbnail_url'] = SojebStorage.url(appConfig().storageUrl.series_thumbnail + seriesItem.thumbnail);
                }

                // Add file URLs for courses
                if (seriesItem.courses && seriesItem.courses.length > 0) {
                    for (const course of seriesItem.courses) {
                        if (course.intro_video_url) {
                            course['intro_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + course.intro_video_url);
                        }
                        if (course.end_video_url) {
                            course['end_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + course.end_video_url);
                        }
                    }
                }
            }

            // Get all lesson progress for all series to determine lock/unlock status
            const allLessonIds = series.flatMap(s =>
                s.courses?.flatMap(c => c.lesson_files?.map(l => l.id) || []) || []
            );

            if (allLessonIds.length > 0) {
                const allLessonProgress = await this.prisma.lessonProgress.findMany({
                    where: {
                        user_id: userId,
                        lesson_id: { in: allLessonIds },
                        deleted_at: null,
                    },
                    select: {
                        lesson_id: true,
                        id: true,
                        is_completed: true,
                        is_viewed: true,
                        completed_at: true,
                        viewed_at: true,
                        time_spent: true,
                        last_position: true,
                        completion_percentage: true,
                    },
                });

                // Create lookup map for efficient access
                const lessonProgressMap = new Map(allLessonProgress.map(lp => [lp.lesson_id, lp]));

                // Add lesson progress and lock/unlock status to each lesson
                for (const seriesItem of series) {
                    if (seriesItem.courses && seriesItem.courses.length > 0) {
                        for (const course of seriesItem.courses) {
                            if (course.lesson_files && course.lesson_files.length > 0) {
                                for (const lessonFile of course.lesson_files) {
                                    const lessonProgress = lessonProgressMap.get(lessonFile.id);
                                    lessonFile['lesson_progress'] = lessonProgress || null;
                                    lessonFile['is_unlocked'] = lessonProgress ? true : false;
                                }
                            }
                        }
                    }
                }
            }

            // Get lesson files count for each series
            const allSeriesIds = series.map(s => s.id);
            const lessonCounts = await this.prisma.lessonFile.groupBy({
                by: ['course_id'],
                where: {
                    course: {
                        series_id: { in: allSeriesIds },
                        deleted_at: null,
                    },
                    deleted_at: null,
                    kind: 'video',
                },
                _count: {
                    id: true,
                },
            });

            // Get course IDs for each series to map lesson counts
            const seriesCourseMap = new Map();
            for (const seriesItem of series) {
                if (seriesItem.courses) {
                    seriesCourseMap.set(seriesItem.id, seriesItem.courses.map(c => c.id));
                }
            }

            // Add lesson files count to each series
            for (const seriesItem of series) {
                const seriesCourseIds = seriesCourseMap.get(seriesItem.id) || [];
                const totalLessonFiles = lessonCounts
                    .filter(lc => seriesCourseIds.includes(lc.course_id))
                    .reduce((total, lc) => total + lc._count.id, 0);

                (seriesItem._count as any).lesson_files = totalLessonFiles;
            }

            return {
                success: true,
                message: 'Enrolled series retrieved successfully',
                data: {
                    series,
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
            this.logger.error(`Error fetching enrolled series: ${error.message}`, error.stack);

            return {
                success: false,
                message: 'Failed to fetch enrolled series',
                error: error.message,
            };
        }
    }

    async getSeriesTitle(userId: string): Promise<SeriesResponse<any>> {
        try {
            this.logger.log(`Fetching enrolled series titles for user: ${userId}`);

            const enrollments = await this.prisma.enrollment.findMany({
                where: {
                    user_id: userId,
                    status: { in: ['ACTIVE', 'COMPLETED'] as any },
                    payment_status: 'completed',
                    deleted_at: null,
                },
                include: {
                    series: {
                        select: {
                            id: true,
                            title: true,
                            created_at: true,
                            courses: {
                                select: {
                                    id: true,
                                    title: true
                                }
                            }
                        },
                    },
                },
                orderBy: { enrolled_at: 'desc' },
            });

            // Extract series from enrollments
            const series = enrollments.map(enrollment => ({
                ...enrollment.series,
                enrollment: {
                    id: enrollment.id,
                    enrolled_at: enrollment.enrolled_at,
                    status: enrollment.status,
                    progress_percentage: enrollment.progress_percentage,
                },
            }));

            return {
                success: true,
                message: 'Enrolled series titles retrieved successfully',
                data: series,
            };
        } catch (error) {
            this.logger.error(`Error fetching enrolled series titles: ${error.message}`, error.stack);
            return {
                success: false,
                message: 'Failed to fetch enrolled series titles',
                error: error.message,
            };
        }
    }

    /**
     * Get a single enrolled series by ID
     */
    async getEnrolledSeriesById(userId: string, seriesId: string): Promise<SeriesResponse<any>> {
        try {
            this.logger.log(`Fetching enrolled series ${seriesId} for user: ${userId}`);

            // First check if user is enrolled in this series
            const enrollment = await this.prisma.enrollment.findFirst({
                where: {
                    user_id: userId,
                    series_id: seriesId,
                    status: { in: ['ACTIVE', 'COMPLETED'] as any },
                    payment_status: 'completed',
                    deleted_at: null,
                },
                include: {
                    series: {
                        select: {
                            id: true,
                            title: true,
                            slug: true,
                            summary: true,
                            description: true,
                            visibility: true,
                            video_length: true,
                            duration: true,
                            start_date: true,
                            end_date: true,
                            thumbnail: true,
                            total_price: true,
                            course_type: true,
                            note: true,
                            available_site: true,
                            created_at: true,
                            updated_at: true,
                            language: true,
                            courses: {
                                select: {
                                    id: true,
                                    title: true,
                                    price: true,
                                    video_length: true,
                                    intro_video_url: true,
                                    end_video_url: true,
                                    lesson_files: {
                                        select: {
                                            id: true,
                                            title: true,
                                            url: true,
                                            doc: true,
                                            kind: true,
                                            alt: true,
                                            video_length: true,
                                        },
                                        orderBy: { created_at: 'asc' },
                                    },
                                },
                                orderBy: { created_at: 'asc' },
                            },
                            _count: {
                                select: {
                                    courses: true,
                                    quizzes: true,
                                    assignments: true,
                                },
                            },
                        },
                    },
                },
            });

            if (!enrollment || !enrollment.series) {
                return {
                    success: false,
                    message: 'Series not found or you are not enrolled in this series',
                };
            }

            const series = enrollment.series;

            // Add enrollment information
            const seriesWithEnrollment = {
                ...series,
                enrollment: {
                    id: enrollment.id,
                    enrolled_at: enrollment.enrolled_at,
                    status: enrollment.status,
                    progress_percentage: enrollment.progress_percentage,
                    last_accessed_at: enrollment.last_accessed_at,
                },
            };

            // Add file URLs
            if (seriesWithEnrollment.thumbnail) {
                seriesWithEnrollment['thumbnail_url'] = SojebStorage.url(appConfig().storageUrl.series_thumbnail + seriesWithEnrollment.thumbnail);
            }

            // Calculate total lesson files count
            const totalLessonFiles = seriesWithEnrollment.courses?.reduce((total, course) => {
                return total + (course.lesson_files?.length || 0);
            }, 0) || 0;
            (seriesWithEnrollment._count as any).lesson_files = totalLessonFiles;

            // Add file URLs for courses and lesson files
            if (seriesWithEnrollment.courses && seriesWithEnrollment.courses.length > 0) {
                for (const course of seriesWithEnrollment.courses) {
                    if (course.intro_video_url) {
                        course['intro_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + course.intro_video_url);
                    }
                    if (course.end_video_url) {
                        course['end_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + course.end_video_url);
                    }

                }
            }

            // Optimize: Get all course and lesson progress in batch queries
            const allCourseIds = seriesWithEnrollment.courses?.map(c => c.id) || [];
            const allLessonIds = seriesWithEnrollment.courses?.flatMap(c =>
                c.lesson_files?.map(l => l.id) || []
            ) || [];

            // Get all course progress in one query
            const allCourseProgress = await this.prisma.courseProgress.findMany({
                where: {
                    user_id: userId,
                    course_id: { in: allCourseIds },
                    deleted_at: null,
                },
                select: {
                    course_id: true,
                    id: true,
                    status: true,
                    completion_percentage: true,
                    is_completed: true,
                    started_at: true,
                    completed_at: true,
                    intro_video_unlocked: true,
                    intro_video_completed: true,
                    intro_video_viewed: true,
                    intro_video_time_spent: true,
                    intro_video_last_position: true,
                    intro_video_completion_percentage: true,
                    end_video_unlocked: true,
                    end_video_completed: true,
                    end_video_viewed: true,
                    end_video_time_spent: true,
                    end_video_last_position: true,
                    end_video_completion_percentage: true,
                },
            });

            // Get all lesson progress in one query
            const allLessonProgress = await this.prisma.lessonProgress.findMany({
                where: {
                    user_id: userId,
                    lesson_id: { in: allLessonIds },
                    deleted_at: null,
                },
                select: {
                    lesson_id: true,
                    id: true,
                    is_completed: true,
                    is_viewed: true,
                    completed_at: true,
                    viewed_at: true,
                    time_spent: true,
                    last_position: true,
                    completion_percentage: true,
                },
            });

            // Create lookup maps for efficient access
            const courseProgressMap = new Map(allCourseProgress.map(cp => [cp.course_id, cp]));
            const lessonProgressMap = new Map(allLessonProgress.map(lp => [lp.lesson_id, lp]));

            // Add course progress for each course
            for (const course of seriesWithEnrollment.courses) {
                // Add course progress from map
                course['course_progress'] = courseProgressMap.get(course.id) || null;

                // Add lesson progress for each lesson
                if (course.lesson_files && course.lesson_files.length > 0) {
                    for (const lessonFile of course.lesson_files) {
                        const lessonProgress = lessonProgressMap.get(lessonFile.id);
                        lessonFile['lesson_progress'] = lessonProgress || null;
                        lessonFile['is_unlocked'] = lessonProgress ? true : false;
                    }
                }
            }

            return {
                success: true,
                message: 'Series retrieved successfully',
                data: seriesWithEnrollment,
            };
        } catch (error) {
            this.logger.error(`Error fetching series ${seriesId}: ${error.message}`, error.stack);

            return {
                success: false,
                message: 'Failed to fetch series',
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

    /**
     * Validate lesson access (enrollment, course progress, lesson progress)
     */
    private async validateLessonAccess(userId: string, lessonId: string): Promise<{ isValid: boolean; lesson?: any; courseProgress?: any; enrollment?: any; existingProgress?: any; error?: string }> {
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
                return { isValid: false, error: 'You must be enrolled in this course' };
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
                return { isValid: false, error: 'You must be enrolled in this series' };
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
                return { isValid: false, error: 'This lesson is not unlocked yet' };
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
    async markLessonAsCompleted(userId: string, lessonId: string, completionData?: {
        time_spent?: number;
        last_position?: number;
        completion_percentage?: number;
    }): Promise<SeriesResponse<any>> {
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
                    message: 'You must view the lesson before marking it as completed',
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

            // Unlock next lesson if it exists
            await this.unlockNextLesson(userId, lessonId, lesson.course.id);

            // Update course progress
            await this.updateCourseProgress(userId, lesson.course.id, lesson.course.series_id);

            // Update enrollment progress_percentage
            await this.updateEnrollmentProgress(userId, lesson.course.series_id);

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
    async updateVideoProgress(userId: string, lessonId: string, progressData: {
        time_spent?: number;
        last_position?: number;
        completion_percentage?: number;
    }): Promise<SeriesResponse<any>> {
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

            // Update progress using existing schema fields
            const progress = await this.prisma.lessonProgress.update({
                where: {
                    user_id_lesson_id: {
                        user_id: userId,
                        lesson_id: lessonId,
                    },
                },
                data: {
                    time_spent: progressData.time_spent,
                    last_position: progressData.last_position,
                    completion_percentage: progressData.completion_percentage,
                    is_viewed: progressData.completion_percentage > 0,
                    viewed_at: progressData.completion_percentage > 0 ? new Date() : undefined,
                    updated_at: new Date(),
                },
            });

            // Auto-complete lesson if 90%+ watched
            if (progressData.completion_percentage >= 90 && !progress.is_completed) {
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

            return {
                success: true,
                message: 'Video progress updated',
                data: {
                    progress,
                    auto_completed: false,
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
     * Unlock next lesson after completing current one
     */
    async unlockNextLesson(userId: string, completedLessonId: string, courseId: string): Promise<void> {
        try {
            // Get current lesson
            const currentLesson = await this.prisma.lessonFile.findFirst({
                where: { id: completedLessonId, deleted_at: null },
                select: { created_at: true },
            });

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
                // Only create a progress record for the immediate next lesson
                // This makes it "unlocked" but not completed
                // Check if lesson progress already exists
                const existingNextProgress = await this.prisma.lessonProgress.findFirst({
                    where: {
                        user_id: userId,
                        lesson_id: nextLesson.id,
                        deleted_at: null,
                    },
                });

                if (!existingNextProgress) {
                    // Create new progress record for next lesson
                    const seriesId = (await this.prisma.course.findUnique({
                        where: { id: courseId },
                        select: { series_id: true },
                    }))?.series_id || '';

                    await this.prisma.lessonProgress.create({
                        data: {
                            user_id: userId,
                            lesson_id: nextLesson.id,
                            course_id: courseId,
                            series_id: seriesId,
                            is_completed: false,
                            is_viewed: false,
                        },
                    });
                }

                // Next lesson is now unlocked (no need to update is_locked field)

                this.logger.log(`Unlocked next lesson ${nextLesson.id} for user ${userId}`);
            } else {
                // If no next lesson in current course, check if there's a next course
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
                                // Unlock first lesson of next course
                                // Check if first lesson of next course already has progress
                                const existingFirstProgress = await this.prisma.lessonProgress.findFirst({
                                    where: {
                                        user_id: userId,
                                        lesson_id: firstLessonOfNextCourse.id,
                                        deleted_at: null,
                                    },
                                });

                                if (!existingFirstProgress) {
                                    // Unlock first lesson of next course
                                    await this.prisma.lessonProgress.create({
                                        data: {
                                            user_id: userId,
                                            lesson_id: firstLessonOfNextCourse.id,
                                            course_id: nextCourse.id,
                                            series_id: currentCourse.series_id,
                                            is_completed: false,
                                            is_viewed: false,
                                        },
                                    });
                                }

                                // First lesson of next course is now unlocked (no need to update is_locked field)

                                this.logger.log(`Unlocked first lesson ${firstLessonOfNextCourse.id} of next course ${nextCourse.id} for user ${userId}`);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            this.logger.error(`Error unlocking next lesson: ${error.message}`);
        }
    }

    /**
     * Update intro video progress and auto-complete if 100% watched
     */
    async updateIntroVideoProgress(
        userId: string,
        courseId: string,
        progressData: {
            time_spent?: number;
            last_position?: number;
            completion_percentage?: number;
        }
    ): Promise<SeriesResponse<any>> {
        try {
            this.logger.log(`Updating intro video progress for course ${courseId}, user ${userId}`);

            // Validate course progress and intro video access
            const validationResult = await this.validateIntroVideoAccess(userId, courseId);
            if (!validationResult.isValid) {
                return {
                    success: false,
                    message: validationResult.error,
                    error: validationResult.error,
                };
            }

            const { courseProgress } = validationResult;

            // Update intro video progress
            const updatedProgress = await this.updateIntroVideoProgressData(userId, courseId, progressData);

            // Auto-complete intro video if 100% watched
            if (this.shouldAutoCompleteIntroVideo(progressData.completion_percentage, courseProgress.intro_video_completed)) {
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
                message: 'Intro video progress updated successfully',
                data: {
                    progress: updatedProgress,
                    auto_completed: false,
                },
            };
        } catch (error) {
            this.logger.error(`Error updating intro video progress: ${error.message}`, error.stack);
            return {
                success: false,
                message: 'Failed to update intro video progress',
                error: error.message,
            };
        }
    }

    /**
     * Validate intro video access for user
     */
    private async validateIntroVideoAccess(userId: string, courseId: string): Promise<{
        isValid: boolean;
        courseProgress?: any;
        error?: string;
    }> {
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
                error: 'You must be enrolled in this course',
            };
        }

        if (!courseProgress.intro_video_unlocked) {
            return {
                isValid: false,
                error: 'Intro video is not unlocked yet',
            };
        }

        return {
            isValid: true,
            courseProgress,
        };
    }

    /**
     * Update intro video progress data in database
     */
    private async updateIntroVideoProgressData(
        userId: string,
        courseId: string,
        progressData: {
            time_spent?: number;
            last_position?: number;
            completion_percentage?: number;
        }
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
                intro_video_viewed: progressData.completion_percentage > 0,
                updated_at: new Date(),
            } as any,
        });
    }

    /**
     * Check if intro video should be auto-completed
     */
    private shouldAutoCompleteIntroVideo(completionPercentage?: number, isAlreadyCompleted?: boolean): boolean {
        return (completionPercentage ?? 0) >= 100 && !isAlreadyCompleted;
    }

    /**
     * Update end video progress and auto-complete if 100% watched
     */
    async updateEndVideoProgress(
        userId: string,
        courseId: string,
        progressData: {
            time_spent?: number;
            last_position?: number;
            completion_percentage?: number;
        }
    ): Promise<SeriesResponse<any>> {
        try {
            this.logger.log(`Updating end video progress for course ${courseId}, user ${userId}`);

            // Validate end video access
            const validationResult = await this.validateEndVideoAccess(userId, courseId);
            if (!validationResult.isValid) {
                return {
                    success: false,
                    message: validationResult.error,
                    error: validationResult.error,
                };
            }

            const { courseProgress } = validationResult;

            // Update end video progress
            const updatedProgress = await this.updateEndVideoProgressData(userId, courseId, progressData);

            // Auto-complete end video if 100% watched
            if (this.shouldAutoCompleteEndVideo(progressData.completion_percentage, courseProgress.end_video_completed)) {
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
                message: 'End video progress updated successfully',
                data: {
                    progress: updatedProgress,
                    auto_completed: false,
                },
            };
        } catch (error) {
            this.logger.error(`Error updating end video progress: ${error.message}`, error.stack);
            return {
                success: false,
                message: 'Failed to update end video progress',
                error: error.message,
            };
        }
    }

    /**
     * Validate end video access for user
     */
    private async validateEndVideoAccess(userId: string, courseId: string): Promise<{
        isValid: boolean;
        courseProgress?: any;
        error?: string;
    }> {
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
                error: 'You must be enrolled in this course',
            };
        }

        if (!courseProgress.is_completed) {
            return {
                isValid: false,
                error: 'You must complete the course before accessing the end video',
            };
        }

        if (!courseProgress.end_video_unlocked) {
            return {
                isValid: false,
                error: 'End video is not unlocked yet',
            };
        }

        return {
            isValid: true,
            courseProgress,
        };
    }

    /**
     * Update end video progress data in database
     */
    private async updateEndVideoProgressData(
        userId: string,
        courseId: string,
        progressData: {
            time_spent?: number;
            last_position?: number;
            completion_percentage?: number;
        }
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
                end_video_viewed: progressData.completion_percentage > 0,
                updated_at: new Date(),
            } as any,
        });
    }

    /**
     * Check if end video should be auto-completed
     */
    private shouldAutoCompleteEndVideo(completionPercentage?: number, isAlreadyCompleted?: boolean): boolean {
        return (completionPercentage ?? 0) >= 100 && !isAlreadyCompleted;
    }

    /**
     * Mark intro video as completed and unlock first lesson
     */
    async markIntroVideoAsCompleted(
        userId: string,
        courseId: string,
        completionData?: {
            time_spent?: number;
            last_position?: number;
            completion_percentage?: number;
        }
    ): Promise<SeriesResponse<any>> {
        try {
            this.logger.log(`Marking intro video as completed for user ${userId} in course ${courseId}`);

            // Validate course progress
            const courseProgress = await this.getCourseProgressForUser(userId, courseId);
            if (!courseProgress) {
                return this.createErrorResponse('You must be enrolled in this course', 'Course not found');
            }

            // Mark intro video as completed
            await this.updateIntroVideoCompletionStatus(userId, courseId, completionData);

            // Unlock first lesson of the course
            const firstLessonUnlocked = await this.unlockFirstLessonAfterIntroCompletion(userId, courseId, courseProgress.series_id);

            this.logger.log(`Intro video marked as completed for user ${userId} in course ${courseId}`);

            return {
                success: true,
                message: 'Intro video marked as completed and first lesson unlocked',
                data: {
                    course_id: courseId,
                    intro_video_completed: true,
                    first_lesson_unlocked: firstLessonUnlocked,
                },
            };
        } catch (error) {
            this.logger.error(`Error marking intro video as completed: ${error.message}`, error.stack);
            return this.createErrorResponse('Failed to mark intro video as completed', error.message);
        }
    }

    /**
     * Get course progress for user
     */
    private async getCourseProgressForUser(userId: string, courseId: string) {
        return await this.prisma.courseProgress.findFirst({
            where: {
                user_id: userId,
                course_id: courseId,
                deleted_at: null,
            },
        });
    }

    /**
     * Create standardized error response
     */
    private createErrorResponse(message: string, error: string): SeriesResponse<any> {
        return {
            success: false,
            message,
            error,
        };
    }

    /**
     * Update intro video completion status
     */
    private async updateIntroVideoCompletionStatus(
        userId: string,
        courseId: string,
        completionData?: {
            time_spent?: number;
            last_position?: number;
            completion_percentage?: number;
        }
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
                intro_video_completion_percentage: completionData?.completion_percentage || 100,
                updated_at: new Date(),
            } as any,
        });
    }

    /**
     * Unlock first lesson after intro video completion
     */
    private async unlockFirstLessonAfterIntroCompletion(userId: string, courseId: string, seriesId: string): Promise<boolean> {
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

        // Check if first lesson already has progress
        const existingFirstProgress = await this.prisma.lessonProgress.findFirst({
            where: {
                user_id: userId,
                lesson_id: firstLesson.id,
                deleted_at: null,
            },
        });

        if (!existingFirstProgress) {
            // Create progress record for first lesson (unlocked but not completed)
            await this.prisma.lessonProgress.create({
                data: {
                    user_id: userId,
                    lesson_id: firstLesson.id,
                    course_id: courseId,
                    series_id: seriesId,
                    is_completed: false,
                    is_viewed: false,
                },
            });

            this.logger.log(`Unlocked first lesson ${firstLesson.id} after intro video completion for user ${userId}`);
            return true;
        }

        return true; // Already unlocked
    }

    /**
     * Mark end video as completed
     */
    async markEndVideoAsCompleted(userId: string, courseId: string, completionData?: {
        time_spent?: number;
        last_position?: number;
        completion_percentage?: number;
    }): Promise<SeriesResponse<any>> {
        try {
            this.logger.log(`Marking end video as completed for user ${userId} in course ${courseId}`);

            // Check if user has course progress
            const courseProgress = await this.prisma.courseProgress.findFirst({
                where: {
                    user_id: userId,
                    course_id: courseId,
                    deleted_at: null,
                },
            });

            if (!courseProgress) {
                return {
                    success: false,
                    message: 'You must be enrolled in this course',
                    error: 'Course not found',
                };
            }

            // Check if course is completed (end video should only be available after course completion)
            if (!courseProgress.is_completed) {
                return {
                    success: false,
                    message: 'You must complete the course before accessing the end video',
                    error: 'Course not completed',
                };
            }

            // Mark end video as completed
            await this.updateEndVideoCompletionStatus(userId, courseId, completionData);

            // Unlock next lesson after end video completion
            await this.unlockNextLesson(userId, '', courseId);

            this.logger.log(`End video marked as completed for user ${userId} in course ${courseId}`);

            return {
                success: true,
                message: 'End video marked as completed and next lesson unlocked',
                data: {
                    course_id: courseId,
                    end_video_completed: true,
                    next_lesson_unlocked: true,
                },
            };
        } catch (error) {
            this.logger.error(`Error marking end video as completed: ${error.message}`, error.stack);
            return {
                success: false,
                message: 'Failed to mark end video as completed',
                error: error.message,
            };
        }
    }

    /**
     * Update end video completion status
     */
    private async updateEndVideoCompletionStatus(
        userId: string,
        courseId: string,
        completionData?: {
            time_spent?: number;
            last_position?: number;
            completion_percentage?: number;
        }
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
                end_video_completion_percentage: completionData?.completion_percentage || 100,
                updated_at: new Date(),
            } as any,
        });
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
     * Ensure first course's intro video or first lesson is unlocked for a user
     * This should be called when a user enrolls in a series
     */
    async unlockFirstLessonForUser(userId: string, seriesId: string): Promise<void> {
        try {
            this.logger.log(`Unlocking first course content for user ${userId} in series ${seriesId}`);

            // Get all courses in the series ordered by creation time
            const courses = await this.prisma.course.findMany({
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

            if (!courses.length) {
                this.logger.warn(`No courses found for series ${seriesId}`);
                return;
            }

            // Initialize course progress for all courses in the series
            for (const course of courses) {
                await this.initializeCourseProgress(userId, course.id, seriesId);
            }

            const firstCourse = courses[0];

            // First, try to unlock intro video if it exists
            if (firstCourse.intro_video_url) {
                this.logger.log(`Unlocking intro video for first course ${firstCourse.id} for user ${userId}`);

                // Update course progress to unlock intro video
                await this.prisma.courseProgress.updateMany({
                    where: {
                        user_id: userId,
                        course_id: firstCourse.id,
                        series_id: seriesId,
                        deleted_at: null,
                    },
                    data: {
                        intro_video_unlocked: true,
                        updated_at: new Date(),
                    } as any,
                });

                this.logger.log(`Intro video unlocked for first course ${firstCourse.id} for user ${userId}`);
            } else {
                // If no intro video, unlock the first lesson file
                this.logger.log(`No intro video found, unlocking first lesson for first course ${firstCourse.id} for user ${userId}`);

                const firstLesson = await this.prisma.lessonFile.findFirst({
                    where: {
                        course_id: firstCourse.id,
                        deleted_at: null,
                    },
                    select: { id: true },
                    orderBy: { created_at: 'asc' },
                });

                if (firstLesson) {
                    // Check if first lesson already has progress
                    const existingFirstProgress = await this.prisma.lessonProgress.findFirst({
                        where: {
                            user_id: userId,
                            lesson_id: firstLesson.id,
                            deleted_at: null,
                        },
                    });

                    if (!existingFirstProgress) {
                        // Create progress record for first lesson (unlocked but not completed)
                        await this.prisma.lessonProgress.create({
                            data: {
                                user_id: userId,
                                lesson_id: firstLesson.id,
                                course_id: firstCourse.id,
                                series_id: seriesId,
                                is_completed: false,
                                is_viewed: false,
                            },
                        });

                        this.logger.log(`Unlocked first lesson ${firstLesson.id} for user ${userId} in series ${seriesId}`);
                    }
                } else {
                    this.logger.warn(`No lessons found for first course ${firstCourse.id}`);
                }
            }

            this.logger.log(`Initialized course progress for ${courses.length} courses in series ${seriesId}`);
        } catch (error) {
            this.logger.error(`Error unlocking first course content: ${error.message}`);
        }
    }

    /**
     * Initialize course progress when user enrolls
     */
    async initializeCourseProgress(userId: string, courseId: string, seriesId: string): Promise<void> {
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
     * Update course progress based on completed lessons
     */
    async updateCourseProgress(userId: string, courseId: string, seriesId: string): Promise<void> {
        try {
            this.logger.log(`Updating course progress for user ${userId} in course ${courseId}`);

            // Get all lessons in the course
            const totalLessons = await this.prisma.lessonFile.count({
                where: {
                    course_id: courseId,
                    deleted_at: null,
                },
            });

            if (totalLessons === 0) {
                this.logger.warn(`No lessons found for course ${courseId}`);
                return;
            }

            // Get completed lessons for this user in this course
            const completedLessons = await this.prisma.lessonProgress.count({
                where: {
                    user_id: userId,
                    course_id: courseId,
                    is_completed: true,
                    deleted_at: null,
                },
            });

            // Calculate completion percentage
            const completionPercentage = Math.round((completedLessons / totalLessons) * 100);
            const isCourseCompleted = completionPercentage === 100;

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
                        status: isCourseCompleted ? 'completed' : 'in_progress',
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
                        status: isCourseCompleted ? 'completed' : 'in_progress',
                        completion_percentage: completionPercentage,
                        is_completed: isCourseCompleted,
                        started_at: new Date(),
                        completed_at: isCourseCompleted ? new Date() : null,
                    },
                });
            }

            this.logger.log(`Updated course progress: ${completedLessons}/${totalLessons} lessons completed (${completionPercentage}%) - Course ${isCourseCompleted ? 'COMPLETED' : 'IN PROGRESS'}`);

            // If course is completed, unlock end video and start next course
            if (isCourseCompleted) {
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

                await this.startNextCourse(userId, courseId, seriesId);
            }
        } catch (error) {
            this.logger.error(`Error updating course progress: ${error.message}`);
        }
    }

    /**
     * Start the next course automatically when current course is completed
     */
    async startNextCourse(userId: string, completedCourseId: string, seriesId: string): Promise<void> {
        try {
            this.logger.log(`Starting next course for user ${userId} after completing course ${completedCourseId} in series ${seriesId}`);

            // Get current course
            const currentCourse = await this.prisma.course.findFirst({
                where: {
                    id: completedCourseId,
                    deleted_at: null
                },
                select: { created_at: true },
            });

            if (!currentCourse) {
                this.logger.warn(`Current course ${completedCourseId} not found`);
                return;
            }

            // Find next course in the series
            const nextCourse = await this.prisma.course.findFirst({
                where: {
                    series_id: seriesId,
                    created_at: { gt: currentCourse.created_at },
                    deleted_at: null,
                },
                select: {
                    id: true,
                    title: true,
                },
                orderBy: { created_at: 'asc' },
            });

            if (!nextCourse) {
                this.logger.log(`No next course found for user ${userId} in series ${seriesId} - All courses completed!`);
                return;
            }

            // Check if course progress already exists for next course
            const existingProgress = await this.prisma.courseProgress.findFirst({
                where: {
                    user_id: userId,
                    course_id: nextCourse.id,
                },
            });

            if (!existingProgress) {
                // Create course progress for next course
                await this.prisma.courseProgress.create({
                    data: {
                        user_id: userId,
                        course_id: nextCourse.id,
                        series_id: seriesId,
                        status: 'in_progress',
                        completion_percentage: 0,
                        is_completed: false,
                        started_at: new Date(),
                    },
                });

                this.logger.log(`Started course progress for next course: ${nextCourse.title}`);
            } else {
                // Update existing progress to in_progress if it was pending
                if (existingProgress.status === 'pending') {
                    await this.prisma.courseProgress.update({
                        where: {
                            user_id_course_id: {
                                user_id: userId,
                                course_id: nextCourse.id,
                            },
                        },
                        data: {
                            status: 'in_progress',
                            started_at: new Date(),
                            updated_at: new Date(),
                        },
                    });

                    this.logger.log(`Updated course progress to in_progress for next course: ${nextCourse.title}`);
                }
            }

            // Check if next course has intro video
            const nextCourseWithIntro = await this.prisma.course.findFirst({
                where: {
                    id: nextCourse.id,
                    deleted_at: null,
                },
                select: { id: true, title: true, intro_video_url: true },
            });

            if (nextCourseWithIntro?.intro_video_url) {
                // Unlock intro video for next course
                await this.prisma.courseProgress.updateMany({
                    where: {
                        user_id: userId,
                        course_id: nextCourse.id,
                        series_id: seriesId,
                        deleted_at: null,
                    },
                    data: {
                        intro_video_unlocked: true,
                        updated_at: new Date(),
                    } as any,
                });

                this.logger.log(`Unlocked intro video for next course: ${nextCourse.title}`);
            } else {
                // Unlock first lesson of next course
                const firstLesson = await this.prisma.lessonFile.findFirst({
                    where: {
                        course_id: nextCourse.id,
                        deleted_at: null,
                    },
                    select: { id: true, title: true },
                    orderBy: { created_at: 'asc' },
                });

                if (firstLesson) {
                    // Check if first lesson already has progress
                    const existingFirstProgress = await this.prisma.lessonProgress.findFirst({
                        where: {
                            user_id: userId,
                            lesson_id: firstLesson.id,
                            deleted_at: null,
                        },
                    });

                    if (!existingFirstProgress) {
                        // Create progress for first lesson of next course
                        await this.prisma.lessonProgress.create({
                            data: {
                                user_id: userId,
                                lesson_id: firstLesson.id,
                                course_id: nextCourse.id,
                                series_id: seriesId,
                                is_completed: false,
                                is_viewed: false,
                            },
                        });
                    }

                    this.logger.log(`Unlocked first lesson of next course: ${firstLesson.title}`);
                } else {
                    this.logger.warn(`No first lesson found for next course ${nextCourse.title}`);
                }
            }
        } catch (error) {
            this.logger.error(`Error starting next course: ${error.message}`, error.stack);
        }
    }

    /**
     * Update enrollment progress percentage based on completed lessons
     */
    async updateEnrollmentProgress(userId: string, seriesId: string): Promise<void> {
        try {
            this.logger.log(`Updating enrollment progress for user ${userId} in series ${seriesId}`);

            // Get all lessons in the series
            const totalLessons = await this.prisma.lessonFile.count({
                where: {
                    course: {
                        series_id: seriesId,
                        deleted_at: null,
                    },
                    deleted_at: null,
                },
            });

            if (totalLessons === 0) {
                this.logger.warn(`No lessons found for series ${seriesId}`);
                return;
            }

            // Get completed lessons for this user in this series
            const completedLessons = await this.prisma.lessonProgress.count({
                where: {
                    user_id: userId,
                    series_id: seriesId,
                    is_completed: true,
                    deleted_at: null,
                },
            });

            // Calculate progress percentage
            const progressPercentage = Math.round((completedLessons / totalLessons) * 100);
            const isSeriesCompleted = progressPercentage === 100;

            // Update enrollment progress
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

            this.logger.log(`Updated enrollment progress: ${completedLessons}/${totalLessons} lessons completed (${progressPercentage}%) - Enrollment ${isSeriesCompleted ? 'COMPLETED' : 'ACTIVE'}`);
        } catch (error) {
            this.logger.error(`Error updating enrollment progress: ${error.message}`);
        }
    }
    /**
     * Get a single enrolled course by ID with lesson files and progress
     */
    async findOneCourse(userId: string, courseId: string): Promise<SeriesResponse<any>> {
        try {
            this.logger.log(`Fetching enrolled course ${courseId} for user: ${userId}`);

            // First check if user is enrolled in the series that contains this course
            const enrollment = await this.prisma.enrollment.findFirst({
                where: {
                    user_id: userId,
                    status: { in: ['ACTIVE', 'COMPLETED'] as any },
                    payment_status: 'completed',
                    deleted_at: null,
                },
                include: {
                    series: {
                        select: {
                            id: true,
                            title: true,
                            slug: true,
                            courses: {
                                where: {
                                    id: courseId,
                                    deleted_at: null,
                                },
                                select: {
                                    id: true,
                                    title: true,
                                    price: true,
                                    video_length: true,
                                    created_at: true,
                                    updated_at: true,
                                    intro_video_url: true,
                                    end_video_url: true,
                                    lesson_files: {
                                        select: {
                                            id: true,
                                            title: true,
                                            url: true,
                                            doc: true,
                                            kind: true,
                                            alt: true,
                                            video_length: true,
                                        },
                                        orderBy: { created_at: 'asc' },
                                    },
                                    _count: {
                                        select: {
                                            lesson_files: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            });

            if (!enrollment || !enrollment.series.courses.length) {
                return {
                    success: false,
                    message: 'Course not found or you are not enrolled in this course',
                };
            }

            const course = enrollment.series.courses[0];

            // Add enrollment information
            const courseWithEnrollment = {
                ...course,
                series: {
                    id: enrollment.series.id,
                    title: enrollment.series.title,
                    slug: enrollment.series.slug,
                },
                enrollment: {
                    id: enrollment.id,
                    enrolled_at: enrollment.enrolled_at,
                    progress_percentage: enrollment.progress_percentage,
                    last_accessed_at: enrollment.last_accessed_at,
                },
            };

            // Add file URLs
            if (courseWithEnrollment.intro_video_url) {
                courseWithEnrollment['intro_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + courseWithEnrollment.intro_video_url);
            }
            if (courseWithEnrollment.end_video_url) {
                courseWithEnrollment['end_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + courseWithEnrollment.end_video_url);
            }

            // Add course progress for this course
            const courseProgress = await this.prisma.courseProgress.findFirst({
                where: {
                    user_id: userId,
                    course_id: courseWithEnrollment.id,
                    deleted_at: null,
                },
                select: {
                    id: true,
                    status: true,
                    completion_percentage: true,
                    is_completed: true,
                    started_at: true,
                    completed_at: true,
                    intro_video_unlocked: true,
                    intro_video_completed: true,
                    intro_video_viewed: true,
                    intro_video_time_spent: true,
                    intro_video_last_position: true,
                    intro_video_completion_percentage: true,
                    end_video_unlocked: true,
                    end_video_completed: true,
                    end_video_viewed: true,
                    end_video_time_spent: true,
                    end_video_last_position: true,
                    end_video_completion_percentage: true,
                },
            });

            courseWithEnrollment['course_progress'] = courseProgress || null;

            // Optimize: Get all lesson progress in one query
            const allLessonIds = courseWithEnrollment.lesson_files?.map(l => l.id) || [];

            if (allLessonIds.length > 0) {
                const allLessonProgress = await this.prisma.lessonProgress.findMany({
                    where: {
                        user_id: userId,
                        lesson_id: { in: allLessonIds },
                        deleted_at: null,
                    },
                    select: {
                        lesson_id: true,
                        id: true,
                        is_completed: true,
                        is_viewed: true,
                        completed_at: true,
                        viewed_at: true,
                        time_spent: true,
                        last_position: true,
                        completion_percentage: true,
                    },
                });

                // Create lookup map for efficient access
                const lessonProgressMap = new Map(allLessonProgress.map(lp => [lp.lesson_id, lp]));

                // Add lesson progress and file URLs
                if (courseWithEnrollment.lesson_files && courseWithEnrollment.lesson_files.length > 0) {
                    for (const lessonFile of courseWithEnrollment.lesson_files) {
                        const lessonProgress = lessonProgressMap.get(lessonFile.id);
                        lessonFile['lesson_progress'] = lessonProgress || null;
                        lessonFile['is_unlocked'] = lessonProgress ? true : false;
                    }
                }
            }

            return {
                success: true,
                message: 'Course retrieved successfully',
                data: courseWithEnrollment,
            };
        } catch (error) {
            this.logger.error(`Error fetching course ${courseId}: ${error.message}`, error.stack);

            return {
                success: false,
                message: 'Failed to fetch course',
                error: error.message,
            };
        }
    }

    /**
     * Get a single enrolled lesson by ID with progress
     */
    async findOneLesson(userId: string, lessonId: string): Promise<SeriesResponse<any>> {
        try {
            this.logger.log(`Fetching enrolled lesson ${lessonId} for user: ${userId}`);

            // check if lesson is viewed by user
            const isViewed = await this.prisma.lessonProgress.findFirst({
                where: {
                    user_id: userId,
                    lesson_id: lessonId,
                    deleted_at: null,
                },
            });
            if (!isViewed) {
                return {
                    success: false,
                    message: 'You can not view this lesson',
                };
            }

            this.markLessonAsViewed(userId, lessonId);

            // First check if user is enrolled in the series that contains this lesson
            const enrollment = await this.prisma.enrollment.findFirst({
                where: {
                    user_id: userId,
                    status: { in: ['ACTIVE', 'COMPLETED'] as any },
                    payment_status: 'completed',
                    deleted_at: null,
                },
                include: {
                    series: {
                        select: {
                            id: true,
                            title: true,
                            slug: true,
                            courses: {
                                select: {
                                    id: true,
                                    title: true,
                                    lesson_files: {
                                        select: {
                                            id: true,
                                            title: true,
                                            url: true,
                                            doc: true,
                                            kind: true,
                                            alt: true,
                                            video_length: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            });

            if (!enrollment || !enrollment.series.courses.length) {
                return {
                    success: false,
                    message: 'Lesson not found or you are not enrolled in this lesson',
                };
            }

            // Find the lesson in the courses
            let lesson = null;
            let course = null;
            for (const courseItem of enrollment.series.courses) {
                if (courseItem.lesson_files.length > 0) {
                    lesson = courseItem.lesson_files[0];
                    course = {
                        id: courseItem.id,
                        title: courseItem.title,
                    };
                    break;
                }
            }

            if (!lesson) {
                return {
                    success: false,
                    message: 'Lesson not found or you are not enrolled in this lesson',
                };
            }

            // Lesson unlock status is now determined by lesson progress, not is_locked field

            // Add course, series, and enrollment information
            const lessonWithContext = {
                ...lesson,
                course,
                series: {
                    id: enrollment.series.id,
                    title: enrollment.series.title,
                    slug: enrollment.series.slug,
                },
                enrollment: {
                    id: enrollment.id,
                    enrolled_at: enrollment.enrolled_at,
                    progress_percentage: enrollment.progress_percentage,
                    last_accessed_at: enrollment.last_accessed_at,
                },
            };

            // Add file URLs
            if (lessonWithContext.url) {
                lessonWithContext['file_url'] = SojebStorage.url(appConfig().storageUrl.lesson_file + lessonWithContext.url);
            }
            if (lessonWithContext.doc) {
                lessonWithContext['doc_url'] = SojebStorage.url(appConfig().storageUrl.doc_file + lessonWithContext.doc);
            }

            // Get lesson progress for this user
            const progress = await this.prisma.lessonProgress.findFirst({
                where: {
                    user_id: userId,
                    lesson_id: lessonId,
                    deleted_at: null,
                },
                select: {
                    id: true,
                    is_completed: true,
                    is_viewed: true,
                    completed_at: true,
                    viewed_at: true,
                    time_spent: true,
                    last_position: true,
                    completion_percentage: true,
                },
            });

            lessonWithContext['progress'] = progress || null;
            lessonWithContext['is_unlocked'] = progress ? true : false; // If progress exists, lesson is unlocked

            // call view lesson
            this.markLessonAsViewed(userId, lessonId);
            return {
                success: true,
                message: 'Lesson retrieved successfully',
                data: lessonWithContext,
            };
        } catch (error) {
            this.logger.error(`Error fetching lesson ${lessonId}: ${error.message}`, error.stack);

            return {
                success: false,
                message: 'Failed to fetch lesson',
                error: error.message,
            };
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

    /**
     * Get all watched lessons for a user across all enrolled series
     */
    async getAllWatchedLessons(userId: string, page: number = 1, limit: number = 10): Promise<SeriesResponse<{ watchedLessons: any[]; pagination: any }>> {
        try {
            this.logger.log(`Fetching all watched lessons for user: ${userId}`);

            const skip = (page - 1) * limit;

            // Get all watched lessons with pagination
            const [watchedLessons, total] = await Promise.all([
                this.prisma.lessonProgress.findMany({
                    where: {
                        user_id: userId,
                        is_viewed: true,
                        viewed_at: { not: null },
                        deleted_at: null,
                    },
                    orderBy: {
                        viewed_at: 'desc',
                    },
                    skip,
                    take: limit,
                    include: {
                        lesson: {
                            select: {
                                id: true,
                                title: true,
                                url: true,
                                doc: true,
                                kind: true,
                                alt: true,
                                video_length: true,
                                course: {
                                    select: {
                                        id: true,
                                        title: true,
                                        series: {
                                            select: {
                                                id: true,
                                                title: true,
                                                slug: true,
                                                thumbnail: true,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                }),
                this.prisma.lessonProgress.count({
                    where: {
                        user_id: userId,
                        is_viewed: true,
                        viewed_at: { not: null },
                        deleted_at: null,
                    },
                }),
            ]);

            if (!watchedLessons.length) {
                return {
                    success: false,
                    message: 'No watched lessons found',
                    data: {
                        watchedLessons: [],
                        pagination: {
                            total: 0,
                            page,
                            limit,
                            totalPages: 0,
                            hasNextPage: false,
                            hasPreviousPage: false,
                        },
                    },
                };
            }

            // Get unique series IDs from watched lessons
            const seriesIds = [...new Set(watchedLessons.map(wl => wl.lesson.course.series.id))];

            // Get all enrollments for these series
            const enrollments = await this.prisma.enrollment.findMany({
                where: {
                    user_id: userId,
                    series_id: { in: seriesIds },
                    status: { in: ['ACTIVE', 'COMPLETED'] as any },
                    payment_status: 'completed',
                    deleted_at: null,
                },
                select: {
                    id: true,
                    series_id: true,
                    enrolled_at: true,
                    status: true,
                    progress_percentage: true,
                    last_accessed_at: true,
                },
            });

            // Create enrollment lookup map
            const enrollmentMap = new Map(enrollments.map(enrollment => [enrollment.series_id, enrollment]));

            // Process watched lessons data
            const processedWatchedLessons = watchedLessons.map(watchedLesson => {
                const lesson = watchedLesson.lesson;
                const course = lesson.course;
                const series = course.series;
                const enrollment = enrollmentMap.get(series.id);

                // Skip lessons from series where user is no longer enrolled
                if (!enrollment) {
                    return null;
                }

                return {
                    lesson: {
                        id: lesson.id,
                        title: lesson.title,
                        video_length: lesson.video_length,
                        file_url: lesson.url ? SojebStorage.url(appConfig().storageUrl.lesson_file + lesson.url) : null,
                        doc_url: lesson.doc ? SojebStorage.url(appConfig().storageUrl.doc_file + lesson.doc) : null,
                    },
                    course: {
                        id: course.id,
                        title: course.title,
                    },
                    series: {
                        id: series.id,
                        title: series.title,
                        slug: series.slug,
                        thumbnail: series.thumbnail ? SojebStorage.url(appConfig().storageUrl.series_thumbnail + series.thumbnail) : null,
                    },
                    enrollment: {
                        id: enrollment.id,
                        enrolled_at: enrollment.enrolled_at,
                        status: enrollment.status,
                        progress_percentage: enrollment.progress_percentage,
                        last_accessed_at: enrollment.last_accessed_at,
                    },
                    progress: {
                        id: watchedLesson.id,
                        is_completed: watchedLesson.is_completed,
                        is_viewed: watchedLesson.is_viewed,
                        completed_at: watchedLesson.completed_at,
                        viewed_at: watchedLesson.viewed_at,
                        time_spent: watchedLesson.time_spent,
                        last_position: watchedLesson.last_position,
                        completion_percentage: watchedLesson.completion_percentage,
                    },
                };
            }).filter(Boolean); // Remove null entries

            // Calculate pagination values
            const totalPages = Math.ceil(total / limit);
            const hasNextPage = page < totalPages;
            const hasPreviousPage = page > 1;

            return {
                success: true,
                message: 'All watched lessons retrieved successfully',
                data: {
                    watchedLessons: processedWatchedLessons,
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
            this.logger.error(`Error fetching all watched lessons: ${error.message}`, error.stack);
            return {
                success: false,
                message: 'Failed to fetch watched lessons',
                error: error.message,
            };
        }
    }

    /**
     * Get last watched lesson for a user across all enrolled series
     */
    async getLastWatchedLesson(userId: string): Promise<SeriesResponse<any>> {
        try {
            this.logger.log(`Fetching last watched lesson for user: ${userId}`);

            // Get the most recently viewed lesson
            const lastWatchedLesson = await this.prisma.lessonProgress.findFirst({
                where: {
                    user_id: userId,
                    is_viewed: true,
                    viewed_at: { not: null },
                    deleted_at: null,
                },
                orderBy: {
                    viewed_at: 'desc',
                },
                include: {
                    lesson: {
                        select: {
                            id: true,
                            title: true,
                            url: true,
                            doc: true,
                            kind: true,
                            alt: true,
                            video_length: true,
                            course: {
                                select: {
                                    id: true,
                                    title: true,
                                    series: {
                                        select: {
                                            id: true,
                                            title: true,
                                            slug: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            });

            if (!lastWatchedLesson || !lastWatchedLesson.lesson) {
                return {
                    success: false,
                    message: 'No watched lessons found',
                    data: null,
                };
            }

            const lesson = lastWatchedLesson.lesson;
            const course = lesson.course;
            const series = course.series;

            // Check if user is still enrolled in this series
            const enrollment = await this.prisma.enrollment.findFirst({
                where: {
                    user_id: userId,
                    series_id: series.id,
                    status: { in: ['ACTIVE', 'COMPLETED'] as any },
                    payment_status: 'completed',
                    deleted_at: null,
                },
                select: {
                    id: true,
                    enrolled_at: true,
                    status: true,
                    progress_percentage: true,
                    last_accessed_at: true,
                },
            });

            if (!enrollment) {
                return {
                    success: false,
                    message: 'You are no longer enrolled in this series',
                    data: null,
                };
            }

            // Prepare response data
            const lastWatchedData = {
                lesson: {
                    id: lesson.id,
                    title: lesson.title,
                    video_length: lesson.video_length,
                    file_url: lesson.url ? SojebStorage.url(appConfig().storageUrl.lesson_file + lesson.url) : null,
                    doc_url: lesson.doc ? SojebStorage.url(appConfig().storageUrl.doc_file + lesson.doc) : null,
                },
                course: {
                    id: course.id,
                    title: course.title,
                },
                series: {
                    id: series.id,
                    title: series.title,
                    slug: series.slug,
                },
                enrollment: {
                    id: enrollment.id,
                    enrolled_at: enrollment.enrolled_at,
                    status: enrollment.status,
                    progress_percentage: enrollment.progress_percentage,
                    last_accessed_at: enrollment.last_accessed_at,
                },
                progress: {
                    id: lastWatchedLesson.id,
                    is_completed: lastWatchedLesson.is_completed,
                    is_viewed: lastWatchedLesson.is_viewed,
                    completed_at: lastWatchedLesson.completed_at,
                    viewed_at: lastWatchedLesson.viewed_at,
                    time_spent: lastWatchedLesson.time_spent,
                    last_position: lastWatchedLesson.last_position,
                    completion_percentage: lastWatchedLesson.completion_percentage,
                },
            };

            return {
                success: true,
                message: 'Last watched lesson retrieved successfully',
                data: lastWatchedData,
            };
        } catch (error) {
            this.logger.error(`Error fetching last watched lesson: ${error.message}`, error.stack);
            return {
                success: false,
                message: 'Failed to fetch last watched lesson',
                error: error.message,
            };
        }
    }
}
