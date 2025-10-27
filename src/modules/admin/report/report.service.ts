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

    async getWebsiteTraffic(period: 'week' | 'month' | 'year' = 'week') {
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

            const websiteTrafficTrends = await this.getWebsiteTrafficTrends(period);

            return {
                success: true,
                message: 'Website traffic retrieved successfully',
                data: {
                    daily_users: dailyUsers,
                    weekly_users: weeklyUsers,
                    monthly_users: monthlyUsers,
                    total_visitors: totalUsers,
                    website_traffic_trends: websiteTrafficTrends,
                },
            };
        } catch (error) {
            this.logger.error('Error calculating visitor analytics:', error);
            throw error;
        }
    }

    /**
     * Get detailed website traffic trends data for charts with daily breakdown
     */
    async getWebsiteTrafficTrends(period: 'week' | 'month' | 'year' = 'week') {
        try {

            if (period === 'month') {
                return {
                    "summary": {
                        "current_period_users": 185,
                        "previous_period_users": 142,
                        "growth_percentage": 30.28,
                        "growth_direction": "up",
                        "current_period_label": "This month",
                        "previous_period_label": "Last month",
                        "period_type": "month",
                        "total_users": 1250,
                        "active_users": 890
                    },
                    "chart_data": {
                        "current_period": {
                            "label": "This month",
                            "data": [
                                { "month": "Jan", "users": 142 },
                                { "month": "Feb", "users": 90 },
                                { "month": "Mar", "users": 142 },
                                { "month": "Apr", "users": 129 },
                                { "month": "May", "users": 142 },
                                { "month": "Jun", "users": 163 },
                                { "month": "Jul", "users": 190 },
                                { "month": "Aug", "users": 177 },
                                { "month": "Sep", "users": 120 },
                                { "month": "Oct", "users": 185 },
                                { "month": "Nov", "users": 160 },
                                { "month": "Dec", "users": 185 }
                            ]
                        },
                        "last_period": {
                            "label": "Last month",
                            "data": [
                                { "month": "Jan", "users": 142 },
                                { "month": "Feb", "users": 125 },
                                { "month": "Mar", "users": 42 },
                                { "month": "Apr", "users": 156 },
                                { "month": "May", "users": 142 },
                                { "month": "Jun", "users": 163 },
                                { "month": "Jul", "users": 70 },
                                { "month": "Aug", "users": 177 },
                                { "month": "Sep", "users": 185 },
                                { "month": "Oct", "users": 185 },
                                { "month": "Nov", "users": 92 },
                                { "month": "Dec", "users": 185 }
                            ]
                        }
                    }
                }
            } else {
                return {
                    "summary": {
                        "current_period_users": 45,
                        "previous_period_users": 38,
                        "growth_percentage": 18.42,
                        "growth_direction": "up",
                        "current_period_label": "This week",
                        "previous_period_label": "Last week",
                        "period_type": "week",
                        "total_users": 1250,
                        "active_users": 890
                    },
                    "chart_data": {
                        "current_period": {
                            "label": "This week",
                            "data": [
                                { "day": "Sun", "users": 0 },
                                { "day": "Mon", "users": 8 },
                                { "day": "Tue", "users": 12 },
                                { "day": "Wed", "users": 15 },
                                { "day": "Thu", "users": 6 },
                                { "day": "Fri", "users": 4 },
                                { "day": "Sat", "users": 0 }
                            ]
                        },
                        "last_period": {
                            "label": "Last week",
                            "data": [
                                { "day": "Sun", "users": 0 },
                                { "day": "Mon", "users": 5 },
                                { "day": "Tue", "users": 9 },
                                { "day": "Wed", "users": 12 },
                                { "day": "Thu", "users": 7 },
                                { "day": "Fri", "users": 5 },
                                { "day": "Sat", "users": 0 }
                            ]
                        }
                    }
                }
            }
            const now = new Date();
            let currentPeriodStart: Date;
            let lastPeriodStart: Date;
            let lastPeriodEnd: Date;
            let currentPeriodLabel: string;
            let lastPeriodLabel: string;

            switch (period) {
                case 'week':
                    // Get current week start (Monday)
                    const currentDay = now.getDay();
                    const daysToMonday = currentDay === 0 ? -6 : 1 - currentDay;
                    currentPeriodStart = new Date(now);
                    currentPeriodStart.setDate(now.getDate() + daysToMonday);
                    currentPeriodStart.setHours(0, 0, 0, 0);

                    // Get last week start and end
                    lastPeriodStart = new Date(currentPeriodStart);
                    lastPeriodStart.setDate(currentPeriodStart.getDate() - 7);
                    lastPeriodEnd = new Date(lastPeriodStart);
                    lastPeriodEnd.setDate(lastPeriodStart.getDate() + 6);
                    lastPeriodEnd.setHours(23, 59, 59, 999);

                    currentPeriodLabel = 'This week';
                    lastPeriodLabel = 'Last week';
                    break;

                case 'month':
                    currentPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1);
                    lastPeriodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    lastPeriodEnd = new Date(now.getFullYear(), now.getMonth(), 0);
                    lastPeriodEnd.setHours(23, 59, 59, 999);

                    currentPeriodLabel = 'This month';
                    lastPeriodLabel = 'Last month';
                    break;

                case 'year':
                    currentPeriodStart = new Date(now.getFullYear(), 0, 1);
                    lastPeriodStart = new Date(now.getFullYear() - 1, 0, 1);
                    lastPeriodEnd = new Date(now.getFullYear() - 1, 11, 31);
                    lastPeriodEnd.setHours(23, 59, 59, 999);

                    currentPeriodLabel = 'This year';
                    lastPeriodLabel = 'Last year';
                    break;

                default:
                    throw new Error('Invalid period. Must be week, month, or year');
            }

            // Get current period user registrations
            const currentPeriodData = await this.prisma.user.groupBy({
                by: ['created_at'],
                where: {
                    deleted_at: null,
                    created_at: {
                        gte: currentPeriodStart,
                    },
                },
                _count: {
                    id: true,
                },
                orderBy: {
                    created_at: 'asc',
                },
            });

            // Get last period user registrations
            const lastPeriodData = await this.prisma.user.groupBy({
                by: ['created_at'],
                where: {
                    deleted_at: null,
                    created_at: {
                        gte: lastPeriodStart,
                        lte: lastPeriodEnd,
                    },
                },
                _count: {
                    id: true,
                },
                orderBy: {
                    created_at: 'asc',
                },
            });

            // Process data based on period type
            let currentPeriodTraffic: any[];
            let lastPeriodTraffic: any[];

            if (period === 'week') {
                // For week: group by day name (Sun, Mon, Tue, etc.)
                currentPeriodTraffic = this.groupByDay(currentPeriodData);
                lastPeriodTraffic = this.groupByDay(lastPeriodData);
            } else if (period === 'month') {
                // For month: group by month name
                currentPeriodTraffic = this.groupByMonth(currentPeriodData);
                lastPeriodTraffic = this.groupByMonth(lastPeriodData);
            } else if (period === 'year') {
                // For year: group by year
                currentPeriodTraffic = this.groupByYear(currentPeriodData);
                lastPeriodTraffic = this.groupByYear(lastPeriodData);
            }

            // Calculate total users for summary
            const currentTotal = currentPeriodTraffic.reduce((sum, item) => sum + item.users, 0);
            const lastTotal = lastPeriodTraffic.reduce((sum, item) => sum + item.users, 0);

            // Calculate growth percentage
            let growthPercentage = 0;
            if (lastTotal > 0) {
                growthPercentage = ((currentTotal - lastTotal) / lastTotal) * 100;
            } else if (currentTotal > 0) {
                growthPercentage = 100;
            }

            // Get additional traffic metrics
            const totalUsers = await this.prisma.user.count({
                where: {
                    deleted_at: null,
                },
            });

            // Get active users (users who have enrollments)
            const activeUsers = await this.prisma.user.count({
                where: {
                    deleted_at: null,
                    enrollments: {
                        some: {
                            deleted_at: null,
                        },
                    },
                },
            });

            return {
                summary: {
                    current_period_users: currentTotal,
                    previous_period_users: lastTotal,
                    growth_percentage: Math.round(growthPercentage * 100) / 100,
                    growth_direction: growthPercentage >= 0 ? 'up' : 'down',
                    current_period_label: currentPeriodLabel,
                    previous_period_label: lastPeriodLabel,
                    period_type: period,
                    total_users: totalUsers,
                    active_users: activeUsers,
                },
                chart_data: {
                    current_period: {
                        label: currentPeriodLabel,
                        data: currentPeriodTraffic,
                    },
                    last_period: {
                        label: lastPeriodLabel,
                        data: lastPeriodTraffic,
                    },
                },
            };
        } catch (error) {
            this.logger.error('Error calculating website traffic trends:', error);
            return {
                success: false,
                message: 'Failed to fetch website traffic trends data',
                error: error.message,
            };
        }
    }


    /**
     * Group data by day name for weekly view
     */
    private groupByDay(data: any[]) {
        const dailyData: { [key: string]: number } = {};
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        // Initialize all days with 0
        dayNames.forEach(day => {
            dailyData[day] = 0;
        });

        // Add actual data
        data.forEach(item => {
            const dayIndex = new Date(item.created_at).getDay();
            const dayName = dayNames[dayIndex];
            dailyData[dayName] += item._count.id;
        });

        return dayNames.map(day => ({
            day: day,
            users: dailyData[day],
        }));
    }

    /**
     * Group data by month name for monthly view
     */
    private groupByMonth(data: any[]) {
        const monthlyData: { [key: string]: number } = {};
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        // Initialize all months with 0
        monthNames.forEach(month => {
            monthlyData[month] = 0;
        });

        // Add actual data
        data.forEach(item => {
            const monthIndex = new Date(item.created_at).getMonth();
            const monthName = monthNames[monthIndex];
            monthlyData[monthName] += item._count.id;
        });

        return monthNames.map(month => ({
            month: month,
            users: monthlyData[month],
        }));
    }

    /**
     * Group data by year for yearly view
     */
    private groupByYear(data: any[]) {
        const yearlyData: { [key: string]: number } = {};

        data.forEach(item => {
            const year = new Date(item.created_at).getFullYear().toString();
            yearlyData[year] = (yearlyData[year] || 0) + item._count.id;
        });

        return Object.entries(yearlyData).map(([year, users]) => ({
            year: year,
            users: users,
        }));
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
                        created_at: 'asc',
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
                        created_at: 'asc',
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
