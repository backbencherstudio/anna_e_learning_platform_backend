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
            await this.prisma.series.update({ where: { id: checkout.series_id }, data: { available_site: series.available_site - 1 } });

            await this.prisma.user.update({ where: { id: user.id }, data: { type: 'student' } });

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
    }

}
