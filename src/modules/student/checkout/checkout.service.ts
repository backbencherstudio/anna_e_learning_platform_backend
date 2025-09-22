import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class CheckoutService {
    private readonly logger = new Logger(CheckoutService.name);
    constructor(private readonly prisma: PrismaService) { }

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