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
                                language: {
                                    select: {
                                        id: true,
                                        name: true,
                                        code: true,
                                    },
                                },
                                courses: {
                                    select: {
                                        id: true,
                                        title: true,
                                        position: true,
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
                                                position: true,
                                                video_length: true,
                                            },
                                            orderBy: { position: 'asc' },
                                        },
                                    },
                                    orderBy: { position: 'asc' },
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

            // Add file URLs and progress data to all series
            for (const seriesItem of series) {
                if (seriesItem.thumbnail) {
                    seriesItem['thumbnail_url'] = SojebStorage.url(appConfig().storageUrl.series_thumbnail + seriesItem.thumbnail);
                }

                // Calculate total lesson files count
                const totalLessonFiles = seriesItem.courses?.reduce((total, course) => {
                    return total + (course.lesson_files?.length || 0);
                }, 0) || 0;
                (seriesItem._count as any).lesson_files = totalLessonFiles;

                // Add file URLs for courses and lesson files, plus progress data
                if (seriesItem.courses && seriesItem.courses.length > 0) {
                    for (const course of seriesItem.courses) {
                        if (course.intro_video_url) {
                            course['intro_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + course.intro_video_url);
                        }
                        if (course.end_video_url) {
                            course['end_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + course.end_video_url);
                        }

                        if (course.lesson_files && course.lesson_files.length > 0) {
                            for (const lessonFile of course.lesson_files) {
                                if (lessonFile.url) {
                                    lessonFile['file_url'] = SojebStorage.url(appConfig().storageUrl.lesson_file + lessonFile.url);
                                }
                                if (lessonFile.doc) {
                                    lessonFile['doc_url'] = SojebStorage.url(appConfig().storageUrl.doc_file + lessonFile.doc);
                                }
                            }
                        }
                    }
                }
            }

            // Add course and lesson progress for each series
            for (const seriesItem of series) {
                if (seriesItem.courses && seriesItem.courses.length > 0) {
                    for (const course of seriesItem.courses) {
                        // Add course progress
                        const courseProgress = await this.prisma.courseProgress.findFirst({
                            where: {
                                user_id: userId,
                                course_id: course.id,
                                deleted_at: null,
                            },
                            select: {
                                id: true,
                                status: true,
                                completion_percentage: true,
                                is_completed: true,
                                started_at: true,
                                completed_at: true,
                            },
                        });

                        course['course_progress'] = courseProgress || null;

                        // Add lesson progress for each lesson
                        if (course.lesson_files && course.lesson_files.length > 0) {
                            for (const lessonFile of course.lesson_files) {
                                const lessonProgress = await this.prisma.lessonProgress.findFirst({
                                    where: {
                                        user_id: userId,
                                        lesson_id: lessonFile.id,
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

                                lessonFile['lesson_progress'] = lessonProgress || null;
                                lessonFile['is_unlocked'] = lessonProgress ? true : false;
                            }
                        }
                    }
                }
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
                            language: {
                                select: {
                                    id: true,
                                    name: true,
                                    code: true,
                                },
                            },
                            courses: {
                                select: {
                                    id: true,
                                    title: true,
                                    position: true,
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
                                            position: true,
                                            video_length: true,
                                        },
                                        orderBy: { position: 'asc' },
                                    },
                                },
                                orderBy: { position: 'asc' },
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

                    if (course.lesson_files && course.lesson_files.length > 0) {
                        for (const lessonFile of course.lesson_files) {
                            if (lessonFile.url) {
                                lessonFile['file_url'] = SojebStorage.url(appConfig().storageUrl.lesson_file + lessonFile.url);
                            }
                            if (lessonFile.doc) {
                                lessonFile['doc_url'] = SojebStorage.url(appConfig().storageUrl.doc_file + lessonFile.doc);
                            }
                        }
                    }
                }
            }

            // Add course progress for each course
            for (const course of seriesWithEnrollment.courses) {
                const courseProgress = await this.prisma.courseProgress.findFirst({
                    where: {
                        user_id: userId,
                        course_id: course.id,
                        deleted_at: null,
                    },
                    select: {
                        id: true,
                        status: true,
                        completion_percentage: true,
                        is_completed: true,
                        started_at: true,
                        completed_at: true,
                    },
                });

                course['course_progress'] = courseProgress || null;

                // Add lesson progress for each lesson
                if (course.lesson_files && course.lesson_files.length > 0) {
                    for (const lessonFile of course.lesson_files) {
                        const lessonProgress = await this.prisma.lessonProgress.findFirst({
                            where: {
                                user_id: userId,
                                lesson_id: lessonFile.id,
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
     * Check if a lesson is unlocked for a user
     */
    async isLessonUnlocked(userId: string, lessonId: string, allLessons: any[], userProgress: any[]): Promise<boolean> {
        try {
            // Find the current lesson
            const currentLesson = allLessons.find(lesson => lesson.id === lessonId);
            if (!currentLesson) return false;

            // First lesson of the first course is always unlocked
            if (currentLesson.position === 0) return true;

            // Find the previous lesson
            const previousLesson = allLessons.find(lesson => lesson.position === currentLesson.position - 1);
            if (!previousLesson) return false; // Changed from true to false - if no previous lesson, it's locked

            // Check if previous lesson is completed
            const previousProgress = userProgress.find(p => p.lesson_id === previousLesson.id);
            return previousProgress ? previousProgress.is_completed : false;
        } catch (error) {
            this.logger.error(`Error checking lesson unlock status: ${error.message}`);
            return false;
        }
    }

    /**
     * Mark lesson as viewed
     */
    async markLessonAsViewed(userId: string, lessonId: string): Promise<SeriesResponse<any>> {
        try {
            this.logger.log(`Marking lesson ${lessonId} as viewed for user ${userId}`);

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
                return {
                    success: false,
                    message: 'Lesson not found',
                };
            }

            // Upsert lesson progress
            const progress = await this.prisma.lessonProgress.upsert({
                where: {
                    user_id_lesson_id: {
                        user_id: userId,
                        lesson_id: lessonId,
                    },
                },
                update: {
                    is_viewed: true,
                    viewed_at: new Date(),
                    updated_at: new Date(),
                },
                create: {
                    user_id: userId,
                    lesson_id: lessonId,
                    course_id: lesson.course.id,
                    series_id: lesson.course.series_id,
                    is_viewed: true,
                    viewed_at: new Date(),
                },
            });

            // Update course progress to in_progress if it's still pending
            await this.updateCourseProgressStatus(userId, lesson.course.id, lesson.course.series_id, 'in_progress');

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
                return {
                    success: false,
                    message: 'Lesson not found',
                };
            }

            // Upsert lesson progress
            const progress = await this.prisma.lessonProgress.upsert({
                where: {
                    user_id_lesson_id: {
                        user_id: userId,
                        lesson_id: lessonId,
                    },
                },
                update: {
                    is_completed: true,
                    is_viewed: true,
                    completed_at: new Date(),
                    viewed_at: new Date(),
                    time_spent: completionData?.time_spent,
                    last_position: completionData?.last_position,
                    completion_percentage: completionData?.completion_percentage || 100,
                    updated_at: new Date(),
                },
                create: {
                    user_id: userId,
                    lesson_id: lessonId,
                    course_id: lesson.course.id,
                    series_id: lesson.course.series_id,
                    is_completed: true,
                    is_viewed: true,
                    completed_at: new Date(),
                    viewed_at: new Date(),
                    time_spent: completionData?.time_spent,
                    last_position: completionData?.last_position,
                    completion_percentage: completionData?.completion_percentage || 100,
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
     * Unlock next lesson after completing current one
     */
    async unlockNextLesson(userId: string, completedLessonId: string, courseId: string): Promise<void> {
        try {
            // Get current lesson position
            const currentLesson = await this.prisma.lessonFile.findFirst({
                where: { id: completedLessonId, deleted_at: null },
                select: { position: true },
            });

            if (!currentLesson) return;

            // Find next lesson in the same course
            const nextLesson = await this.prisma.lessonFile.findFirst({
                where: {
                    course_id: courseId,
                    position: currentLesson.position + 1,
                    deleted_at: null,
                },
                select: { id: true },
            });

            if (nextLesson) {
                // Only create a progress record for the immediate next lesson
                // This makes it "unlocked" but not completed
                await this.prisma.lessonProgress.upsert({
                    where: {
                        user_id_lesson_id: {
                            user_id: userId,
                            lesson_id: nextLesson.id,
                        },
                    },
                    update: {
                        // Keep existing progress - don't overwrite if already exists
                    },
                    create: {
                        user_id: userId,
                        lesson_id: nextLesson.id,
                        course_id: courseId,
                        series_id: (await this.prisma.course.findUnique({
                            where: { id: courseId },
                            select: { series_id: true },
                        }))?.series_id || '',
                        is_completed: false,
                        is_viewed: false,
                    },
                });

                // Next lesson is now unlocked (no need to update is_locked field)

                this.logger.log(`Unlocked next lesson ${nextLesson.id} for user ${userId}`);
            } else {
                // If no next lesson in current course, check if there's a next course
                const currentCourse = await this.prisma.course.findFirst({
                    where: { id: courseId, deleted_at: null },
                    select: { position: true, series_id: true },
                });

                if (currentCourse) {
                    // Find next course in the series
                    const nextCourse = await this.prisma.course.findFirst({
                        where: {
                            series_id: currentCourse.series_id,
                            position: currentCourse.position + 1,
                            deleted_at: null,
                        },
                        select: { id: true },
                    });

                    if (nextCourse) {
                        // Find first lesson of next course
                        const firstLessonOfNextCourse = await this.prisma.lessonFile.findFirst({
                            where: {
                                course_id: nextCourse.id,
                                position: 0,
                                deleted_at: null,
                            },
                            select: { id: true },
                        });

                        if (firstLessonOfNextCourse) {
                            // Unlock first lesson of next course
                            await this.prisma.lessonProgress.upsert({
                                where: {
                                    user_id_lesson_id: {
                                        user_id: userId,
                                        lesson_id: firstLessonOfNextCourse.id,
                                    },
                                },
                                update: {
                                    // Keep existing progress
                                },
                                create: {
                                    user_id: userId,
                                    lesson_id: firstLessonOfNextCourse.id,
                                    course_id: nextCourse.id,
                                    series_id: currentCourse.series_id,
                                    is_completed: false,
                                    is_viewed: false,
                                },
                            });

                            // First lesson of next course is now unlocked (no need to update is_locked field)

                            this.logger.log(`Unlocked first lesson ${firstLessonOfNextCourse.id} of next course ${nextCourse.id} for user ${userId}`);
                        }
                    }
                }
            }
        } catch (error) {
            this.logger.error(`Error unlocking next lesson: ${error.message}`);
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
                            position: true,
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
     * Ensure first lesson of first course is unlocked for a user
     * This should be called when a user enrolls in a series
     */
    async unlockFirstLessonForUser(userId: string, seriesId: string): Promise<void> {
        try {
            this.logger.log(`Unlocking first lesson for user ${userId} in series ${seriesId}`);

            // Get all courses in the series ordered by position
            const courses = await this.prisma.course.findMany({
                where: {
                    series_id: seriesId,
                    deleted_at: null,
                },
                orderBy: { position: 'asc' },
                select: { id: true, position: true },
            });

            if (!courses.length) {
                this.logger.warn(`No courses found for series ${seriesId}`);
                return;
            }

            // Initialize course progress for all courses in the series
            for (const course of courses) {
                await this.initializeCourseProgress(userId, course.id, seriesId);
            }

            // Find the first lesson in the first course
            const firstCourse = courses[0];
            const firstLesson = await this.prisma.lessonFile.findFirst({
                where: {
                    course_id: firstCourse.id,
                    position: 0,
                    deleted_at: null,
                },
                select: { id: true },
            });

            if (!firstLesson) {
                this.logger.warn(`No lessons found for first course ${firstCourse.id}`);
                return;
            }

            // Create progress record for first lesson (unlocked but not completed)
            await this.prisma.lessonProgress.upsert({
                where: {
                    user_id_lesson_id: {
                        user_id: userId,
                        lesson_id: firstLesson.id,
                    },
                },
                update: {
                    // Keep existing progress
                },
                create: {
                    user_id: userId,
                    lesson_id: firstLesson.id,
                    course_id: firstCourse.id,
                    series_id: seriesId,
                    is_completed: false,
                    is_viewed: false,
                },
            });

            this.logger.log(`Unlocked first lesson ${firstLesson.id} for user ${userId} in series ${seriesId}`);
            this.logger.log(`Initialized course progress for ${courses.length} courses in series ${seriesId}`);
        } catch (error) {
            this.logger.error(`Error unlocking first lesson: ${error.message}`);
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
            await this.prisma.courseProgress.upsert({
                where: {
                    user_id_course_id: {
                        user_id: userId,
                        course_id: courseId,
                    },
                },
                update: {
                    status: status,
                    updated_at: new Date(),
                },
                create: {
                    user_id: userId,
                    course_id: courseId,
                    series_id: seriesId,
                    status: status,
                    completion_percentage: 0,
                    is_completed: false,
                    started_at: new Date(),
                },
            });
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

            // Upsert course progress
            await this.prisma.courseProgress.upsert({
                where: {
                    user_id_course_id: {
                        user_id: userId,
                        course_id: courseId,
                    },
                },
                update: {
                    status: isCourseCompleted ? 'completed' : 'in_progress',
                    completion_percentage: completionPercentage,
                    is_completed: isCourseCompleted,
                    completed_at: isCourseCompleted ? new Date() : null,
                    updated_at: new Date(),
                },
                create: {
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

            this.logger.log(`Updated course progress: ${completedLessons}/${totalLessons} lessons completed (${completionPercentage}%) - Course ${isCourseCompleted ? 'COMPLETED' : 'IN PROGRESS'}`);
        } catch (error) {
            this.logger.error(`Error updating course progress: ${error.message}`);
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

            // Update enrollment progress
            await this.prisma.enrollment.updateMany({
                where: {
                    user_id: userId,
                    series_id: seriesId,
                    status: 'ACTIVE' as any,
                    payment_status: 'completed',
                    deleted_at: null,
                },
                data: {
                    progress_percentage: progressPercentage,
                    status: 'COMPLETED' as any,
                    last_accessed_at: new Date(),
                    updated_at: new Date(),
                },
            });

            this.logger.log(`Updated enrollment progress: ${completedLessons}/${totalLessons} lessons completed (${progressPercentage}%)`);
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
                                    position: true,
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
                                            position: true,
                                            video_length: true,
                                        },
                                        orderBy: { position: 'asc' },
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
                },
            });

            courseWithEnrollment['course_progress'] = courseProgress || null;

            // Add lesson progress and file URLs
            if (courseWithEnrollment.lesson_files && courseWithEnrollment.lesson_files.length > 0) {
                for (const lessonFile of courseWithEnrollment.lesson_files) {
                    if (lessonFile.url) {
                        lessonFile['file_url'] = SojebStorage.url(appConfig().storageUrl.lesson_file + lessonFile.url);
                    }
                    if (lessonFile.doc) {
                        lessonFile['doc_url'] = SojebStorage.url(appConfig().storageUrl.doc_file + lessonFile.doc);
                    }

                    // Get lesson progress for this specific lesson
                    const lessonProgress = await this.prisma.lessonProgress.findFirst({
                        where: {
                            user_id: userId,
                            lesson_id: lessonFile.id,
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

                    lessonFile['lesson_progress'] = lessonProgress || null;
                    lessonFile['is_unlocked'] = lessonProgress ? true : false;
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
                                    position: true,
                                    lesson_files: {
                                        select: {
                                            id: true,
                                            title: true,
                                            url: true,
                                            doc: true,
                                            kind: true,
                                            alt: true,
                                            position: true,
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
                        position: courseItem.position,
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
                            position: true,
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
                            position: true,
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
                        position: 'asc',
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
}
