import { Injectable, BadRequestException } from '@nestjs/common';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import { StripePayment } from '../../../common/lib/Payment/stripe/StripePayment';
import { TransactionRepository } from '../../../common/repository/transaction/transaction.repository';
import { SeriesService } from '../series/series.service';

@Injectable()
export class EnrollmentService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly seriesService: SeriesService
    ) { }

    async create(body: CreateEnrollmentDto, userId: string) {
        const { series_id, amount, currency = 'usd' } = body;
        try {
            const user = await this.prisma.user.findUnique({ where: { id: userId } });
            if (!user) throw new BadRequestException('User not found');

            const series = await this.prisma.series.findUnique({ where: { id: series_id } });
            if (!series) throw new BadRequestException('Series not found');

            // Create or get enrollment
            let enrollment = await this.prisma.enrollment.findFirst({ where: { user_id: userId, series_id } });
            if (!enrollment) {
                enrollment = await this.prisma.enrollment.create({
                    data: {
                        user_id: userId,
                        series_id: series_id,
                        status: 'ACTIVE',
                        payment_status: 'pending',
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
                amount: Number(series.total_price),
                currency,
                customer_id: customerId!,
                metadata: {
                    enrollmentId: enrollment.id,
                    userId: user.id,
                    series_id,
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
                amount: Number(series.total_price),
                currency,
                reference_number: paymentIntent.id,
                status: 'pending',
            });

            //  await this.prisma.enrollment.update({ where: { id: enrollment.id }, data: { payment_status: 'pending' } });

            await this.prisma.user.update({ where: { id: user.id }, data: { type: 'student' } });

            return {
                success: true,
                message: 'Payment intent created successfully. Complete payment to activate enrollment.',
                data: {
                    client_secret: paymentIntent.client_secret,
                    enrollment_id: enrollment.id,
                    payment_intent_id: paymentIntent.id,
                    amount: Number(series.total_price),
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

        // Unlock the first lesson for the user
        await this.seriesService.unlockFirstLessonForUser(enrollment.user_id, enrollment.series_id);
    }

}
