import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ScheduleEventService } from '../schedule-event/schedule-event.service';
import { AssignmentService } from '../assignment/assignment.service';
import { QuizService } from '../quiz/quiz.service';

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
            },
            orderBy: {
                created_at: 'desc',
            },
        });

        const seriesRates = series.map(serie => {
            const totalEnrollments = serie.enrollments.length;
            const completedEnrollments = serie.enrollments.filter(e => e.status === 'COMPLETED').length;
            const completionRate = totalEnrollments > 0 ? Math.round((completedEnrollments / totalEnrollments) * 100) : 0;

            return {
                series_id: serie.id,
                title: serie.title,
                total_enrollments: totalEnrollments,
                completed_enrollments: completedEnrollments,
                completion_rate: completionRate,
            };
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

            return {
                series_id: serie.id,
                series_name: serie.title,
                start_date: serie.start_date,
                completion_date: serie.end_date,
                enrolled: totalEnrolled,
                completed: completed,
                in_progress: inProgress,
                completion_rate: completionRate,
            };
        });
    }

}
