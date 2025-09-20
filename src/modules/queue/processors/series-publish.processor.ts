import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface SeriesPublishJobData {
    seriesId: string;
    publishAt: Date;
}

@Processor('series-publish')
@Injectable()
export class SeriesPublishProcessor extends WorkerHost {
    private readonly logger = new Logger(SeriesPublishProcessor.name);

    constructor(private readonly prisma: PrismaService) {
        super();
    }

    async process(job: Job<SeriesPublishJobData>): Promise<any> {
        const jobName = job.name;

        switch (jobName) {
            case 'publish-series':
                return this.handleSeriesPublish(job);
            case 'schedule-series-publish':
                return this.handleScheduleSeriesPublish(job);
            default:
                this.logger.warn(`Unknown job name: ${jobName}`);
                return null;
        }
    }

    private async handleSeriesPublish(job: Job<SeriesPublishJobData>) {
        const { seriesId } = job.data;

        this.logger.log(`Processing series publication for series ID: ${seriesId}`);

        try {
            // Check if series still exists and is scheduled for publication
            const series = await this.prisma.series.findUnique({
                where: { id: seriesId },
                select: {
                    id: true,
                    title: true,
                    publication_status: true,
                    scheduled_publish_at: true,
                    start_date: true,
                },
            });

            if (!series) {
                this.logger.warn(`Series with ID ${seriesId} not found, skipping publication`);
                return;
            }

            if (series.publication_status !== 'SCHEDULED') {
                this.logger.warn(`Series ${seriesId} is not in SCHEDULED status (current: ${series.publication_status}), skipping publication`);
                return;
            }

            // Check if it's time to publish
            const now = new Date();
            if (series.scheduled_publish_at && series.scheduled_publish_at > now) {
                this.logger.warn(`Series ${seriesId} is scheduled for future publication at ${series.scheduled_publish_at}, current time: ${now}`);
                return;
            }

            // Publish the series
            await this.prisma.series.update({
                where: { id: seriesId },
                data: {
                    visibility: 'PUBLISHED',
                    publication_status: 'PUBLISHED',
                    scheduled_publish_at: null, // Clear the scheduled time
                },
            });

            this.logger.log(`Successfully published series: ${series.title} (ID: ${seriesId})`);

            // You can add additional logic here such as:
            // - Send notifications to enrolled users
            // - Update search indexes
            // - Send email notifications
            // - Log analytics events

        } catch (error) {
            this.logger.error(`Failed to publish series ${seriesId}: ${error.message}`, error.stack);
            throw error; // Re-throw to mark job as failed
        }
    }

    private async handleScheduleSeriesPublish(job: Job<SeriesPublishJobData>) {
        const { seriesId, publishAt } = job.data;

        this.logger.log(`Scheduling series publication for series ID: ${seriesId} at ${publishAt}`);

        try {
            // Update series status to SCHEDULED
            await this.prisma.series.update({
                where: { id: seriesId },
                data: {
                    publication_status: 'SCHEDULED',
                    scheduled_publish_at: publishAt,
                    visibility: 'SCHEDULED',
                },
            });

            this.logger.log(`Successfully scheduled series publication for ID: ${seriesId}`);
        } catch (error) {
            this.logger.error(`Failed to schedule series publication for ${seriesId}: ${error.message}`, error.stack);
            throw error;
        }
    }
}