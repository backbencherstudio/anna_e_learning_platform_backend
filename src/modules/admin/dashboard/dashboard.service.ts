import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ScheduleEventService } from '../schedule-event/schedule-event.service';

@Injectable()
export class DashboardService {
    private readonly logger = new Logger(DashboardService.name);
    constructor(private readonly prisma: PrismaService, private readonly scheduleEventService: ScheduleEventService) {
    }

    /**
     * Get total dashboard stats
     */
    async getTotalDashboardStats() {
        try {

            const today = new Date();
            const startOfDay = new Date(today.setHours(0, 0, 0, 0));
            const endOfDay = new Date(today.setHours(23, 59, 59, 999));


            const revenue = await this.prisma.paymentTransaction.aggregate({
                where: {
                    status: 'succeeded',
                    deleted_at: null,
                },
                _sum: {
                    paid_amount: true,
                },
            });

            const totalUsers = await this.prisma.user.count({
                where: {
                    deleted_at: null,
                },
            });

            const [newEnrollments, newUsers, completedPayments] = await Promise.all([
                // New enrollments today
                this.prisma.enrollment.count({
                    where: {
                        created_at: {
                            gte: startOfDay,
                            lte: endOfDay,
                        },
                        deleted_at: null,
                    },
                }),
                // New users today
                this.prisma.user.count({
                    where: {
                        created_at: {
                            gte: startOfDay,
                            lte: endOfDay,
                        },
                        deleted_at: null,
                    },
                }),
                // Completed payments today
                this.prisma.paymentTransaction.count({
                    where: {
                        status: 'completed',
                        created_at: {
                            gte: startOfDay,
                            lte: endOfDay,
                        },
                        deleted_at: null,
                    },
                }),
            ]);

            return {
                total_revenue: revenue._sum.paid_amount || 0,
                total_users: totalUsers,
                new_enrollments: newEnrollments,
                new_users: newUsers,
                completed_payments: completedPayments,
            };
        } catch (error) {
            this.logger.error('Error calculating total revenue:', error);
            return {
                success: false,
                message: 'Failed to fetch total revenue',
                error: error.message,
            };
        }
    }


    /**
     * Get revenue growth data for charts
     */
    async getRevenueGrowth() {
        try {
            const now = new Date();
            const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

            // Get current month revenue
            const currentMonthRevenue = await this.prisma.paymentTransaction.aggregate({
                where: {
                    status: 'succeeded',
                    deleted_at: null,
                    created_at: {
                        gte: currentMonthStart,
                    },
                },
                _sum: {
                    paid_amount: true,
                },
            });

            // Get last month revenue
            const lastMonthRevenue = await this.prisma.paymentTransaction.aggregate({
                where: {
                    status: 'succeeded',
                    deleted_at: null,
                    created_at: {
                        gte: lastMonthStart,
                        lte: lastMonthEnd,
                    },
                },
                _sum: {
                    paid_amount: true,
                },
            });

            const currentRevenue = Number(currentMonthRevenue._sum.paid_amount || 0);
            const previousRevenue = Number(lastMonthRevenue._sum.paid_amount || 0);

            // Calculate growth percentage
            let growthPercentage = 0;
            if (previousRevenue > 0) {
                growthPercentage = ((currentRevenue - previousRevenue) / previousRevenue) * 100;
            } else if (currentRevenue > 0) {
                growthPercentage = 100; // 100% growth if no previous revenue
            }

            return {
                current_period_revenue: currentRevenue,
                previous_period_revenue: previousRevenue,
                growth_percentage: Math.round(growthPercentage * 100) / 100, // Round to 2 decimal places
                growth_direction: growthPercentage >= 0 ? 'up' : 'down',
                current_period_label: 'This period',
                previous_period_label: 'Last period',
            };
        } catch (error) {
            this.logger.error('Error calculating revenue growth:', error);
            return {
                success: false,
                message: 'Failed to fetch revenue growth data',
                error: error.message,
            };
        }
    }


    /**
     * Get dashboard data by calling individual methods
     */
    async getDashboard() {
        try {
            this.logger.log('Fetching dashboard data');

            const [dashboardStats, revenueGrowth, scheduleEvents] = await Promise.all([
                this.getTotalDashboardStats(),
                this.getRevenueGrowth(),
                this.scheduleEventService.listScheduleEvents(),
            ]);

            return {
                success: true,
                message: 'Dashboard data retrieved successfully',
                data: {
                    dashboardStats,
                  //  revenueGrowth,
                  scheduleEvents,
                },
            };
        } catch (error) {
            this.logger.error('Error fetching dashboard data:', error);
            return {
                success: false,
                message: 'Failed to fetch dashboard data',
                error: error.message,
            };
        }
    }
}
