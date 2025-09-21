import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';

@Processor('assignment-publish')
export class AssignmentPublishProcessor extends WorkerHost {
    private readonly logger = new Logger(AssignmentPublishProcessor.name);

    constructor(
        private readonly prisma: PrismaService,
    ) {
        super();
    }

    async process(job: Job<any>): Promise<any> {
        const { name, data } = job;

        this.logger.log(`Processing assignment publication job: ${name} with data:`, data);

        try {
            switch (name) {
                case 'schedule-assignment-publish':
                    return await this.publishAssignment(data.assignmentId);
                default:
                    this.logger.warn(`Unknown job type: ${name}`);
                    return { success: false, message: `Unknown job type: ${name}` };
            }
        } catch (error) {
            this.logger.error(`Error processing assignment publication job ${name}: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Publish an assignment by updating its status
     */
    private async publishAssignment(assignmentId: string): Promise<any> {
        try {
            this.logger.log(`Publishing assignment: ${assignmentId}`);

            // Check if assignment exists
            const existingAssignment = await this.prisma.assignment.findUnique({
                where: { id: assignmentId },
                select: { id: true, title: true, publication_status: true },
            });

            if (!existingAssignment) {
                throw new Error(`Assignment with ID ${assignmentId} not found`);
            }

            // Update assignment to published status
            const updatedAssignment = await this.prisma.assignment.update({
                where: { id: assignmentId },
                data: {
                    is_published: true,
                    published_at: new Date(),
                    publication_status: 'PUBLISHED',
                    scheduled_publish_at: null, // Clear the scheduled date
                },
            });

            this.logger.log(`Successfully published assignment: ${assignmentId} - ${updatedAssignment.title}`);

            return {
                success: true,
                message: `Assignment "${updatedAssignment.title}" has been published successfully`,
                assignmentId,
                publishedAt: updatedAssignment.published_at,
            };
        } catch (error) {
            this.logger.error(`Failed to publish assignment ${assignmentId}: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Handle job completion
     */
    async onCompleted(job: Job): Promise<void> {
        this.logger.log(`Assignment publication job completed: ${job.name} - ${job.id}`);
    }

    /**
     * Handle job failure
     */
    async onFailed(job: Job, error: Error): Promise<void> {
        this.logger.error(`Assignment publication job failed: ${job.name} - ${job.id}`, error.stack);
    }

    /**
     * Handle job progress updates
     */
    async onProgress(job: Job, progress: number): Promise<void> {
        this.logger.log(`Assignment publication job progress: ${job.name} - ${job.id} - ${progress}%`);
    }
}
