import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import appConfig from 'src/config/app.config';

@Injectable()
export class ChunkUploadQueueService {
    private readonly logger = new Logger(ChunkUploadQueueService.name);

    constructor(@InjectQueue('chunk-upload') private readonly chunkUploadQueue: Queue) { }

    /**
     * Enqueue chunk upload job
     */
    async enqueueChunkUpload(params: {
        file: Express.Multer.File;
        targetPath: string;
        uploadId?: string;
        chunkSize?: number;
        lessonFileId?: string;
        finalFileName?: string;
    }): Promise<{ uploadId: string; jobId: string }> {
        const uploadId = params.uploadId || `upload-${Date.now()}-${randomBytes(4).toString('hex')}`;

        // Persist file to a temporary path to avoid sending buffers via Redis
        const tmpDir = path.join(process.cwd(), 'public', 'storage', 'temp', 'uploads');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        const tmpPath = path.join(tmpDir, `${uploadId}-${params.file.originalname}`);
        fs.writeFileSync(tmpPath, params.file.buffer);

        const job = await this.chunkUploadQueue.add(
            'chunk-upload',
            {
                uploadId,
                targetPath: params.targetPath,
                filePath: tmpPath,
                fileName: params.file.originalname,
                chunkSize: params.chunkSize ?? 10 * 1024 * 1024,
                lessonFileId: params.lessonFileId,
                finalFileName: params.finalFileName ?? params.file.originalname,
            },
            {
                attempts: 3,
                backoff: { type: 'exponential', delay: 1000 },
                removeOnComplete: true,
                removeOnFail: false,
            },
        );

        this.logger.log(`Chunk upload job enqueued for file: ${params.file.originalname} with uploadId: ${uploadId}`);
        return { uploadId, jobId: String(job.id) };
    }

    /**
     * Get job status
     */
    async getJobStatus(jobId: string) {
        const job = await this.chunkUploadQueue.getJob(jobId);
        if (!job) {
            return { status: 'not_found' };
        }

        return {
            id: job.id,
            status: await job.getState(),
            progress: job.progress,
            data: job.data,
            failedReason: job.failedReason,
        };
    }

    /**
     * Cancel job
     */
    async cancelJob(jobId: string) {
        const job = await this.chunkUploadQueue.getJob(jobId);
        if (job) {
            await job.remove();
            return { success: true, message: 'Job cancelled' };
        }
        return { success: false, message: 'Job not found' };
    }
}
