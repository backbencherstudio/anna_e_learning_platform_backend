import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class SeriesPublishService {
    private readonly logger = new Logger(SeriesPublishService.name);

    constructor(
        @InjectQueue('series-publish') private seriesPublishQueue: Queue,
        private readonly prisma: PrismaService,
    ) { }

    /**
     * Schedule a series for automatic publication at a specific date/time
     */
    async scheduleSeriesPublication(seriesId: string, publishAt: Date): Promise<void> {
        try {
            this.logger.log(`Scheduling series ${seriesId} for publication at ${publishAt}`);

            // Add job to schedule the publication
            const scheduleJob = await this.seriesPublishQueue.add(
                'schedule-series-publish',
                {
                    seriesId,
                    publishAt,
                },
                {
                    priority: 1,
                }
            );

            // Add delayed job for actual publication
            const publishJob = await this.seriesPublishQueue.add(
                'publish-series',
                {
                    seriesId,
                    publishAt,
                },
                {
                    delay: publishAt.getTime() - Date.now(),
                    priority: 2,
                }
            );

            this.logger.log(`Scheduled publication job for series ${seriesId} with job IDs: schedule=${scheduleJob.id}, publish=${publishJob.id}`);

        } catch (error) {
            this.logger.error(`Failed to schedule series publication for ${seriesId}: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Cancel scheduled publication for a series
     */
    async cancelScheduledPublication(seriesId: string): Promise<void> {
        try {
            this.logger.log(`Cancelling scheduled publication for series ${seriesId}`);

            // Get all jobs for this series
            const jobs = await this.seriesPublishQueue.getJobs(['delayed', 'waiting', 'active']);

            for (const job of jobs) {
                if (job.data.seriesId === seriesId) {
                    await job.remove();
                    this.logger.log(`Removed job ${job.id} for series ${seriesId}`);
                }
            }

            // Update series status back to DRAFT
            await this.prisma.series.update({
                where: { id: seriesId },
                data: {
                    publication_status: 'DRAFT',
                    scheduled_publish_at: null,
                },
            });

            this.logger.log(`Successfully cancelled scheduled publication for series ${seriesId}`);

        } catch (error) {
            this.logger.error(`Failed to cancel scheduled publication for ${seriesId}: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Publish a series immediately
     */
    async publishSeriesImmediately(seriesId: string): Promise<void> {
        try {
            this.logger.log(`Publishing series ${seriesId} immediately`);

            await this.prisma.series.update({
                where: { id: seriesId },
                data: {
                    visibility: 'PUBLISHED',
                    publication_status: 'PUBLISHED',
                    scheduled_publish_at: null,
                },
            });

            // Cancel any scheduled jobs for this series
            await this.cancelScheduledPublication(seriesId);

            this.logger.log(`Successfully published series ${seriesId} immediately`);

        } catch (error) {
            this.logger.error(`Failed to publish series ${seriesId} immediately: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Get publication status for a series
     */
    async getSeriesPublicationStatus(seriesId: string): Promise<{
        status: string;
        scheduledAt: Date | null;
        publishedAt: Date | null;
    }> {
        const series = await this.prisma.series.findUnique({
            where: { id: seriesId },
            select: {
                publication_status: true,
                scheduled_publish_at: true,
                updated_at: true,
                visibility: true,
            },
        });

        if (!series) {
            throw new Error(`Series with ID ${seriesId} not found`);
        }

        return {
            status: series.publication_status || 'DRAFT',
            scheduledAt: series.scheduled_publish_at,
            publishedAt: series.visibility === 'PUBLISHED' ? series.updated_at : null,
        };
    }
}
