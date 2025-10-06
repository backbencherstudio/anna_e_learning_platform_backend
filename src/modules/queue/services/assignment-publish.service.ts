import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AssignmentPublishService {
    private readonly logger = new Logger(AssignmentPublishService.name);

    constructor(
        @InjectQueue('assignment-publish') private assignmentPublishQueue: Queue,
        private readonly prisma: PrismaService,
    ) { }

    /**
     * Schedule assignment publication at a specific date/time
     */
    async scheduleAssignmentPublication(assignmentId: string, publishAt: Date): Promise<void> {
        try {
            this.logger.log(`Scheduling assignment ${assignmentId} for publication at ${publishAt.toISOString()}`);

            // Calculate delay in milliseconds
            const now = new Date();
            const delay = publishAt.getTime() - now.getTime();

            if (delay <= 0) {
                throw new Error('Publication date must be in the future');
            }

            // Add job to queue with delay
            await this.assignmentPublishQueue.add(
                'schedule-assignment-publish',
                { assignmentId },
                {
                    delay,
                    jobId: `assignment-publish-${assignmentId}`, // Unique job ID to prevent duplicates
                    removeOnComplete: 10, // Keep last 10 completed jobs
                    removeOnFail: 50, // Keep last 50 failed jobs
                }
            );

            this.logger.log(`Assignment ${assignmentId} scheduled for publication successfully`);
        } catch (error) {
            this.logger.error(`Failed to schedule assignment publication for ${assignmentId}: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Cancel scheduled assignment publication
     */
    async cancelScheduledPublication(assignmentId: string): Promise<void> {
        try {
            this.logger.log(`Cancelling scheduled publication for assignment ${assignmentId}`);

            // Remove the job from queue
            const jobId = `assignment-publish-${assignmentId}`;
            const job = await this.assignmentPublishQueue.getJob(jobId);

            if (job) {
                await job.remove();
                this.logger.log(`Cancelled scheduled publication for assignment ${assignmentId}`);
            } else {
                this.logger.warn(`No scheduled publication found for assignment ${assignmentId}`);
            }
        } catch (error) {
            this.logger.error(`Failed to cancel scheduled publication for assignment ${assignmentId}: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Publish a assignment immediately
     */
    async publishAssignmentImmediately(assignmentId: string): Promise<void> {
        try {
            this.logger.log(`Publishing assignment ${assignmentId} immediately`);

            await this.prisma.assignment.update({
                where: { id: assignmentId },
                data: {
                    is_published: true,
                    publication_status: 'PUBLISHED',
                    scheduled_publish_at: null,
                },
            });

            // Cancel any scheduled jobs for this series
            await this.cancelScheduledPublication(assignmentId);

            this.logger.log(`Successfully published assignment ${assignmentId} immediately`);

        } catch (error) {
            this.logger.error(`Failed to publish assignment ${assignmentId} immediately: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Get assignment publication status
     */
    async getAssignmentPublicationStatus(assignmentId: string): Promise<{
        isScheduled: boolean;
        scheduledAt?: Date;
        jobStatus?: string;
    }> {
        try {
            const jobId = `assignment-publish-${assignmentId}`;
            const job = await this.assignmentPublishQueue.getJob(jobId);

            if (!job) {
                return { isScheduled: false };
            }

            return {
                isScheduled: true,
                scheduledAt: new Date(job.timestamp + job.delay),
                jobStatus: await job.getState(),
            };
        } catch (error) {
            this.logger.error(`Failed to get publication status for assignment ${assignmentId}: ${error.message}`, error.stack);
            return { isScheduled: false };
        }
    }

    /**
     * Get all scheduled assignment publications
     */
    async getAllScheduledPublications(): Promise<any[]> {
        try {
            const waiting = await this.assignmentPublishQueue.getWaiting();
            const delayed = await this.assignmentPublishQueue.getDelayed();

            return [...waiting, ...delayed].map(job => ({
                id: job.id,
                name: job.name,
                data: job.data,
                delay: job.delay,
                timestamp: job.timestamp,
                scheduledAt: new Date(job.timestamp + (job.delay || 0)),
            }));
        } catch (error) {
            this.logger.error(`Failed to get scheduled publications: ${error.message}`, error.stack);
            return [];
        }
    }
}
