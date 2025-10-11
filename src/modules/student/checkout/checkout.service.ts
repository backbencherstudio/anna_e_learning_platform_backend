import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SojebStorage } from 'src/common/lib/Disk/SojebStorage';
import appConfig from 'src/config/app.config';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class CheckoutService {
    private readonly logger = new Logger(CheckoutService.name);
    constructor(private readonly prisma: PrismaService) { }


    async findAll(page: number = 1, limit: number = 10, search?: string, type?: string): Promise<any> {
        try {
            const skip = (page - 1) * limit;
            const where: any = search ? {
                OR: [
                    { title: { contains: search, mode: 'insensitive' as any } },
                    { summary: { contains: search, mode: 'insensitive' as any } },
                    { description: { contains: search, mode: 'insensitive' as any } },
                ],
            } : {};

            if (type) {
                where.course_type = type;
            }

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
                            lesson_files: { select: { id: true, title: true, kind: true } },
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
                    lesson_files: c.lesson_files,
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

    async create(userId: string, seriesId: string) {
        try {
            if (!seriesId) throw new BadRequestException('series_id is required');

            const series = await this.prisma.series.findUnique({
                where: {
                    id: seriesId
                },
                select: {
                    id: true, total_price: true
                }
            });
            if (!series) throw new NotFoundException('Series not found');

            const checkout = await this.prisma.checkout.create({
                data: { user_id: userId, series_id: seriesId, status: 'CREATED', total_price: series.total_price },
            });

            return { success: true, message: 'Checkout created', data: checkout };
        } catch (error) {
            this.logger.error(`Checkout create failed: ${error.message}`, error.stack);
            if (error instanceof BadRequestException || error instanceof NotFoundException) throw error;
            return { success: false, message: 'Failed to create checkout', error: error.message };
        }
    }

    async list(userId: string) {
        try {
            const items = await this.prisma.checkout.findMany({
                where: { user_id: userId, deleted_at: null },
                orderBy: { created_at: 'desc' },
                include: { series: { select: { id: true, title: true, thumbnail: true, total_price: true } } },
            });
            return { success: true, message: 'Checkouts retrieved', data: items };
        } catch (error) {
            this.logger.error(`Checkout list failed: ${error.message}`, error.stack);
            return { success: false, message: 'Failed to fetch checkouts', error: error.message };
        }
    }

    async getOne(userId: string, id: string) {
        try {
            const item = await this.prisma.checkout.findFirst({
                where: { id, user_id: userId, deleted_at: null },
                include: { series: { select: { id: true, title: true, thumbnail: true, total_price: true } } },
            });
            if (!item) throw new NotFoundException('Checkout not found');
            return { success: true, message: 'Checkout retrieved', data: item };
        } catch (error) {
            this.logger.error(`Checkout getOne failed: ${error.message}`, error.stack);
            if (error instanceof NotFoundException) throw error;
            return { success: false, message: 'Failed to fetch checkout', error: error.message };
        }
    }

    async getAppliedCode(userId: string, checkoutId: string, code?: string) {
        try {
            const checkout = await this.prisma.checkout.findFirst({
                where: { id: checkoutId, user_id: userId, deleted_at: null },
            });
            if (!checkout) throw new NotFoundException('Checkout not found');

            // find scholarship code: use provided code or last used by user on this series
            const scholarship = await this.prisma.scholarshipCode.findFirst({
                where: {
                    deleted_at: null,
                    student: { id: userId },
                    OR: [
                        { series: { id: checkout.series_id || undefined } },
                        { series: null },
                    ],
                    ...(code ? { code } : {}),
                },
                orderBy: { created_at: 'desc' },
                include: { courses: { select: { id: true, title: true } } },
            });
            if (!scholarship) throw new NotFoundException('No applied scholarship code found');

            const courseIds = new Set<string>(scholarship.courses.map(c => c.id));

            const seriesWithCourses = await this.prisma.series.findUnique({
                where: { id: checkout.series_id || undefined },
                select: {
                    id: true,
                    title: true,
                    courses: { select: { id: true, title: true, price: true } },
                },
            });

            const allCourses = (seriesWithCourses?.courses || []).map(c => {
                const isScholar = courseIds.has(c.id);
                const effective = isScholar ? 0 : Number(c.price || 0);
                return {
                    ...c,
                    is_scholarship: isScholar,
                    display_price: effective === 0 ? 'free' : effective,
                };
            });

            const effectiveTotal = allCourses.reduce((sum, c: any) => sum + (c.is_scholarship ? 0 : Number(c.price || 0)), 0);

            return {
                success: true,
                message: 'Applied code retrieved',
                data: {
                    checkout: { id: checkout.id, total_price: checkout.total_price, effective_total: effectiveTotal, status: checkout.status },
                    applied_code: {
                        id: (scholarship as any).id,
                        code: scholarship.code,
                        name: scholarship.name,
                        code_type: scholarship.code_type,
                        scholarship_type: scholarship.scholarship_type,
                        courses: scholarship.courses,
                    },
                    series: {
                        id: seriesWithCourses?.id,
                        title: seriesWithCourses?.title,
                        courses: allCourses,
                        //   scholarship_courses: scholarshipCourses,
                    },
                },
            };
        } catch (error) {
            this.logger.error(`Get applied code failed: ${error.message}`, error.stack);
            if (error instanceof NotFoundException) throw error;
            return { success: false, message: 'Failed to retrieve applied code', error: error.message };
        }
    }


    async applyCode(userId: string, checkoutId: string, code: string) {
        try {
            if (!checkoutId || !code) throw new BadRequestException('checkout_id and code are required');

            const checkout = await this.prisma.checkout.findFirst({
                where: { id: checkoutId, user_id: userId, deleted_at: null },
                include: { series: { include: { courses: { select: { id: true, price: true } } } } },
            });
            if (!checkout) throw new NotFoundException('Checkout not found');

            const scholarship = await this.prisma.scholarshipCode.findFirst({
                where: {
                    code,
                    deleted_at: null,
                    student: { id: userId },
                    OR: [
                        { series: { id: checkout.series_id || undefined } },
                        { series: null },
                    ],
                },
                include: { courses: { select: { id: true } } },
            });
            if (!scholarship) throw new NotFoundException('Invalid or unauthorized code');

            const courseIdsToZero = new Set<string>(scholarship.courses.map(c => c.id));

            // Recalculate total price virtually (do NOT mutate course prices)
            const seriesCourses = await this.prisma.course.findMany({
                where: { series_id: checkout.series_id || undefined },
                select: { id: true, price: true },
            });

            const newTotal = seriesCourses.reduce((sum, c) => {
                const effective = courseIdsToZero.has(c.id) ? 0 : Number(c.price || 0);
                return sum + effective;
            }, 0);

            const updatedCheckout = await this.prisma.checkout.update({
                where: { id: checkout.id },
                data: { total_price: newTotal, status: 'CODE_APPLIED', type: 'SCHOLARSHIP' },
            });

            // return courses with display_price (virtual zero for scholarship courses)
            const seriesWithCourses = await this.prisma.series.findUnique({
                where: { id: checkout.series_id || undefined },
                select: {
                    id: true,
                    title: true,
                    courses: { select: { id: true, title: true, price: true } }
                }
            });
            const courses = (seriesWithCourses?.courses || []).map(c => {
                const effective = courseIdsToZero.has(c.id) ? 0 : Number(c.price || 0);
                return {
                    ...c,
                    display_price: effective === 0 ? 'free' : effective,
                    is_scholarship: courseIdsToZero.has(c.id),
                };
            });

            return { success: true, message: 'Code applied', data: { checkout: updatedCheckout, series: { id: seriesWithCourses?.id, title: seriesWithCourses?.title, courses } } };
        } catch (error) {
            this.logger.error(`Apply code failed: ${error.message}`, error.stack);
            if (error instanceof BadRequestException || error instanceof NotFoundException) throw error;
            return { success: false, message: 'Failed to apply code', error: error.message };
        }
    }




    async remove(userId: string, id: string) {
        try {
            // soft delete
            await this.prisma.checkout.update({
                where: { id },
                data: { deleted_at: new Date() },
            });
            return { success: true, message: 'Checkout removed', data: { id } };
        } catch (error) {
            this.logger.error(`Checkout remove failed: ${error.message}`, error.stack);
            return { success: false, message: 'Failed to remove checkout', error: error.message };
        }
    }
}