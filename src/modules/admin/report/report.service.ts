import { Injectable, Logger } from '@nestjs/common';
import { EnrollType, EnrollmentStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ScheduleEventService } from '../schedule-event/schedule-event.service';
import { AssignmentService } from '../assignment/assignment.service';
import { QuizService } from '../quiz/quiz.service';
import { SojebStorage } from 'src/common/lib/Disk/SojebStorage';
import appConfig from 'src/config/app.config';

@Injectable()
export class ReportService {

    private readonly logger = new Logger(ReportService.name);
    constructor(
        private readonly prisma: PrismaService,
    ) {
    }

    async getWebsiteTraffic() {
        try {
            const now = new Date();

            // Daily users (users who registered today)
            const startOfDay = new Date(now);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(now);
            endOfDay.setHours(23, 59, 59, 999);

            // Weekly users (users who registered in the last 7 days)
            const startOfWeek = new Date(now);
            startOfWeek.setDate(now.getDate() - 7);
            startOfWeek.setHours(0, 0, 0, 0);

            // Monthly users (users who registered in the last 30 days)
            const startOfMonth = new Date(now);
            startOfMonth.setDate(now.getDate() - 30);
            startOfMonth.setHours(0, 0, 0, 0);

            const [dailyUsers, weeklyUsers, monthlyUsers, totalUsers] = await Promise.all([
                // Daily users
                this.prisma.user.count({
                    where: {
                        created_at: {
                            gte: startOfDay,
                            lte: endOfDay,
                        },
                        deleted_at: null,
                    },
                }),
                // Weekly users
                this.prisma.user.count({
                    where: {
                        created_at: {
                            gte: startOfWeek,
                        },
                        deleted_at: null,
                    },
                }),
                // Monthly users
                this.prisma.user.count({
                    where: {
                        created_at: {
                            gte: startOfMonth,
                        },
                        deleted_at: null,
                    },
                }),
                // Total users
                this.prisma.user.count({
                    where: {
                        deleted_at: null,
                    },
                }),
            ]);

            return {
                success: true,
                message: 'Website traffic retrieved successfully',
                data: {
                    daily_users: dailyUsers,
                    weekly_users: weeklyUsers,
                    monthly_users: monthlyUsers,
                    total_visitors: totalUsers,
                },
            };
        } catch (error) {
            this.logger.error('Error calculating visitor analytics:', error);
            throw error;
        }
    }

    /**
     * List enrollments with user and series info (admin report)
     */
    async listEnrollments(params?: {
        series_id?: string;
        user_id?: string;
        status?: EnrollmentStatus;
        enroll_type?: EnrollType;
        payment_status?: string;
        search?: string; // search in user.name/email or series.title
        page?: number;
        limit?: number;
    }) {
        const page = Math.max(1, Number(params?.page) || 1);
        const limit = Math.max(1, Math.min(100, Number(params?.limit) || 10));
        const skip = (page - 1) * limit;

        const where: any = {
            deleted_at: null,
            ...(params?.series_id ? { series_id: params.series_id } : {}),
            ...(params?.user_id ? { user_id: params.user_id } : {}),
            ...(params?.status ? { status: params.status } : {}),
            ...(params?.enroll_type ? { enroll_type: params.enroll_type } : {}),
            ...(params?.payment_status ? { payment_status: params.payment_status } : {}),
        };

        // text search across user name/email and series title
        if (params?.search) {
            where.OR = [
                { user: { name: { contains: params.search, mode: 'insensitive' } } },
                { user: { email: { contains: params.search, mode: 'insensitive' } } },
                { series: { title: { contains: params.search, mode: 'insensitive' } } },
            ];
        }

        const [total, items] = await Promise.all([
            this.prisma.enrollment.count({ where }),
            this.prisma.enrollment.findMany({
                where,
                orderBy: { created_at: 'desc' },
                skip,
                take: limit,
                select: {
                    id: true,
                    status: true,
                    enroll_type: true,
                    payment_status: true,
                    paid_amount: true,
                    paid_currency: true,
                    progress_percentage: true,
                    created_at: true,
                    enrolled_at: true,
                    completed_at: true,
                    expires_at: true,
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            phone_number: true,
                            whatsapp_number: true,
                            date_of_birth: true,
                            address: true,
                            avatar: true,
                        },
                    },
                    series: {
                        select: {
                            id: true,
                            title: true,
                            course_type: true,
                            start_date: true,
                            end_date: true,
                        },
                    },
                },
            }),
        ]);

        // add avatar url to user avatar_url field
        items.forEach(item => {
            if (item.user.avatar) {
                (item.user as any).avatar_url = SojebStorage.url(appConfig().storageUrl.avatar + item.user.avatar);
            }
        });

        return {
            success: true,
            message: 'Enrollments retrieved successfully',
            data: {
                enrollments: items,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit) || 1,
                    hasNextPage: page < (Math.ceil(total / limit) || 1),
                    hasPreviousPage: page > 1,
                },
            },
        };
    }

    /**
     * Payment overview for series enrollments
     */
    async getPaymentOverview(seriesId?: string, page: number = 1, limit: number = 10) {
        try {
            const baseWhere = {
                deleted_at: null as Date | null,
                ...(seriesId ? { series_id: seriesId } : {}),
            };

            const safePage = Math.max(1, Number(page) || 1);
            const safeLimit = Math.max(1, Math.min(100, Number(limit) || 10));
            const skip = (safePage - 1) * safeLimit;

            const [
                totalStudents,
                fullyPaid,
                sponsored,
                freeEnrolled,
                revenueAgg,
            ] = await Promise.all([
                this.prisma.enrollment.count({
                    where: {
                        ...baseWhere,
                        status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED] },
                    },
                }),
                this.prisma.enrollment.count({
                    where: {
                        ...baseWhere,
                        enroll_type: EnrollType.PAID,
                        payment_status: 'completed',
                    },
                }),
                this.prisma.enrollment.count({
                    where: {
                        ...baseWhere,
                        enroll_type: EnrollType.SCHOLARSHIP,
                        payment_status: 'completed',
                    },
                }),
                this.prisma.enrollment.count({
                    where: {
                        ...baseWhere,
                        enroll_type: EnrollType.FREE,
                        payment_status: 'completed',
                    },
                }),
                this.prisma.paymentTransaction.aggregate({
                    where: {
                        deleted_at: null,
                        status: { in: ['succeeded', 'completed'] as any },
                        ...(seriesId
                            ? { enrollment: { series_id: seriesId } }
                            : {}),
                    },
                    _sum: { paid_amount: true },
                }),
            ]);

            const donutTotal = Math.max(totalStudents, fullyPaid + sponsored + freeEnrolled);
            const pct = (n: number) => (donutTotal > 0 ? Math.round((n / donutTotal) * 100) : 0);

            const fullyPaidData = await this.prisma.enrollment.findMany({
                where: {
                    ...baseWhere,
                    enroll_type: EnrollType.PAID,
                    payment_status: 'completed',
                },
                orderBy: { updated_at: 'desc' },
                skip,
                take: safeLimit,
                select: {
                    id: true,
                    enroll_type: true,
                    payment_status: true,
                    paid_amount: true,
                    updated_at: true,
                    user: {
                        select: {
                            id: true,
                            name: true,
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

            const sponsoredData = await this.prisma.enrollment.findMany({
                where: {
                    ...baseWhere,
                    enroll_type: EnrollType.SCHOLARSHIP,
                    payment_status: 'completed',
                },
                orderBy: { updated_at: 'desc' },
                skip,
                take: safeLimit,
                select: {
                    id: true,
                    enroll_type: true,
                    payment_status: true,
                    paid_amount: true,
                    updated_at: true,
                    user: {
                        select: {
                            id: true,
                            name: true,
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

            const freeEnrolledData = await this.prisma.enrollment.findMany({

                where: {
                    ...baseWhere,
                    enroll_type: EnrollType.FREE,
                    payment_status: 'completed',
                },
                orderBy: { updated_at: 'desc' },
                skip,
                take: safeLimit,
                select: {
                    id: true,
                    enroll_type: true,
                    payment_status: true,
                    paid_amount: true,
                    updated_at: true,
                    user: {
                        select: {
                            id: true,
                            name: true,
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

            return {
                success: true,
                message: 'Payment overview retrieved successfully',
                data: {
                    totals: {
                        total_students: totalStudents,
                        fully_paid: fullyPaid,
                        sponsored: sponsored,
                        free_enrolled: freeEnrolled,
                        total_revenue: Number(revenueAgg._sum.paid_amount || 0),
                    },
                    overview: [
                        { label: 'Full Paid', count: fullyPaid, percentage: pct(fullyPaid) },
                        { label: 'Sponsored', count: sponsored, percentage: pct(sponsored) },
                        { label: 'Free Enrolled', count: freeEnrolled, percentage: pct(freeEnrolled) },
                    ],
                    fully_paid: {
                        items: fullyPaidData,
                        pagination: {
                            total: fullyPaid,
                            page: safePage,
                            limit: safeLimit,
                            totalPages: Math.ceil(fullyPaid / safeLimit) || 1,
                            hasNextPage: safePage < (Math.ceil(fullyPaid / safeLimit) || 1),
                            hasPreviousPage: safePage > 1,
                        },
                    },
                    sponsored: {
                        items: sponsoredData,
                        pagination: {
                            total: sponsored,
                            page: safePage,
                            limit: safeLimit,
                            totalPages: Math.ceil(sponsored / safeLimit) || 1,
                            hasNextPage: safePage < (Math.ceil(sponsored / safeLimit) || 1),
                            hasPreviousPage: safePage > 1,
                        },
                    },
                    free_enrolled: {
                        items: freeEnrolledData,
                        pagination: {
                            total: freeEnrolled,
                            page: safePage,
                            limit: safeLimit,
                            totalPages: Math.ceil(freeEnrolled / safeLimit) || 1,
                            hasNextPage: safePage < (Math.ceil(freeEnrolled / safeLimit) || 1),
                            hasPreviousPage: safePage > 1,
                        },
                    },
                },
            };
        } catch (error) {
            this.logger.error('Error fetching payment overview:', error);
            return {
                success: false,
                message: 'Failed to fetch payment overview',
                error: error.message,
            };
        }
    }

    /**
    * Get series progress report data
    */
    async getSeriesProgress(seriesId?: string) {
        try {
            this.logger.log('Fetching series progress report');

            // Get overall completion status distribution
            const completionStatus = await this.getSeriesCompletionStatusDistribution(seriesId);

            // Get series completion rates
            const seriesCompletionRates = await this.getSeriesCompletionRates(seriesId);

            // Get detailed series information
            const seriesDetails = await this.getSeriesDetails(seriesId);

            return {
                success: true,
                message: 'Series progress report retrieved successfully',
                data: {
                    completion_status_distribution: completionStatus,
                    series_completion_rates: seriesCompletionRates,
                    series_details: seriesDetails,
                },
            };
        } catch (error) {
            this.logger.error('Error fetching series progress report:', error);
            return {
                success: false,
                message: 'Failed to fetch series progress report',
                error: error.message,
            };
        }
    }

    /**
     * Get completion status distribution for series (Completed vs In Progress)
     */
    private async getSeriesCompletionStatusDistribution(seriesId?: string) {
        const whereClause = {
            deleted_at: null,
            ...(seriesId && { series_id: seriesId }),
        };

        const [totalEnrollments, completedEnrollments] = await Promise.all([
            this.prisma.enrollment.count({
                where: whereClause,
            }),
            this.prisma.enrollment.count({
                where: {
                    ...whereClause,
                    status: 'COMPLETED',
                },
            }),
        ]);

        const inProgress = totalEnrollments - completedEnrollments;
        const completedPercentage = totalEnrollments > 0 ? Math.round((completedEnrollments / totalEnrollments) * 100) : 0;
        const inProgressPercentage = totalEnrollments > 0 ? Math.round((inProgress / totalEnrollments) * 100) : 0;

        return {
            total_enrollments: totalEnrollments,
            completed: {
                count: completedEnrollments,
                percentage: completedPercentage,
            },
            in_progress: {
                count: inProgress,
                percentage: inProgressPercentage,
            },
        };
    }

    /**
     * Get series completion rates for all series
     */
    private async getSeriesCompletionRates(seriesId?: string) {
        const whereClause = {
            deleted_at: null,
            ...(seriesId && { id: seriesId }),
        };

        const series = await this.prisma.series.findMany({
            where: whereClause,
            select: {
                id: true,
                title: true,
                enrollments: {
                    select: {
                        id: true,
                        status: true,
                    },
                },
                courses: {
                    select: {
                        id: true,
                        title: true,
                        position: true,
                        course_progress: {
                            select: {
                                id: true,
                                user_id: true,
                                status: true,
                                is_completed: true,
                                completion_percentage: true,
                                completed_at: true,
                            },
                        },
                        _count: {
                            select: {
                                lesson_files: true,
                            },
                        },
                    },
                    orderBy: {
                        position: 'asc',
                    },
                },
            },
            orderBy: {
                created_at: 'desc',
            },
        });

        const seriesRates = series.map(serie => {
            const totalEnrollments = serie.enrollments.length;
            const completedEnrollments = serie.enrollments.filter(e => e.status === 'COMPLETED').length;
            const completionRate = totalEnrollments > 0 ? Math.round((completedEnrollments / totalEnrollments) * 100) : 0;

            // Calculate course progress statistics
            const courseProgressStats = serie.courses.map(course => {
                const totalProgressRecords = course.course_progress.length;
                const completedCourses = course.course_progress.filter(cp => cp.is_completed).length;
                const inProgressCourses = course.course_progress.filter(cp => cp.status === 'in_progress').length;
                const pendingCourses = course.course_progress.filter(cp => cp.status === 'pending').length;

                const avgCompletionPercentage = totalProgressRecords > 0
                    ? Math.round(course.course_progress.reduce((sum, cp) => sum + (cp.completion_percentage || 0), 0) / totalProgressRecords)
                    : 0;

                return {
                    course_id: course.id,
                    course_title: course.title,
                    position: course.position,
                    total_lesson_files: course._count.lesson_files,
                    total_progress_records: totalProgressRecords,
                    completed_courses: completedCourses,
                    in_progress_courses: inProgressCourses,
                    pending_courses: pendingCourses,
                    average_completion_percentage: avgCompletionPercentage,
                    course_completion_rate: totalProgressRecords > 0 ? Math.round((completedCourses / totalProgressRecords) * 100) : 0,
                };
            });

            const result: any = {
                series_id: serie.id,
                title: serie.title,
                total_enrollments: totalEnrollments,
                completed_enrollments: completedEnrollments,
                completion_rate: completionRate,
            };

            // Add course progress data when filtering by specific series
            if (seriesId) {
                result.courses = courseProgressStats;
                result.course_summary = {
                    total_courses: serie.courses.length,
                    total_lesson_files: serie.courses.reduce((sum, course) => sum + course._count.lesson_files, 0),
                    total_course_progress_records: serie.courses.reduce((sum, course) => sum + course.course_progress.length, 0),
                    overall_course_completion_rate: courseProgressStats.length > 0
                        ? Math.round(courseProgressStats.reduce((sum, course) => sum + course.course_completion_rate, 0) / courseProgressStats.length)
                        : 0,
                };
            }

            return result;
        });

        // Calculate overall completion rate
        const totalEnrollments = seriesRates.reduce((sum, serie) => sum + serie.total_enrollments, 0);
        const totalCompleted = seriesRates.reduce((sum, serie) => sum + serie.completed_enrollments, 0);
        const overallCompletionRate = totalEnrollments > 0 ? Math.round((totalCompleted / totalEnrollments) * 100) : 0;

        return {
            overall_completion_rate: overallCompletionRate,
            series: seriesRates,
        };
    }

    /**
     * Get detailed series information for the table
     */
    private async getSeriesDetails(seriesId?: string) {
        const whereClause = {
            deleted_at: null,
            ...(seriesId && { id: seriesId }),
        };

        const series = await this.prisma.series.findMany({
            where: whereClause,
            select: {
                id: true,
                title: true,
                start_date: true,
                end_date: true,
                enrollments: {
                    select: {
                        id: true,
                        status: true,
                        enrolled_at: true,
                        completed_at: true,
                    },
                },
                courses: {
                    select: {
                        id: true,
                        title: true,
                        position: true,
                        course_progress: {
                            select: {
                                id: true,
                                user_id: true,
                                status: true,
                                is_completed: true,
                                completion_percentage: true,
                                completed_at: true,
                            },
                        },
                        _count: {
                            select: {
                                lesson_files: true,
                            },
                        },
                    },
                    orderBy: {
                        position: 'asc',
                    },
                },
            },
            orderBy: {
                created_at: 'desc',
            },
        });

        return series.map(serie => {
            const totalEnrolled = serie.enrollments.length;
            const completed = serie.enrollments.filter(e => e.status === 'COMPLETED').length;
            const inProgress = serie.enrollments.filter(e => e.status === 'ACTIVE').length;
            const completionRate = totalEnrolled > 0 ? Math.round((completed / totalEnrolled) * 100) : 0;

            // Calculate course progress statistics
            const courseProgressStats = serie.courses.map(course => {
                const totalProgressRecords = course.course_progress.length;
                const completedCourses = course.course_progress.filter(cp => cp.is_completed).length;
                const inProgressCourses = course.course_progress.filter(cp => cp.status === 'in_progress').length;
                const pendingCourses = course.course_progress.filter(cp => cp.status === 'pending').length;

                const avgCompletionPercentage = totalProgressRecords > 0
                    ? Math.round(course.course_progress.reduce((sum, cp) => sum + (cp.completion_percentage || 0), 0) / totalProgressRecords)
                    : 0;

                return {
                    course_id: course.id,
                    course_title: course.title,
                    position: course.position,
                    total_lesson_files: course._count.lesson_files,
                    total_progress_records: totalProgressRecords,
                    completed_courses: completedCourses,
                    in_progress_courses: inProgressCourses,
                    pending_courses: pendingCourses,
                    average_completion_percentage: avgCompletionPercentage,
                    course_completion_rate: totalProgressRecords > 0 ? Math.round((completedCourses / totalProgressRecords) * 100) : 0,
                };
            });

            const result: any = {
                series_id: serie.id,
                series_name: serie.title,
                start_date: serie.start_date,
                completion_date: serie.end_date,
                enrolled: totalEnrolled,
                completed: completed,
                in_progress: inProgress,
                completion_rate: completionRate,
            };

            // Add course progress data when filtering by specific series
            if (seriesId) {
                result.courses = courseProgressStats;
                result.course_summary = {
                    total_courses: serie.courses.length,
                    total_lesson_files: serie.courses.reduce((sum, course) => sum + course._count.lesson_files, 0),
                    total_course_progress_records: serie.courses.reduce((sum, course) => sum + course.course_progress.length, 0),
                    overall_course_completion_rate: courseProgressStats.length > 0
                        ? Math.round(courseProgressStats.reduce((sum, course) => sum + course.course_completion_rate, 0) / courseProgressStats.length)
                        : 0,
                };
            }

            return result;
        });
    }

}
