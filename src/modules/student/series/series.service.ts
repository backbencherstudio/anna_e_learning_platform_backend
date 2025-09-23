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

            // Base where clause for enrolled series with completed payment
            const enrollmentWhere = {
                user_id: userId,
                status: 'ACTIVE' as any,
                payment_status: 'completed',
                deleted_at: null,
            };

            // Search condition for series
            const seriesWhere = search ? {
                OR: [
                    { title: { contains: search, mode: 'insensitive' as any } },
                    { summary: { contains: search, mode: 'insensitive' as any } },
                    { description: { contains: search, mode: 'insensitive' as any } },
                ],
            } : {};

            // Get all enrollments first (no pagination at DB level when search is used)
            const enrollments = await this.prisma.enrollment.findMany({
                where: enrollmentWhere,
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
                                            kind: true,
                                            alt: true,
                                            position: true,
                                            video_length: true,
                                            is_locked: true,
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
            });

            // Filter series based on search if provided
            let filteredEnrollments = enrollments;
            if (search) {
                filteredEnrollments = enrollments.filter(enrollment => {
                    const series = enrollment.series;
                    return (
                        series.title.toLowerCase().includes(search.toLowerCase()) ||
                        (series.summary && series.summary.toLowerCase().includes(search.toLowerCase())) ||
                        (series.description && series.description.toLowerCase().includes(search.toLowerCase()))
                    );
                });
            }

            // Apply pagination to filtered results
            const total = filteredEnrollments.length;
            const paginatedEnrollments = filteredEnrollments.slice(skip, skip + limit);

            // Extract series from paginated enrollments and add enrollment info
            const series = paginatedEnrollments.map(enrollment => {
                const seriesData = enrollment.series;
                return {
                    ...seriesData,
                    enrollment: {
                        id: enrollment.id,
                        enrolled_at: enrollment.enrolled_at,
                        progress_percentage: enrollment.progress_percentage,
                        last_accessed_at: enrollment.last_accessed_at,
                    },
                };
            });

            // Calculate pagination values
            const totalPages = Math.ceil(total / limit);
            const hasNextPage = page < totalPages;
            const hasPreviousPage = page > 1;

            // Add file URLs and lesson progress to all series
            for (const seriesItem of series) {
                if (seriesItem.thumbnail) {
                    seriesItem['thumbnail_url'] = SojebStorage.url(appConfig().storageUrl.series_thumbnail + seriesItem.thumbnail);
                }

                // Calculate total lesson files count
                const totalLessonFiles = seriesItem.courses?.reduce((total, course) => {
                    return total + (course.lesson_files?.length || 0);
                }, 0) || 0;
                (seriesItem._count as any).lesson_files = totalLessonFiles;

                if (seriesItem.courses && seriesItem.courses.length > 0) {
                    for (const course of seriesItem.courses) {
                        if (course.lesson_files && course.lesson_files.length > 0) {
                            // Get lesson progress for this user and course
                            const lessonProgress = await this.getLessonProgressForCourse(userId, course.id);

                            for (const lessonFile of course.lesson_files) {
                                if (lessonFile.url) {
                                    lessonFile['file_url'] = SojebStorage.url(appConfig().storageUrl.lesson_file + lessonFile.url);
                                }

                                // Check if lesson is unlocked for this user
                                const progress = lessonProgress.find(p => p.lesson_id === lessonFile.id);
                                lessonFile['is_unlocked'] = await this.isLessonUnlocked(userId, lessonFile.id, course.lesson_files, lessonProgress);
                                lessonFile['progress'] = progress || null;
                            }
                        }
                        if (course.intro_video_url) {
                            course['intro_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + course.intro_video_url);
                        }
                        if (course.end_video_url) {
                            course['end_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + course.end_video_url);
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

                // update lesson is_locked to false
                await this.prisma.lessonFile.update({
                    where: { id: nextLesson.id },
                    data: { is_locked: false },
                });

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

                            // update lesson is_locked to false
                            await this.prisma.lessonFile.update({
                                where: { id: firstLessonOfNextCourse.id },
                                data: { is_locked: false },
                            });

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
                            is_locked: true,
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

            // Find the first course in the series
            const firstCourse = await this.prisma.course.findFirst({
                where: {
                    series_id: seriesId,
                    deleted_at: null,
                },
                orderBy: { position: 'asc' },
                select: { id: true },
            });

            if (!firstCourse) {
                this.logger.warn(`No courses found for series ${seriesId}`);
                return;
            }

            // Find the first lesson in the first course
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
            // update lesson is_locked to false
            await this.prisma.lessonFile.update({
                where: { id: firstLesson.id },
                data: { is_locked: false },
            });

            this.logger.log(`Unlocked first lesson ${firstLesson.id} for user ${userId}`);
        } catch (error) {
            this.logger.error(`Error unlocking first lesson: ${error.message}`);
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
     * Get all enrolled courses for a user with lesson files and progress
     */
    async findAllCourses(userId: string, seriesId?: string, page: number = 1, limit: number = 10): Promise<SeriesResponse<{ courses: any[]; pagination: any }>> {
        try {
            this.logger.log(`Fetching enrolled courses for user: ${userId}`);

            const skip = (page - 1) * limit;

            // Base where clause for enrolled courses
            const enrollmentWhere = {
                user_id: userId,
                status: 'ACTIVE' as any,
                payment_status: 'completed',
                deleted_at: null,
            };

            // Series filter for enrollment
            const seriesWhere = seriesId ? {
                series_id: seriesId,
            } : {};

            const enrollments = await this.prisma.enrollment.findMany({
                where: {
                    ...enrollmentWhere,
                    ...seriesWhere,
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
                                            is_locked: true,
                                        },
                                        orderBy: { position: 'asc' },
                                    },
                                    _count: {
                                        select: {
                                            lesson_files: true,
                                        },
                                    },
                                },
                                orderBy: { position: 'asc' },
                            },
                        },
                    },
                },
                orderBy: { enrolled_at: 'desc' },
            });

            // Extract courses from enrollments
            const allCourses = enrollments.flatMap(enrollment =>
                enrollment.series.courses.map(course => ({
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
                }))
            );

            // Apply pagination to courses
            const total = allCourses.length;
            const courses = allCourses.slice(skip, skip + limit);

            // Add file URLs and lesson progress to all courses
            for (const course of courses) {
                if (course.intro_video_url) {
                    course['intro_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + course.intro_video_url);
                }
                if (course.end_video_url) {
                    course['end_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + course.end_video_url);
                }

                if (course.lesson_files && course.lesson_files.length > 0) {
                    // Get lesson progress for this user and course
                    const lessonProgress = await this.getLessonProgressForCourse(userId, course.id);

                    for (const lessonFile of course.lesson_files) {
                        if (lessonFile.url) {
                            lessonFile['file_url'] = SojebStorage.url(appConfig().storageUrl.lesson_file + lessonFile.url);
                        }
                        if (lessonFile.doc) {
                            lessonFile['doc_url'] = SojebStorage.url(appConfig().storageUrl.doc_file + lessonFile.doc);
                        }

                        // Check if lesson is unlocked for this user
                        const progress = lessonProgress.find(p => p.lesson_id === lessonFile.id);
                        lessonFile['is_unlocked'] = await this.isLessonUnlocked(userId, lessonFile.id, course.lesson_files, lessonProgress);
                        lessonFile['progress'] = progress || null;
                    }
                }
            }

            // Calculate pagination values
            const totalPages = Math.ceil(total / limit);
            const hasNextPage = page < totalPages;
            const hasPreviousPage = page > 1;

            return {
                success: true,
                message: 'Courses retrieved successfully',
                data: {
                    courses,
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
            this.logger.error(`Error fetching courses: ${error.message}`, error.stack);

            return {
                success: false,
                message: 'Failed to fetch courses',
                error: error.message,
            };
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
                    status: 'ACTIVE' as any,
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
                                            is_locked: true,
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

            // Add lesson progress and file URLs
            if (courseWithEnrollment.lesson_files && courseWithEnrollment.lesson_files.length > 0) {
                // Get lesson progress for this user and course
                const lessonProgress = await this.getLessonProgressForCourse(userId, courseWithEnrollment.id);

                for (const lessonFile of courseWithEnrollment.lesson_files) {
                    if (lessonFile.url) {
                        lessonFile['file_url'] = SojebStorage.url(appConfig().storageUrl.lesson_file + lessonFile.url);
                    }
                    if (lessonFile.doc) {
                        lessonFile['doc_url'] = SojebStorage.url(appConfig().storageUrl.doc_file + lessonFile.doc);
                    }

                    // Check if lesson is unlocked for this user
                    const progress = lessonProgress.find(p => p.lesson_id === lessonFile.id);
                    lessonFile['is_unlocked'] = await this.isLessonUnlocked(userId, lessonFile.id, courseWithEnrollment.lesson_files, lessonProgress);
                    lessonFile['progress'] = progress || null;
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
     * Get all enrolled lessons for a user with progress
     */
    async findAllLessons(userId: string, courseId?: string, seriesId?: string, page: number = 1, limit: number = 10): Promise<SeriesResponse<{ lessons: any[]; pagination: any }>> {
        try {
            this.logger.log(`Fetching enrolled lessons for user: ${userId}`);

            const skip = (page - 1) * limit;

            // Base where clause for enrolled lessons
            const enrollmentWhere = {
                user_id: userId,
                status: 'ACTIVE' as any,
                payment_status: 'completed',
                deleted_at: null,
            };

            // Series filter for enrollment
            const seriesWhere = seriesId ? {
                series_id: seriesId,
            } : {};

            const enrollments = await this.prisma.enrollment.findMany({
                where: {
                    ...enrollmentWhere,
                    ...seriesWhere,
                },
                include: {
                    series: {
                        select: {
                            id: true,
                            title: true,
                            slug: true,
                            courses: {
                                where: courseId ? { id: courseId, deleted_at: null } : { deleted_at: null },
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
                                            is_locked: true,
                                        },
                                        orderBy: { position: 'asc' },
                                    },
                                },
                                orderBy: { position: 'asc' },
                            },
                        },
                    },
                },
                orderBy: { enrolled_at: 'desc' },
            });

            // Extract lessons from enrollments
            const allLessons = enrollments.flatMap(enrollment =>
                enrollment.series.courses.flatMap(course =>
                    course.lesson_files.map(lesson => ({
                        ...lesson,
                        course: {
                            id: course.id,
                            title: course.title,
                            position: course.position,
                        },
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
                    }))
                )
            );

            // Apply pagination to lessons
            const total = allLessons.length;
            const paginatedLessons = allLessons.slice(skip, skip + limit);

            // Add file URLs and lesson progress to paginated lessons
            for (const lesson of paginatedLessons) {
                if (lesson.url) {
                    lesson['file_url'] = SojebStorage.url(appConfig().storageUrl.lesson_file + lesson.url);
                }
                if (lesson.doc) {
                    lesson['doc_url'] = SojebStorage.url(appConfig().storageUrl.doc_file + lesson.doc);
                }

                // Get lesson progress for this user
                const progress = await this.prisma.lessonProgress.findFirst({
                    where: {
                        user_id: userId,
                        lesson_id: lesson.id,
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

                lesson['progress'] = progress || null;
                lesson['is_unlocked'] = progress ? true : false; // If progress exists, lesson is unlocked
            }

            // Calculate pagination values
            const totalPages = Math.ceil(total / limit);
            const hasNextPage = page < totalPages;
            const hasPreviousPage = page > 1;

            return {
                success: true,
                message: 'Lessons retrieved successfully',
                data: {
                    lessons: paginatedLessons,
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
            this.logger.error(`Error fetching lessons: ${error.message}`, error.stack);

            return {
                success: false,
                message: 'Failed to fetch lessons',
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
                    status: 'ACTIVE' as any,
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
                                        where: {
                                            id: lessonId,
                                            deleted_at: null,
                                        },
                                        select: {
                                            id: true,
                                            title: true,
                                            url: true,
                                            doc: true,
                                            kind: true,
                                            alt: true,
                                            position: true,
                                            video_length: true,
                                            is_locked: true,
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

            // check if lesson is locked
            if (lesson.is_locked) {
                return {
                    success: false,
                    message: 'Lesson is locked',
                };
            }

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
}
