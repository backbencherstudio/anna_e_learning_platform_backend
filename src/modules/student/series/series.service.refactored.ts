import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { SojebStorage } from 'src/common/lib/Disk/SojebStorage';
import appConfig from 'src/config/app.config';
import * as fs from 'fs';
import * as path from 'path';
import { SeriesResponse } from './interfaces/series-response.interface';
import { VideoProgressData } from './types/video-progress.types';
import { VideoProgressService } from './services/video-progress.service';
import { LessonUnlockService } from './services/lesson-unlock.service';
import { CourseProgressService } from './services/course-progress.service';
import { LessonProgressService } from './services/lesson-progress.service';

@Injectable()
export class SeriesService {
    private readonly logger = new Logger(SeriesService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly videoProgressService: VideoProgressService,
        private readonly lessonUnlockService: LessonUnlockService,
        private readonly courseProgressService: CourseProgressService,
        private readonly lessonProgressService: LessonProgressService,
    ) { }

    // ==================== MAIN SERIES METHODS ====================

    /**
     * Get enrolled series for a user with pagination and search
     */
    async getEnrolledSeries(
        userId: string,
        page: number = 1,
        limit: number = 10,
        search?: string
    ): Promise<SeriesResponse<{ series: any[]; pagination: any }>> {
        try {
            this.logger.log(`Fetching enrolled series for user: ${userId}`);

            const skip = (page - 1) * limit;
            const where = this.buildEnrolledSeriesWhereClause(userId, search);

            // Get enrollments with pagination at database level
            const [enrollments, total] = await Promise.all([
                this.getEnrollmentsWithSeries(where, skip, limit),
                this.prisma.enrollment.count({ where }),
            ]);

            // Process series data
            const series = await this.processEnrolledSeriesData(enrollments, userId);

            // Calculate pagination values
            const pagination = this.calculatePaginationValues(total, page, limit);

            return {
                success: true,
                message: 'Enrolled series retrieved successfully',
                data: { series, pagination },
            };
        } catch (error) {
            this.logger.error(`Error fetching enrolled series: ${error.message}`, error.stack);
            return this.createErrorResponse('Failed to fetch enrolled series', error.message);
        }
    }

    /**
     * Get a single enrolled series by ID
     */
    async getEnrolledSeriesById(userId: string, seriesId: string): Promise<SeriesResponse<any>> {
        try {
            this.logger.log(`Fetching enrolled series ${seriesId} for user: ${userId}`);

            // Check enrollment and get series data
            const enrollment = await this.getEnrollmentWithSeries(userId, seriesId);
            if (!enrollment || !enrollment.series) {
                return this.createErrorResponse('Series not found or you are not enrolled in this series');
            }

            // Process series data with progress
            const seriesWithProgress = await this.processSeriesWithProgress(enrollment, userId);

            return {
                success: true,
                message: 'Series retrieved successfully',
                data: seriesWithProgress,
            };
        } catch (error) {
            this.logger.error(`Error fetching series ${seriesId}: ${error.message}`, error.stack);
            return this.createErrorResponse('Failed to fetch series', error.message);
        }
    }

    /**
     * Get a single enrolled course by ID with lesson files and progress
     */
    async findOneCourse(userId: string, courseId: string): Promise<SeriesResponse<any>> {
        try {
            this.logger.log(`Fetching enrolled course ${courseId} for user: ${userId}`);

            // Check enrollment and get course data
            const enrollment = await this.getEnrollmentWithCourse(userId, courseId);
            if (!enrollment || !enrollment.series.courses.length) {
                return this.createErrorResponse('Course not found or you are not enrolled in this course');
            }

            // Process course data with progress
            const courseWithProgress = await this.processCourseWithProgress(enrollment, userId);

            return {
                success: true,
                message: 'Course retrieved successfully',
                data: courseWithProgress,
            };
        } catch (error) {
            this.logger.error(`Error fetching course ${courseId}: ${error.message}`, error.stack);
            return this.createErrorResponse('Failed to fetch course', error.message);
        }
    }

    /**
     * Get a single enrolled lesson by ID with progress
     */
    async findOneLesson(userId: string, lessonId: string): Promise<SeriesResponse<any>> {
        try {
            this.logger.log(`Fetching enrolled lesson ${lessonId} for user: ${userId}`);

            // Check if lesson is unlocked
            const isViewed = await this.prisma.lessonProgress.findFirst({
                where: {
                    user_id: userId,
                    lesson_id: lessonId,
                    deleted_at: null,
                },
            });

            if (!isViewed) {
                return this.createErrorResponse('You can not view this lesson');
            }

            // Get lesson data
            const lessonData = await this.getLessonWithContext(userId, lessonId);
            if (!lessonData) {
                return this.createErrorResponse('Lesson not found or you are not enrolled in this lesson');
            }

            // Mark lesson as viewed
            await this.lessonProgressService.markLessonAsViewed(userId, lessonId);

            return {
                success: true,
                message: 'Lesson retrieved successfully',
                data: lessonData,
            };
        } catch (error) {
            this.logger.error(`Error fetching lesson ${lessonId}: ${error.message}`, error.stack);
            return this.createErrorResponse('Failed to fetch lesson', error.message);
        }
    }

    /**
    * Stream lesson video with range support for video seeking
    */
    async streamLessonVideo(userId: string, lessonId: string, res: any, range?: string): Promise<void> {
        try {
            this.logger.log(`Streaming lesson video ${lessonId} for user: ${userId}`);


            // Check if lesson is unlocked and user has access
            const lessonProgress = await this.prisma.lessonProgress.findFirst({
                where: {
                    user_id: userId,
                    lesson_id: lessonId,
                    deleted_at: null,
                },
            });

            if (!lessonProgress) {
                res.status(403).json({ error: 'You cannot access this lesson' });
                return;
            }

            // Get lesson file details
            const lesson = await this.prisma.lessonFile.findFirst({
                where: { id: lessonId, deleted_at: null },
                select: { url: true, title: true },
            });;

            if (!lesson || !lesson.url) {
                res.status(404).json({ error: 'Video file not found' });
                return;
            }

            // Mark lesson as viewed
            await this.lessonProgressService.markLessonAsViewed(userId, lessonId);

            // Construct full file path - use the actual storage structure
            const storageBasePath = path.join(process.cwd(), 'public', 'storage');
            const lessonFilePath = path.join(storageBasePath, 'lesson', 'file', lesson.url);
            // Check if file exists
            if (!fs.existsSync(lessonFilePath)) {
                res.status(404).json({ error: 'Video file not found on server' });
                return;
            }

            // Get file stats
            const stat = fs.statSync(lessonFilePath);
            const fileSize = stat.size;

            // Parse range header
            if (range) {
                const parts = range.replace(/bytes=/, "").split("-");
                console.log('parts', parts);
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                const chunksize = (end - start) + 1;
                const file = fs.createReadStream(lessonFilePath, { start, end });

                const head = {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize,
                    'Content-Type': 'video/mp4',
                };

                res.writeHead(206, head);
                file.pipe(res);
            } else {
                const head = {
                    'Content-Length': fileSize,
                    'Content-Type': 'video/mp4',
                };

                res.writeHead(200, head);
                fs.createReadStream(lessonFilePath).pipe(res);
            }

            this.logger.log(`Video streaming started for lesson ${lessonId}`);
        } catch (error) {
            this.logger.error(`Error streaming video: ${error.message}`, error.stack);
            res.status(500).json({ error: 'Failed to stream video' });
        }
    }

    // ==================== VIDEO PROGRESS METHODS ====================

    /**
     * Update intro video progress
     */
    async updateIntroVideoProgress(
        userId: string,
        courseId: string,
        progressData: VideoProgressData
    ): Promise<SeriesResponse<any>> {
        return await this.videoProgressService.updateIntroVideoProgress(userId, courseId, progressData);
    }

    /**
     * Update end video progress
     */
    async updateEndVideoProgress(
        userId: string,
        courseId: string,
        progressData: VideoProgressData
    ): Promise<SeriesResponse<any>> {
        return await this.videoProgressService.updateEndVideoProgress(userId, courseId, progressData);
    }

    /**
     * Mark intro video as completed
     */
    async markIntroVideoAsCompleted(
        userId: string,
        courseId: string,
        completionData?: VideoProgressData
    ): Promise<SeriesResponse<any>> {
        const result = await this.videoProgressService.markIntroVideoAsCompleted(userId, courseId, completionData);

        // Unlock first lesson after intro video completion (only if not already unlocked)
        if (result.success) {
            const courseProgress = await this.prisma.courseProgress.findFirst({
                where: { user_id: userId, course_id: courseId, deleted_at: null },
            });

            if (courseProgress) {
                // Check if first lesson is already unlocked
                const firstLesson = await this.prisma.lessonFile.findFirst({
                    where: {
                        course_id: courseId,
                        deleted_at: null,
                    },
                    select: { id: true },
                    orderBy: { created_at: 'asc' },
                });

                if (firstLesson) {
                    const existingProgress = await this.prisma.lessonProgress.findFirst({
                        where: {
                            user_id: userId,
                            lesson_id: firstLesson.id,
                            deleted_at: null,
                        },
                    });

                    // Only unlock if not already unlocked
                    if (!existingProgress) {
                        await this.lessonUnlockService.unlockFirstLessonAfterIntroCompletion(
                            userId,
                            courseId,
                            courseProgress.series_id
                        );
                    }
                }
            }
        }

        return result;
    }

    /**
     * Mark end video as completed
     */
    async markEndVideoAsCompleted(
        userId: string,
        courseId: string,
        completionData?: VideoProgressData
    ): Promise<SeriesResponse<any>> {
        const result = await this.videoProgressService.markEndVideoAsCompleted(userId, courseId, completionData);

        // Unlock next lesson after end video completion
        if (result.success) {
            await this.lessonUnlockService.unlockNextLesson(userId, '', courseId);
        }

        return result;
    }

    // ==================== LESSON PROGRESS METHODS ====================

    /**
     * Mark lesson as viewed
     */
    async markLessonAsViewed(userId: string, lessonId: string): Promise<SeriesResponse<any>> {
        return await this.lessonProgressService.markLessonAsViewed(userId, lessonId);
    }

    /**
     * Mark lesson as completed
     */
    async markLessonAsCompleted(
        userId: string,
        lessonId: string,
        completionData?: VideoProgressData
    ): Promise<SeriesResponse<any>> {
        const result = await this.lessonProgressService.markLessonAsCompleted(userId, lessonId, completionData);

        // Unlock next lesson and update course progress
        if (result.success) {
            const lesson = await this.prisma.lessonFile.findFirst({
                where: { id: lessonId, deleted_at: null },
                include: { course: { select: { id: true, series_id: true } } },
            });

            if (lesson) {
                await this.lessonUnlockService.unlockNextLesson(userId, lessonId, lesson.course.id);
                await this.courseProgressService.updateCourseProgress(userId, lesson.course.id, lesson.course.series_id);
                await this.courseProgressService.updateEnrollmentProgress(userId, lesson.course.series_id);
            }
        }

        return result;
    }

    /**
     * Update video progress and auto-complete lesson if 90%+ watched
     */
    async updateVideoProgress(
        userId: string,
        lessonId: string,
        progressData: VideoProgressData
    ): Promise<SeriesResponse<any>> {
        const result = await this.lessonProgressService.updateVideoProgress(userId, lessonId, progressData);

        // If auto-completed, update course progress
        if (result.success && result.data?.auto_completed) {
            const lesson = await this.prisma.lessonFile.findFirst({
                where: { id: lessonId, deleted_at: null },
                include: { course: { select: { id: true, series_id: true } } },
            });

            if (lesson) {
                await this.lessonUnlockService.unlockNextLesson(userId, lessonId, lesson.course.id);
                await this.courseProgressService.updateCourseProgress(userId, lesson.course.id, lesson.course.series_id);
                await this.courseProgressService.updateEnrollmentProgress(userId, lesson.course.series_id);
            }
        }

        return result;
    }

    // ==================== COURSE PROGRESS METHODS ====================

    /**
     * Get course progress for a user
     */
    async getCourseProgress(userId: string, courseId: string): Promise<SeriesResponse<any>> {
        return await this.courseProgressService.getCourseProgress(userId, courseId);
    }

    /**
     * Get all course progress for a user in a series
     */
    async getAllCourseProgress(userId: string, seriesId: string): Promise<SeriesResponse<{ courseProgress: any[] }>> {
        return await this.courseProgressService.getAllCourseProgress(userId, seriesId);
    }

    /**
     * Get lesson progress for a specific lesson
     */
    async getLessonProgress(userId: string, lessonId: string): Promise<SeriesResponse<any>> {
        return await this.lessonProgressService.getLessonProgress(userId, lessonId);
    }

    /**
     * Get lesson progress for a specific course
     */
    async getLessonProgressForCourse(userId: string, courseId: string) {
        return await this.lessonProgressService.getLessonProgressForCourse(userId, courseId);
    }

    /**
     * Update course progress based on completed lessons
     */
    async updateCourseProgress(userId: string, courseId: string, seriesId: string): Promise<void> {
        return await this.courseProgressService.updateCourseProgress(userId, courseId, seriesId);
    }

    /**
     * Update enrollment progress percentage based on completed lessons
     */
    async updateEnrollmentProgress(userId: string, seriesId: string): Promise<void> {
        return await this.courseProgressService.updateEnrollmentProgress(userId, seriesId);
    }

    // ==================== UNLOCK METHODS ====================

    /**
     * Ensure first course's intro video or first lesson is unlocked for a user
     */
    async unlockFirstLessonForUser(userId: string, seriesId: string): Promise<void> {
        return await this.lessonUnlockService.unlockFirstLessonForUser(userId, seriesId);
    }

    /**
     * Unlock next lesson after completing current one
     */
    async unlockNextLesson(userId: string, completedLessonId: string, courseId: string): Promise<void> {
        return await this.lessonUnlockService.unlockNextLesson(userId, completedLessonId, courseId);
    }

    /**
     * Start the next course automatically when current course is completed
     */
    async startNextCourse(userId: string, completedCourseId: string, seriesId: string): Promise<void> {
        return await this.lessonUnlockService.startNextCourse(userId, completedCourseId, seriesId);
    }


    // ==================== UTILITY METHODS ====================

    /**
     * Get series titles for a user
     */
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
            return this.createErrorResponse('Failed to fetch enrolled series titles', error.message);
        }
    }

    // ==================== PRIVATE HELPER METHODS ====================

    private buildEnrolledSeriesWhereClause(userId: string, search?: string): any {
        const where: any = {
            user_id: userId,
            status: { in: ['ACTIVE', 'COMPLETED'] as any },
            payment_status: 'completed',
            deleted_at: null,
        };

        if (search) {
            where.series = {
                OR: [
                    { title: { contains: search, mode: 'insensitive' as any } },
                    { summary: { contains: search, mode: 'insensitive' as any } },
                    { description: { contains: search, mode: 'insensitive' as any } },
                ],
            };
        }

        return where;
    }

    private async getEnrollmentsWithSeries(where: any, skip: number, limit: number) {
        return await this.prisma.enrollment.findMany({
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
        });
    }

    private async processEnrolledSeriesData(enrollments: any[], userId: string) {
        // Extract series from enrollments and add enrollment info
        const series = enrollments.map(enrollment => ({
            ...enrollment.series,
            enrollment: {
                id: enrollment.id,
                enrolled_at: enrollment.enrolled_at,
                status: enrollment.status,
                progress_percentage: enrollment.progress_percentage,
                last_accessed_at: enrollment.last_accessed_at,
            },
        }));

        // Add file URLs and progress data
        await this.addFileUrlsAndProgress(series, userId);

        return series;
    }

    private async addFileUrlsAndProgress(series: any[], userId: string) {
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
                    is_unlocked: true,
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
                                lessonFile['is_unlocked'] = lessonProgress?.is_unlocked ? true : false;
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
    }

    private calculatePaginationValues(total: number, page: number, limit: number) {
        const totalPages = Math.ceil(total / limit);
        const hasNextPage = page < totalPages;
        const hasPreviousPage = page > 1;

        return {
            total,
            page,
            limit,
            totalPages,
            hasNextPage,
            hasPreviousPage,
        };
    }

    private async getEnrollmentWithSeries(userId: string, seriesId: string) {
        return await this.prisma.enrollment.findFirst({
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
    }

    private async processSeriesWithProgress(enrollment: any, userId: string) {
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

        // Get course and lesson progress
        await this.addCourseAndLessonProgress(seriesWithEnrollment, userId);

        return seriesWithEnrollment;
    }

    private async addCourseAndLessonProgress(seriesWithEnrollment: any, userId: string) {
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
                is_unlocked: true,
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
                    lessonFile['is_unlocked'] = lessonProgress?.is_unlocked ? true : false;
                }
            }
        }
    }

    private async getEnrollmentWithCourse(userId: string, courseId: string) {
        return await this.prisma.enrollment.findFirst({
            where: {
                user_id: userId,
                status: { in: ['ACTIVE', 'COMPLETED'] as any },
                payment_status: 'completed',
                deleted_at: null,
                series: {
                    courses: {
                        some: {
                            id: courseId,
                        },
                    },
                },
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
    }

    private async processCourseWithProgress(enrollment: any, userId: string) {
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
                    is_unlocked: true,
                },
            });

            // Create lookup map for efficient access
            const lessonProgressMap = new Map(allLessonProgress.map(lp => [lp.lesson_id, lp]));

            // Add lesson progress and file URLs
            if (courseWithEnrollment.lesson_files && courseWithEnrollment.lesson_files.length > 0) {
                for (const lessonFile of courseWithEnrollment.lesson_files) {
                    const lessonProgress = lessonProgressMap.get(lessonFile.id);
                    lessonFile['lesson_progress'] = lessonProgress || null;
                    lessonFile['is_unlocked'] = lessonProgress?.is_unlocked ? true : false;
                }
            }
        }

        return courseWithEnrollment;
    }

    private async getLessonWithContext(userId: string, lessonId: string) {
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
            return null;
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
            return null;
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
                is_unlocked: true,
            },
        });

        lessonWithContext['progress'] = progress || null;
        lessonWithContext['is_unlocked'] = progress ? true : false; // If progress exists, lesson is unlocked

        return lessonWithContext;
    }

    // ==================== MISSING METHODS ====================

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
                        is_unlocked: watchedLesson.is_unlocked,
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
                    is_unlocked: lastWatchedLesson.is_unlocked,
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

    private createErrorResponse(message: string, error?: string): SeriesResponse<any> {
        return {
            success: false,
            message,
            error: error || message,
        };
    }
}
