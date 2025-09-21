import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';

@Processor('quiz-publish')
export class QuizPublishProcessor extends WorkerHost {
    private readonly logger = new Logger(QuizPublishProcessor.name);

    constructor(
        private readonly prisma: PrismaService,
    ) {
        super();
    }

    async process(job: Job<any>): Promise<any> {
        const { name, data } = job;

        this.logger.log(`Processing quiz publication job: ${name} with data:`, data);

        try {
            switch (name) {
                case 'schedule-quiz-publish':
                    return await this.publishQuiz(data.quizId);
                default:
                    this.logger.warn(`Unknown job type: ${name}`);
                    return { success: false, message: `Unknown job type: ${name}` };
            }
        } catch (error) {
            this.logger.error(`Error processing quiz publication job ${name}: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Publish a quiz by updating its status
     */
    private async publishQuiz(quizId: string): Promise<any> {
        try {
            this.logger.log(`Publishing quiz: ${quizId}`);

            // Check if quiz exists
            const existingQuiz = await this.prisma.quiz.findUnique({
                where: { id: quizId },
                select: { id: true, title: true, publication_status: true },
            });

            if (!existingQuiz) {
                throw new Error(`Quiz with ID ${quizId} not found`);
            }

            // Update quiz to published status
            const updatedQuiz = await this.prisma.quiz.update({
                where: { id: quizId },
                data: {
                    is_published: true,
                    published_at: new Date(),
                    publication_status: 'PUBLISHED',
                    scheduled_publish_at: null, // Clear the scheduled date
                },
            });

            this.logger.log(`Successfully published quiz: ${quizId} - ${updatedQuiz.title}`);

            return {
                success: true,
                message: `Quiz "${updatedQuiz.title}" has been published successfully`,
                quizId,
                publishedAt: updatedQuiz.published_at,
            };
        } catch (error) {
            this.logger.error(`Failed to publish quiz ${quizId}: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Handle job completion
     */
    async onCompleted(job: Job): Promise<void> {
        this.logger.log(`Quiz publication job completed: ${job.name} - ${job.id}`);
    }

    /**
     * Handle job failure
     */
    async onFailed(job: Job, error: Error): Promise<void> {
        this.logger.error(`Quiz publication job failed: ${job.name} - ${job.id}`, error.stack);
    }

    /**
     * Handle job progress updates
     */
    async onProgress(job: Job, progress: number): Promise<void> {
        this.logger.log(`Quiz publication job progress: ${job.name} - ${job.id} - ${progress}%`);
    }
}
