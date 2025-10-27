import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ChunkedUploadService } from '../../../common/lib/ChunkedUpload/chunked-upload.service';
import { ChunkUploadGateway } from '../../../common/lib/ChunkedUpload/chunk-upload.gateway';
import { PrismaService } from '../../../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

export type ChunkUploadJobData = {
    uploadId: string;
    targetPath: string;
    filePath: string; // persisted temp file path
    fileName: string;
    chunkSize?: number;
    lessonFileId?: string;
    finalFileName?: string;
};

@Processor('chunk-upload')
@Injectable()
export class ChunkUploadProcessor extends WorkerHost {
    private readonly logger = new Logger(ChunkUploadProcessor.name);

    constructor(
        private readonly chunkedUploadService: ChunkedUploadService,
        private readonly chunkUploadGateway: ChunkUploadGateway,
        private readonly prisma: PrismaService,
    ) {
        super();
    }

    async process(job: Job<ChunkUploadJobData>): Promise<any> {
        const { uploadId, targetPath, filePath, fileName, chunkSize, lessonFileId, finalFileName } = job.data;
        this.logger.log(`Processing chunk-upload job ${job.id} for ${fileName} (${uploadId})`);

        try {
            // Create a dummy Multer file object from the temp file path
            const file: Express.Multer.File = {
                fieldname: 'videoFile',
                originalname: fileName,
                encoding: '7bit',
                mimetype: 'video/mp4', // Default, will be detected properly
                size: fs.statSync(filePath).size,
                destination: path.dirname(filePath),
                filename: path.basename(filePath),
                path: filePath,
                buffer: fs.readFileSync(filePath), // This will be read in chunks by the service
                stream: fs.createReadStream(filePath),
            };

            const result = await this.chunkedUploadService.uploadFileFromPathInChunks(filePath, fileName, targetPath, {
                uploadId,
                chunkSize: chunkSize ?? 10 * 1024 * 1024,
                onProgress: (progress) => {
                    // Update job progress
                    job.updateProgress(progress);

                    // Send WebSocket update
                    this.chunkUploadGateway.sendProgressUpdate(uploadId, {
                        uploadId,
                        progress,
                        totalChunks: Math.ceil(file.size / (chunkSize ?? 10 * 1024 * 1024)),
                        uploadedChunks: Math.round((progress / 100) * Math.ceil(file.size / (chunkSize ?? 10 * 1024 * 1024))),
                        fileName,
                        fileSize: file.size,
                        chunkSize: chunkSize ?? 10 * 1024 * 1024,
                    });
                },
                onComplete: async (result) => {
                    this.logger.log(`Chunk upload job ${job.id} completed. Final file: ${result.fileName}`);

                    // Send WebSocket completion
                    this.chunkUploadGateway.sendUploadComplete(uploadId, result.fileName!, file.size);

                    // Update lesson file DB record if provided
                    if (lessonFileId && finalFileName) {
                        try {
                            await this.prisma.lessonFile.update({
                                where: { id: lessonFileId },
                                data: { url: finalFileName },
                            });
                            this.logger.log(`Updated lesson file ${lessonFileId} URL to ${finalFileName}`);
                        } catch (e) {
                            this.logger.error(`Failed to update lessonFile ${lessonFileId}: ${e.message}`);
                        }
                    }
                },
                onError: (error) => {
                    this.logger.error(`Chunk upload job ${job.id} failed: ${error.message}`);
                    this.chunkUploadGateway.sendUploadError(uploadId, error.message);
                },
            });

            // Clean up temp file
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }

            if (!result.success) {
                throw new Error(result.error);
            }

            return result;
        } catch (error) {
            this.logger.error(`Failed to process chunk upload job ${job.id}: ${error.message}`, error.stack);
            this.chunkUploadGateway.sendUploadError(uploadId, error.message);

            // Ensure temp file is cleaned up even on error
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            throw error;
        }
    }

    @OnWorkerEvent('failed')
    onFailed(job: Job<ChunkUploadJobData>, err: Error) {
        this.logger.error(`chunk-upload job ${job.id} failed: ${err.message}`);
        this.chunkUploadGateway.sendUploadError(job.data.uploadId, err.message);
    }
}
