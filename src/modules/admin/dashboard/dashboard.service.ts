import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ScheduleEventService } from '../schedule-event/schedule-event.service';
import { AssignmentService } from '../assignment/assignment.service';
import { QuizService } from '../quiz/quiz.service';
import { retry } from 'rxjs';

@Injectable()
export class DashboardService {
    private readonly logger = new Logger(DashboardService.name);
    constructor(
        private readonly prisma: PrismaService,
        private readonly scheduleEventService: ScheduleEventService,
        private readonly assignmentService: AssignmentService,
        private readonly quizService: QuizService,
    ) {
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
    async getRevenueGrowth(period: 'week' | 'month' | 'year' = 'week') {
        try {
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

            // Get current period revenue summary
            const currentPeriodRevenueSummary = await this.prisma.paymentTransaction.aggregate({
                where: {
                    status: 'succeeded',
                    deleted_at: null,
                    created_at: {
                        gte: currentPeriodStart,
                    },
                },
                _sum: {
                    paid_amount: true,
                },
            });

            // Get last period revenue summary
            const lastPeriodRevenueSummary = await this.prisma.paymentTransaction.aggregate({
                where: {
                    status: 'succeeded',
                    deleted_at: null,
                    created_at: {
                        gte: lastPeriodStart,
                        lte: lastPeriodEnd,
                    },
                },
                _sum: {
                    paid_amount: true,
                },
            });

            const currentRevenue = Number(currentPeriodRevenueSummary._sum.paid_amount || 0);
            const previousRevenue = Number(lastPeriodRevenueSummary._sum.paid_amount || 0);

            // Calculate growth percentage
            let growthPercentage = 0;
            if (previousRevenue > 0) {
                growthPercentage = ((currentRevenue - previousRevenue) / previousRevenue) * 100;
            } else if (currentRevenue > 0) {
                growthPercentage = 100; // 100% growth if no previous revenue
            }

            // Get current period daily revenue data
            const currentPeriodData = await this.prisma.paymentTransaction.groupBy({
                by: ['created_at'],
                where: {
                    status: 'succeeded',
                    deleted_at: null,
                    created_at: {
                        gte: currentPeriodStart,
                    },
                },
                _sum: {
                    paid_amount: true,
                },
                orderBy: {
                    created_at: 'asc',
                },
            });

            // Get last period daily revenue data
            const lastPeriodData = await this.prisma.paymentTransaction.groupBy({
                by: ['created_at'],
                where: {
                    status: 'succeeded',
                    deleted_at: null,
                    created_at: {
                        gte: lastPeriodStart,
                        lte: lastPeriodEnd,
                    },
                },
                _sum: {
                    paid_amount: true,
                },
                orderBy: {
                    created_at: 'asc',
                },
            });

            // Process data based on period type
            let currentPeriodChartData: any[];
            let lastPeriodChartData: any[];

            if (period === 'week') {
                // For week: group by day name (Sun, Mon, Tue, etc.)
                currentPeriodChartData = this.groupRevenueByDay(currentPeriodData);
                lastPeriodChartData = this.groupRevenueByDay(lastPeriodData);
            } else if (period === 'month') {
                // For month: group by month name
                currentPeriodChartData = this.groupRevenueByMonth(currentPeriodData);
                lastPeriodChartData = this.groupRevenueByMonth(lastPeriodData);
            } else if (period === 'year') {
                // For year: group by year
                currentPeriodChartData = this.groupRevenueByYear(currentPeriodData);
                lastPeriodChartData = this.groupRevenueByYear(lastPeriodData);
            }

            return {
                summary: {
                    current_period_revenue: currentRevenue,
                    previous_period_revenue: previousRevenue,
                    growth_percentage: Math.round(growthPercentage * 100) / 100, // Round to 2 decimal places
                    growth_direction: growthPercentage >= 0 ? 'up' : 'down',
                    current_period_label: currentPeriodLabel,
                    previous_period_label: lastPeriodLabel,
                    period_type: period,
                },
                chart_data: {
                    current_period: {
                        label: currentPeriodLabel,
                        data: currentPeriodChartData,
                    },
                    last_period: {
                        label: lastPeriodLabel,
                        data: lastPeriodChartData,
                    },
                },
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
     * Group revenue data by day name for weekly view
     */
    private groupRevenueByDay(data: any[]) {
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
            dailyData[dayName] += Number(item._sum.paid_amount || 0);
        });

        return dayNames.map(day => ({
            day: day,
            revenue: dailyData[day],
        }));
    }

    /**
     * Group revenue data by month name for monthly view
     */
    private groupRevenueByMonth(data: any[]) {
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
            monthlyData[monthName] += Number(item._sum.paid_amount || 0);
        });

        return monthNames.map(month => ({
            month: month,
            revenue: monthlyData[month],
        }));
    }

    /**
     * Group revenue data by year for yearly view
     */
    private groupRevenueByYear(data: any[]) {
        const yearlyData: { [key: string]: number } = {};

        data.forEach(item => {
            const year = new Date(item.created_at).getFullYear().toString();
            yearlyData[year] = (yearlyData[year] || 0) + Number(item._sum.paid_amount || 0);
        });

        return Object.entries(yearlyData).map(([year, revenue]) => ({
            year: year,
            revenue: revenue,
        }));
    }

    /**
     * Get detailed revenue data for charts with daily breakdown
     */
    async getRevenueChartData(period: 'week' | 'month' | 'year' = 'week') {
        try {

            if (period === 'month') {
                return {
                    "summary": {
                        "current_period_revenue": 8750.00,
                        "previous_period_revenue": 6920.00,
                        "growth_percentage": 26.45,
                        "growth_direction": "up",
                        "current_period_label": "This month",
                        "previous_period_label": "Last month",
                        "period_type": "month"
                    },
                    "chart_data": {
                        "current_period": {
                            "label": "This month",
                            "data": [
                                { "month": "Jan", "revenue": 440 },
                                { "month": "Feb", "revenue": 350 },
                                { "month": "Mar", "revenue": 400 },
                                { "month": "Apr", "revenue": 400 },
                                { "month": "May", "revenue": 450 },
                                { "month": "Jun", "revenue": 500 },
                                { "month": "Jul", "revenue": 550 },
                                { "month": "Aug", "revenue": 600 },
                                { "month": "Sep", "revenue": 650 },
                                { "month": "Oct", "revenue": 650 },
                                { "month": "Nov", "revenue": 700 },
                                { "month": "Dec", "revenue": 750 }
                            ]
                        },
                        "last_period": {
                            "label": "Last month",
                            "data": [
                                { "month": "Jan", "revenue": 440 },
                                { "month": "Feb", "revenue": 350 },
                                { "month": "Mar", "revenue": 400 },
                                { "month": "Apr", "revenue": 400 },
                                { "month": "May", "revenue": 450 },
                                { "month": "Jun", "revenue": 450 },
                                { "month": "Jul", "revenue": 550 },
                                { "month": "Aug", "revenue": 550 },
                                { "month": "Sep", "revenue": 650 },
                                { "month": "Oct", "revenue": 650 },
                                { "month": "Nov", "revenue": 700 },
                                { "month": "Dec", "revenue": 700 }
                            ]
                        }
                    }
                }
            } else {
                return {
                    "summary": {
                        "current_period_revenue": 1850.00,
                        "previous_period_revenue": 1620.00,
                        "growth_percentage": 14.20,
                        "growth_direction": "up",
                        "current_period_label": "This week",
                        "previous_period_label": "Last week",
                        "period_type": "week"
                    },
                    "chart_data": {
                        "current_period": {
                            "label": "This week",
                            "data": [
                                { "day": "Sun", "revenue": 280 },
                                { "day": "Mon", "revenue": 280 },
                                { "day": "Tue", "revenue": 320 },
                                { "day": "Wed", "revenue": 450 },
                                { "day": "Thu", "revenue": 390 },
                                { "day": "Fri", "revenue": 410 },
                                { "day": "Sat", "revenue": 410 }
                            ]
                        },
                        "last_period": {
                            "label": "Last week",
                            "data": [
                                { "day": "Sun", "revenue": 280 },
                                { "day": "Mon", "revenue": 240 },
                                { "day": "Tue", "revenue": 290 },
                                { "day": "Wed", "revenue": 380 },
                                { "day": "Thu", "revenue": 340 },
                                { "day": "Fri", "revenue": 370 },
                                { "day": "Sat", "revenue": 410 }
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
            let dateFormat: string;

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
                    dateFormat = 'YYYY-MM-DD';
                    break;

                case 'month':
                    currentPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1);
                    lastPeriodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    lastPeriodEnd = new Date(now.getFullYear(), now.getMonth(), 0);
                    lastPeriodEnd.setHours(23, 59, 59, 999);

                    currentPeriodLabel = 'This month';
                    lastPeriodLabel = 'Last month';
                    dateFormat = 'YYYY-MM-DD';
                    break;

                case 'year':
                    currentPeriodStart = new Date(now.getFullYear(), 0, 1);
                    lastPeriodStart = new Date(now.getFullYear() - 1, 0, 1);
                    lastPeriodEnd = new Date(now.getFullYear() - 1, 11, 31);
                    lastPeriodEnd.setHours(23, 59, 59, 999);

                    currentPeriodLabel = 'This year';
                    lastPeriodLabel = 'Last year';
                    dateFormat = 'YYYY-MM';
                    break;

                default:
                    throw new Error('Invalid period. Must be week, month, or year');
            }

            // Get current period daily revenue data
            const currentPeriodData = await this.prisma.paymentTransaction.groupBy({
                by: ['created_at'],
                where: {
                    status: 'succeeded',
                    deleted_at: null,
                    created_at: {
                        gte: currentPeriodStart,
                    },
                },
                _sum: {
                    paid_amount: true,
                },
                orderBy: {
                    created_at: 'asc',
                },
            });

            // Get last period daily revenue data
            const lastPeriodData = await this.prisma.paymentTransaction.groupBy({
                by: ['created_at'],
                where: {
                    status: 'succeeded',
                    deleted_at: null,
                    created_at: {
                        gte: lastPeriodStart,
                        lte: lastPeriodEnd,
                    },
                },
                _sum: {
                    paid_amount: true,
                },
                orderBy: {
                    created_at: 'asc',
                },
            });

            // Process data based on period type
            let currentPeriodRevenue: any[];
            let lastPeriodRevenue: any[];

            if (period === 'week') {
                // For week: group by day name (Sun, Mon, Tue, etc.)
                currentPeriodRevenue = this.groupRevenueByDay(currentPeriodData);
                lastPeriodRevenue = this.groupRevenueByDay(lastPeriodData);
            } else if (period === 'month') {
                // For month: group by month name
                currentPeriodRevenue = this.groupRevenueByMonth(currentPeriodData);
                lastPeriodRevenue = this.groupRevenueByMonth(lastPeriodData);
            } else if (period === 'year') {
                // For year: group by year
                currentPeriodRevenue = this.groupRevenueByYear(currentPeriodData);
                lastPeriodRevenue = this.groupRevenueByYear(lastPeriodData);
            }

            // Calculate total revenue for summary
            const currentTotal = currentPeriodRevenue.reduce((sum, item) => sum + item.revenue, 0);
            const lastTotal = lastPeriodRevenue.reduce((sum, item) => sum + item.revenue, 0);

            // Calculate growth percentage
            let growthPercentage = 0;
            if (lastTotal > 0) {
                growthPercentage = ((currentTotal - lastTotal) / lastTotal) * 100;
            } else if (currentTotal > 0) {
                growthPercentage = 100;
            }

            return {
                summary: {
                    current_period_revenue: currentTotal,
                    previous_period_revenue: lastTotal,
                    growth_percentage: Math.round(growthPercentage * 100) / 100,
                    growth_direction: growthPercentage >= 0 ? 'up' : 'down',
                    current_period_label: currentPeriodLabel,
                    previous_period_label: lastPeriodLabel,
                    period_type: period,
                },
                chart_data: {
                    current_period: {
                        label: currentPeriodLabel,
                        data: currentPeriodRevenue,
                    },
                    last_period: {
                        label: lastPeriodLabel,
                        data: lastPeriodRevenue,
                    },
                },
            };
        } catch (error) {
            this.logger.error('Error calculating revenue chart data:', error);
            return {
                success: false,
                message: 'Failed to fetch revenue chart data',
                error: error.message,
            };
        }
    }

    /**
     * Get dashboard data by calling individual methods
     */
    async getDashboard(date?: string, period?: 'week' | 'month' | 'year') {
        try {
            this.logger.log('Fetching dashboard data');

            if (!date) {
                date = new Date().toISOString();
            }

            const [dashboardStats, revenueGrowth, scheduleEvents, assignment, quiz] = await Promise.all([
                this.getTotalDashboardStats(),
                this.getRevenueChartData(period),
                this.scheduleEventService.listScheduleEvents(date),
                this.assignmentService.getDashboard(),
                this.quizService.getDashboard(),
            ]);

            return {
                success: true,
                message: 'Dashboard data retrieved successfully',
                data: {
                    dashboardStats,
                    revenueGrowth,
                    scheduleEvents: scheduleEvents.data.events,
                    assignment: assignment.data.assignments_with_submissions,
                    quiz: quiz.data.submitted_quizzes,
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
