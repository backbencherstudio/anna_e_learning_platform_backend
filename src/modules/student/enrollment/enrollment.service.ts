import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import { StripePayment } from '../../../common/lib/Payment/stripe/StripePayment';
import { TransactionRepository } from '../../../common/repository/transaction/transaction.repository';
import { SeriesService } from '../series/series.service';
import { SojebStorage } from 'src/common/lib/Disk/SojebStorage';
import appConfig from 'src/config/app.config';

@Injectable()
export class EnrollmentService {
    private readonly logger = new Logger(EnrollmentService.name);
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

            await this.prisma.enrollment.update({ where: { id: enrollment.id }, data: { payment_status: 'pending' } });

            await this.prisma.user.update({ where: { id: user.id }, data: { type: 'student' } });

            await this.seriesService.unlockFirstLessonForUser(enrollment.user_id, enrollment.series_id);

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

    async findAll(page: number = 1, limit: number = 10, search?: string): Promise<any> {
        try {
          const skip = (page - 1) * limit;
          const where = search ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' as any } },
              { summary: { contains: search, mode: 'insensitive' as any } },
              { description: { contains: search, mode: 'insensitive' as any } },
            ],
          } : {};
    
          const [series, total] = await Promise.all([
            this.prisma.series.findMany({
              where,
              skip,
              take: limit,
              select: {
                id: true,
                title: true,
                slug: true,
                summary: true,
                description: true,
                visibility: true,
                video_length: true,
                duration: true,
                start_date: true,
                end_date: true,
                thumbnail: true,
                total_price: true,
                course_type: true,
                note: true,
                available_site: true,
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
                    price: true,
                  },
                  orderBy: { position: 'asc' },
                },
              },
              orderBy: { created_at: 'desc' },
            }),
            this.prisma.series.count({ where }),
          ]);

          for (const seriesItem of series) {
            if (seriesItem.thumbnail) {
              seriesItem['thumbnail_url'] = SojebStorage.url(appConfig().storageUrl.series_thumbnail + seriesItem.thumbnail);
            }
          }
    
          // Calculate pagination values
          const totalPages = Math.ceil(total / limit);
          const hasNextPage = page < totalPages;
          const hasPreviousPage = page > 1;
    
          return {
            success: true,
            message: 'Series retrieved successfully',
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
          this.logger.error(`Error fetching series: ${error.message}`, error.stack);
    
          return {
            success: false,
            message: 'Failed to fetch series',
            error: error.message,
          };
        }
      }

    /**
     * Get concise series summary for cards/details
     */
    async findSummary(seriesId: string): Promise<any> {
        try {
            const series = await this.prisma.series.findUnique({
                where: { id: seriesId },
                select: {
                    id: true,
                    title: true,
                    description: true,
                    total_price: true,
                    video_length: true,
                    course_type: true,
                    available_site: true,
                    start_date: true,
                    end_date: true,
                    thumbnail: true,
                    courses: {
                        select: {
                            id: true,
                            title: true,
                            price: true,
                            video_length: true,
                            lesson_files: { select: { id: true, kind: true } },
                        },
                    },
                },
            });

            if (!series) throw new NotFoundException(`Series with ID ${seriesId} not found`);

            if (series.thumbnail) {
                series['thumbnail_url'] = SojebStorage.url(appConfig().storageUrl.series_thumbnail + series.thumbnail);
            }

            const coursesCount = series.courses.length;
            let videos = 0, audios = 0, docs = 0, lessons = 0;
            for (const c of series.courses) {
                lessons += c.lesson_files.length;
                videos += c.lesson_files.filter(l => l.kind === 'video').length;
                audios += c.lesson_files.filter(l => l.kind === 'audio').length;
                docs += c.lesson_files.filter(l => l.kind === 'pdf' || l.kind === 'slides').length;
            }

            const data = {
                id: series.id,
                title: series.title,
                description: series.description,
                thumbnail_url: series['thumbnail_url'],
                courses: series.courses.map(c => ({
                    title: c.title,
                    price: c.price,
                })),
                total_price: series.total_price,
                total_time: series.video_length,
                course_type: series.course_type,
                seats_left: series.available_site,
                start_date: series.start_date,
                end_date: series.end_date,
                counts: { courses: coursesCount, videos, audios, docs, lessons },
            };

            return { success: true, message: 'Series summary retrieved', data };
        } catch (error) {
            this.logger.error(`Error fetching series summary for ${seriesId}: ${error.message}`, error.stack);
            if (error instanceof NotFoundException) throw error;
            return { success: false, message: 'Failed to fetch series summary', error: error.message };
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
