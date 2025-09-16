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

            const [enrollments, total] = await Promise.all([
                this.prisma.enrollment.findMany({
                    where: enrollmentWhere,
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
                                        created_at: true,
                                        updated_at: true,
                                        intro_video_url: true,
                                        end_video_url: true,
                                        lesson_files: {
                                            select: {
                                                id: true,
                                                title: true,
                                                url: true,
                                                kind: true,
                                                alt: true,
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
                this.prisma.enrollment.count({
                    where: enrollmentWhere,
                }),
            ]);

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

            // Extract series from enrollments and add enrollment info
            const series = filteredEnrollments.map(enrollment => {
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

            // Add file URLs to all series
            for (const seriesItem of series) {
                if (seriesItem.thumbnail) {
                    seriesItem['thumbnail_url'] = SojebStorage.url(appConfig().storageUrl.series_thumbnail + seriesItem.thumbnail);
                }
                if (seriesItem.courses && seriesItem.courses.length > 0) {
                    for (const course of seriesItem.courses) {
                        if (course.lesson_files && course.lesson_files.length > 0) {
                            for (const lessonFile of course.lesson_files) {
                                if (lessonFile.url) {
                                    lessonFile['file_url'] = SojebStorage.url(appConfig().storageUrl.lesson_file + lessonFile.url);
                                }
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
}
