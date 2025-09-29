import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class DashboardService {
    private readonly logger = new Logger(DashboardService.name);
    constructor(private readonly prisma: PrismaService) {
    }

    async getDashboard() {
        try {
            this.logger.log('Fetching dashboard data');

            const today = new Date();
            const startOfDay = new Date(today.setHours(0, 0, 0, 0));
            const endOfDay = new Date(today.setHours(23, 59, 59, 999));
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

            // Execute all queries in parallel for better performance
            const [
                // Revenue metrics
                totalRevenueResult,
                // Traffic today
                newEnrollmentsToday,
                newUsersToday,
                completedPaymentsToday,
                // User metrics
                totalUsers,
                activeUsers,
                students,
                admins,
                // Platform metrics
                totalSeries,
                totalCourses,
                totalEnrollments,
            ] = await Promise.all([
                // Total revenue from completed payments
                this.prisma.paymentTransaction.aggregate({
                    where: {
                        status: 'completed',
                        deleted_at: null,
                    },
                    _sum: {
                        paid_amount: true,
                    },
                }),
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
                // Total users
                this.prisma.user.count({
                    where: {
                        deleted_at: null,
                    },
                }),
                // Active users (with recent activity)
                this.prisma.user.count({
                    where: {
                        deleted_at: null,
                        updated_at: {
                            gte: thirtyDaysAgo,
                        },
                    },
                }),
                // Students
                this.prisma.user.count({
                    where: {
                        deleted_at: null,
                        type: 'student',
                    },
                }),
                // Admins
                this.prisma.user.count({
                    where: {
                        deleted_at: null,
                        type: 'admin',
                    },
                }),
                // Total published series
                this.prisma.series.count({
                    where: {
                        deleted_at: null,
                        visibility: 'PUBLISHED',
                    },
                }),
                // Total courses
                this.prisma.course.count({
                    where: {
                        deleted_at: null,
                    },
                }),
                // Total enrollments
                this.prisma.enrollment.count({
                    where: {
                        deleted_at: null,
                        status: { in: ['ACTIVE', 'COMPLETED'] },
                    },
                }),
            ]);

            return {
                success: true,
                message: 'Dashboard data retrieved successfully',
                data: {
                    revenue: {
                        total_revenue: totalRevenueResult._sum.paid_amount || 0,
                        currency: 'USD',
                    },
                    traffic: {
                        new_enrollments: newEnrollmentsToday,
                        new_users: newUsersToday,
                        completed_payments: completedPaymentsToday,
                        date: today.toISOString().split('T')[0],
                    },
                    users: {
                        total_users: totalUsers,
                        active_users: activeUsers,
                        students: students,
                        admins: admins,
                    },
                    metrics: {
                        total_series: totalSeries,
                        total_courses: totalCourses,
                        total_enrollments: totalEnrollments,
                        total_revenue: totalRevenueResult._sum.paid_amount || 0,
                    },
                    generated_at: new Date().toISOString(),
                },
            };
        } catch (error) {
            this.logger.error('Error fetching dashboard data:', error);
            return {
                success: false,
                message: 'Failed to fetch dashboard data',
                error: error.message,
                data: {
                    revenue: { total_revenue: 0, currency: 'USD' },
                    traffic: {
                        new_enrollments: 0,
                        new_users: 0,
                        completed_payments: 0,
                        date: new Date().toISOString().split('T')[0],
                    },
                    users: {
                        total_users: 0,
                        active_users: 0,
                        students: 0,
                        admins: 0,
                    },
                    metrics: {
                        total_series: 0,
                        total_courses: 0,
                        total_enrollments: 0,
                        total_revenue: 0,
                    },
                },
            };
        }
    }
}
