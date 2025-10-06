import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class QuizPublishService {
    private readonly logger = new Logger(QuizPublishService.name);

    constructor(
        @InjectQueue('quiz-publish') private quizPublishQueue: Queue,
        private readonly prisma: PrismaService,
    ) { }

    /**
     * Schedule quiz publication at a specific date/time
     */
    async scheduleQuizPublication(quizId: string, publishAt: Date): Promise<void> {
        try {
            this.logger.log(`Scheduling quiz ${quizId} for publication at ${publishAt.toISOString()}`);

            // Calculate delay in milliseconds
            const now = new Date();
            const delay = publishAt.getTime() - now.getTime();

            if (delay <= 0) {
                throw new Error('Publication date must be in the future');
            }

            // Add job to queue with delay
            await this.quizPublishQueue.add(
                'schedule-quiz-publish',
                { quizId },
                {
                    delay,
                    jobId: `quiz-publish-${quizId}`, // Unique job ID to prevent duplicates
                    removeOnComplete: 10, // Keep last 10 completed jobs
                    removeOnFail: 50, // Keep last 50 failed jobs
                }
            );

            this.logger.log(`Quiz ${quizId} scheduled for publication successfully`);
        } catch (error) {
            this.logger.error(`Failed to schedule quiz publication for ${quizId}: ${error.message}`, error.stack);
            throw error;
        }
    }

    
    /**
     * Publish a quiz immediately
     */
    async publishQuizImmediately(quizId: string): Promise<void> {
        try {
            this.logger.log(`Publishing quiz ${quizId} immediately`);

            await this.prisma.quiz.update({
                where: { id: quizId },
                data: {
                    is_published: true,
                    publication_status: 'PUBLISHED',
                    scheduled_publish_at: null,
                },
            });

            // Cancel any scheduled jobs for this series
            await this.cancelScheduledPublication(quizId);

            this.logger.log(`Successfully published quiz ${quizId} immediately`);

        } catch (error) {
            this.logger.error(`Failed to publish quiz ${quizId} immediately: ${error.message}`, error.stack);
            throw error;
        }
    }


    /**
     * Cancel scheduled quiz publication
     */
    async cancelScheduledPublication(quizId: string): Promise<void> {
        try {
            this.logger.log(`Cancelling scheduled publication for quiz ${quizId}`);

            // Remove the job from queue
            const jobId = `quiz-publish-${quizId}`;
            const job = await this.quizPublishQueue.getJob(jobId);

            if (job) {
                await job.remove();
                this.logger.log(`Cancelled scheduled publication for quiz ${quizId}`);
            } else {
                this.logger.warn(`No scheduled publication found for quiz ${quizId}`);
            }
        } catch (error) {
            this.logger.error(`Failed to cancel scheduled publication for quiz ${quizId}: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Get quiz publication status
     */
    async getQuizPublicationStatus(quizId: string): Promise<{
        isScheduled: boolean;
        scheduledAt?: Date;
        jobStatus?: string;
    }> {
        try {
            const jobId = `quiz-publish-${quizId}`;
            const job = await this.quizPublishQueue.getJob(jobId);

            if (!job) {
                return { isScheduled: false };
            }

            return {
                isScheduled: true,
                scheduledAt: new Date(job.timestamp + job.delay),
                jobStatus: await job.getState(),
            };
        } catch (error) {
            this.logger.error(`Failed to get publication status for quiz ${quizId}: ${error.message}`, error.stack);
            return { isScheduled: false };
        }
    }

    /**
     * Get all scheduled quiz publications
     */
    async getAllScheduledPublications(): Promise<any[]> {
        try {
            const waiting = await this.quizPublishQueue.getWaiting();
            const delayed = await this.quizPublishQueue.getDelayed();

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
