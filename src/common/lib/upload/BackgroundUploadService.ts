import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SojebStorage } from '../Disk/SojebStorage';
import appConfig from '../../../config/app.config';

export interface UploadJob {
    id: string;
    uploadId: string;
    fileName: string;
    courseId?: string;
    lessonTitle?: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    result?: {
        fileName: string;
        url: string;
        size: number;
    };
    error?: string;
    createdAt: Date;
    updatedAt: Date;
}

@Injectable()
export class BackgroundUploadService {
    private readonly logger = new Logger(BackgroundUploadService.name);
    private readonly jobs = new Map<string, UploadJob>();

    /**
     * Queue a file for background processing
     */
    async queueUpload(uploadId: string, finalFileName: string, courseId?: string, lessonTitle?: string): Promise<{ jobId: string }> {
        const jobId = `job_${Date.now()}_${uploadId}`;

        const job: UploadJob = {
            id: jobId,
            uploadId,
            fileName: finalFileName,
            courseId,
            lessonTitle,
            status: 'pending',
            progress: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        this.jobs.set(jobId, job);

        this.logger.log(`Upload queued for background processing: ${jobId}`);

        // Start processing immediately
        this.processUpload(jobId).catch(error => {
            this.logger.error(`Error processing upload ${jobId}: ${error.message}`);
        });

        return { jobId };
    }

    /**
     * Process an upload job
     */
    private async processUpload(jobId: string): Promise<void> {
        const job = this.jobs.get(jobId);
        if (!job) {
            this.logger.error(`Job not found: ${jobId}`);
            return;
        }

        try {
            this.updateJobStatus(jobId, 'processing', 10);

            // Simulate file processing steps
            await this.simulateProcessing(jobId, 20, 50);

            // Move file to final location
            await this.moveFileToFinalLocation(jobId);

            await this.simulateProcessing(jobId, 80, 100);

            // Mark as completed
            this.updateJobStatus(jobId, 'completed', 100, {
                fileName: job.fileName,
                url: `${appConfig().storageUrl.lesson_file}${job.fileName}`,
                size: 0, // Could be calculated from actual file
            });

            this.logger.log(`Upload processing completed: ${jobId}`);

        } catch (error) {
            this.logger.error(`Error processing upload ${jobId}: ${error.message}`);
            this.updateJobStatus(jobId, 'failed', 0, undefined, error.message);
        }
    }

    /**
     * Move file from temporary location to final location
     */
    private async moveFileToFinalLocation(jobId: string): Promise<void> {
        const job = this.jobs.get(jobId);
        if (!job) return;

        try {
            // In a real implementation, you would:
            // 1. Read all chunks from temporary storage
            // 2. Combine them into a single file
            // 3. Move to final location
            // 4. Clean up temporary chunks

            this.logger.log(`Moving file to final location: ${job.fileName}`);

            // For now, we'll just simulate this process
            await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (error) {
            throw new Error(`Failed to move file: ${error.message}`);
        }
    }

    /**
     * Simulate processing steps
     */
    private async simulateProcessing(jobId: string, fromProgress: number, toProgress: number): Promise<void> {
        const steps = toProgress - fromProgress;
        const stepSize = 10;
        const delay = 500; // 500ms per step

        for (let i = 0; i < steps; i += stepSize) {
            const progress = Math.min(fromProgress + i, toProgress);
            this.updateJobStatus(jobId, 'processing', progress);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    /**
     * Update job status
     */
    private updateJobStatus(jobId: string, status: UploadJob['status'], progress: number, result?: UploadJob['result'], error?: string): void {
        const job = this.jobs.get(jobId);
        if (job) {
            job.status = status;
            job.progress = progress;
            job.updatedAt = new Date();

            if (result) {
                job.result = result;
            }

            if (error) {
                job.error = error;
            }

            this.jobs.set(jobId, job);
        }
    }

    /**
     * Get job status
     */
    getJobStatus(jobId: string): UploadJob | null {
        const job = this.jobs.get(jobId);
        return job ? { ...job } : null;
    }

    /**
     * Get all jobs for a course
     */
    getJobsForCourse(courseId: string): UploadJob[] {
        const jobs: UploadJob[] = [];

        for (const job of this.jobs.values()) {
            if (job.courseId === courseId) {
                jobs.push({ ...job });
            }
        }

        return jobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    /**
     * Get all pending/processing jobs
     */
    getActiveJobs(): UploadJob[] {
        const jobs: UploadJob[] = [];

        for (const job of this.jobs.values()) {
            if (job.status === 'pending' || job.status === 'processing') {
                jobs.push({ ...job });
            }
        }

        return jobs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }

    /**
     * Clean up completed jobs older than specified hours
     */
    cleanupOldJobs(maxAgeHours: number = 24): void {
        const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
        const jobsToDelete: string[] = [];

        for (const [jobId, job] of this.jobs.entries()) {
            if ((job.status === 'completed' || job.status === 'failed') && job.updatedAt < cutoffTime) {
                jobsToDelete.push(jobId);
            }
        }

        for (const jobId of jobsToDelete) {
            this.jobs.delete(jobId);
        }

        this.logger.log(`Cleaned up ${jobsToDelete.length} old jobs`);
    }

    /**
     * Handle upload completion events
     */
    @OnEvent('upload.completed')
    handleUploadCompleted(payload: { uploadId: string; fileName: string }) {
        this.logger.log(`Upload completed event received: ${payload.uploadId}`);
        // Could trigger additional processing here
    }

    /**
     * Handle upload failure events
     */
    @OnEvent('upload.failed')
    handleUploadFailed(payload: { uploadId: string; error: string }) {
        this.logger.error(`Upload failed event received: ${payload.uploadId} - ${payload.error}`);
        // Could trigger cleanup or retry logic here
    }
}
