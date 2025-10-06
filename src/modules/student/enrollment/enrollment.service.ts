import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import { StripePayment } from '../../../common/lib/Payment/stripe/StripePayment';
import { TransactionRepository } from '../../../common/repository/transaction/transaction.repository';
import { SeriesService } from '../series/series.service';
import { EnrollType } from '@prisma/client';


@Injectable()
export class EnrollmentService {
    private readonly logger = new Logger(EnrollmentService.name);
    constructor(
        private readonly prisma: PrismaService,
        private readonly seriesService: SeriesService
    ) { }

    async create(body: CreateEnrollmentDto, userId: string) {
        const { checkout_id, amount, currency = 'usd' } = body;
        try {
            const user = await this.prisma.user.findUnique({ where: { id: userId } });
            if (!user) throw new BadRequestException('User not found');

            const checkout = await this.prisma.checkout.findUnique({ where: { id: checkout_id } });
            if (!checkout) throw new BadRequestException('Checkout not found');

            const series = await this.prisma.series.findUnique({ where: { id: checkout.series_id } });
            if (!series) throw new BadRequestException('Series not found');

            const finalAmount = Number(checkout.total_price);

            // Create or get enrollment
            let enrollment = await this.prisma.enrollment.findFirst({ where: { user_id: userId, series_id: series.id } });
            if (!enrollment) {
                enrollment = await this.prisma.enrollment.create({
                    data: {
                        user_id: userId,
                        series_id: checkout.series_id,
                        status: 'ACTIVE',
                        payment_status: 'pending',
                        enroll_type: checkout.type as EnrollType,
                    },
                });
            }

            // Ensure Stripe customer
            let customerId = user.billing_id as string | null;
            if (!customerId) {
                const customer = await StripePayment.createCustomer({
                    user_id: user.id,
                    name: user.name || 'Unknown',
                    email: user.email || '',
                });
                customerId = customer.id;
                await this.prisma.user.update({ where: { id: user.id }, data: { billing_id: customerId } });
            }

            // Create PaymentIntent
            const paymentIntent = await StripePayment.createPaymentIntent({
                amount: finalAmount,
                currency,
                customer_id: customerId!,
                metadata: {
                    enrollmentId: enrollment.id,
                    userId: user.id,
                    series_id: checkout.series_id,
                },
            });

            // Update enrollment with payment reference
            await this.prisma.enrollment.update({
                where: { id: enrollment.id },
                data: {
                    payment_reference_number: paymentIntent.id,
                },
            });

            // Persist transaction and keep enrollment pending
            await TransactionRepository.createTransaction({
                enrollment_id: enrollment.id,
                amount: finalAmount,
                currency,
                reference_number: paymentIntent.id,
                status: 'pending',
            });

            // decrise available site
          //  await this.prisma.series.update({ where: { id: checkout.series_id }, data: { available_site: series.available_site - 1 } });

            await this.prisma.user.update({ where: { id: user.id }, data: { type: 'student' } });

            // Initialize course progress and unlock first lesson
            await this.seriesService.unlockFirstLessonForUser(enrollment.user_id, enrollment.series_id);

            await this.prisma.checkout.delete({ where: { id: checkout_id } });

            return {
                success: true,
                message: 'Payment intent created successfully. Complete payment to activate enrollment.',
                data: {
                    client_secret: paymentIntent.client_secret,
                    enrollment_id: enrollment.id,
                    payment_intent_id: paymentIntent.id,
                    amount: finalAmount,
                    currency,
                    status: 'pending',
                },
            };
        } catch (e) {
            const message = e?.message || 'Failed to create enrollment payment';
            throw new BadRequestException(message);
        }
    }


    /**
     * Get all enrollment data for a specific student
     */
    async getStudentEnrollments(userId: string) {
        try {
            this.logger.log(`Fetching all enrollments for student: ${userId}`);

            const enrollments = await this.prisma.enrollment.findMany({
                where: {
                    user_id: userId,
                    deleted_at: null,
                },
                include: {
                    series: {
                        select: {
                            id: true,
                            title: true,
                            description: true,
                            thumbnail: true,
                            total_price: true,
                            course_type: true,
                            duration: true,
                            start_date: true,
                            end_date: true,
                            available_site: true,
                        },
                    },
                    payment_transactions: {
                        select: {
                            id: true,
                            amount: true,
                            currency: true,
                            status: true,
                            reference_number: true,
                            created_at: true,
                        },
                        orderBy: { created_at: 'desc' },
                    },
                },
                orderBy: { enrolled_at: 'desc' },
            });

            if (enrollments.length === 0) {
                return {
                    success: true,
                    message: 'No enrollments found for this student',
                    data: {
                        enrollments: [],
                        total_enrollments: 0,
                        total_invested: 0,
                        active_enrollments: 0,
                        completed_enrollments: 0,
                    },
                };
            }

            // Calculate statistics
            const totalEnrollments = enrollments.length;
            const activeEnrollments = enrollments.filter(e => e.status === 'ACTIVE').length;
            const completedEnrollments = enrollments.filter(e => e.status === 'COMPLETED').length;
            const totalInvested = enrollments.reduce((sum, e) => sum + Number(e.series.total_price || 0), 0);
            const avgProgress = totalEnrollments > 0
                ? Math.round((enrollments.reduce((sum, e) => sum + (e.progress_percentage || 0), 0) / totalEnrollments) * 100) / 100
                : 0;

            // Add file URLs and additional data
            const enrichedEnrollments = enrollments.map(enrollment => {
                const seriesData = enrollment.series;

                // Add thumbnail URL
                if (seriesData.thumbnail) {
                    seriesData['thumbnail_url'] = `https://your-storage-url.com/series-thumbnails/${seriesData.thumbnail}`;
                }

                return {
                    id: enrollment.id,
                    status: enrollment.status,
                    payment_status: enrollment.payment_status,
                    enroll_type: enrollment.enroll_type,
                    progress_percentage: enrollment.progress_percentage,
                    enrolled_at: enrollment.enrolled_at,
                    completed_at: enrollment.completed_at,
                    expires_at: enrollment.expires_at,
                    last_accessed_at: enrollment.last_accessed_at,
                    payment_reference_number: enrollment.payment_reference_number,
                    series: seriesData,
                    transactions: enrollment.payment_transactions,
                };
            });

            return {
                success: true,
                message: 'Student enrollments retrieved successfully',
                data: {
                    enrollments: enrichedEnrollments,
                    statistics: {
                        total_enrollments: totalEnrollments,
                        active_enrollments: activeEnrollments,
                        completed_enrollments: completedEnrollments,
                        total_invested: totalInvested,
                        average_progress: avgProgress,
                    },
                },
            };
        } catch (error) {
            this.logger.error(`Error fetching student enrollments: ${error.message}`, error.stack);
            return {
                success: false,
                message: 'Failed to fetch student enrollments',
                error: error.message,
            };
        }
    }

    /**
* Handle successful payment (called by webhook)
*/
    async handlePaymentSuccess(paymentIntentId: string) {

        // Find enrollment by payment reference
        const enrollment = await this.prisma.enrollment.findFirst({
            where: {
                payment_reference_number: paymentIntentId,
            },
        });

        if (!enrollment) {
            console.error('Enrollment not found for payment intent:', paymentIntentId);
            return;
        }

        // Update enrollment status to active
        await this.prisma.enrollment.update({
            where: { id: enrollment.id },
            data: {
                status: 'ACTIVE',
                payment_status: 'completed',
            },
        });

        this.logger.log(`Payment completed and course progress initialized for enrollment ${enrollment.id}`);
    }

}
