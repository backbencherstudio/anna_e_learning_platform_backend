import { Controller, Post, Get, Delete, Body, Param, UseInterceptors, UploadedFile, HttpStatus, HttpCode } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ChunkedUploadService, FinalizeUploadRequest, InitializeUploadRequest, UploadChunkRequest } from './ChunkedUploadService';
import { BackgroundUploadService } from './BackgroundUploadService';

@Controller('admin/series/upload')
export class ChunkedUploadController {
    constructor(
        private readonly chunkedUploadService: ChunkedUploadService,
        private readonly backgroundUploadService: BackgroundUploadService
    ) { }

    /**
     * Initialize a new chunked upload
     */
    @Post('initialize')
    @HttpCode(HttpStatus.OK)
    async initializeUpload(@Body() request: InitializeUploadRequest) {
        try {
            const result = await this.chunkedUploadService.initializeUpload(request);

            return {
                success: true,
                data: result,
                message: 'Upload initialized successfully',
            };
        } catch (error) {
            return {
                success: false,
                message: error.message,
            };
        }
    }

    /**
     * Upload a single chunk
     */
    @Post('chunk')
    @HttpCode(HttpStatus.OK)
    @UseInterceptors(FileInterceptor('chunk'))
    async uploadChunk(
        @UploadedFile() chunk: Express.Multer.File,
        @Body() request: Omit<UploadChunkRequest, 'chunk'>
    ) {
        try {
            if (!chunk) {
                return {
                    success: false,
                    message: 'No chunk file provided',
                };
            }

            const uploadRequest: UploadChunkRequest = {
                ...request,
                chunk: chunk.buffer,
            };

            const result = await this.chunkedUploadService.uploadChunk(uploadRequest);

            return {
                success: true,
                data: result,
                message: 'Chunk uploaded successfully',
            };
        } catch (error) {
            return {
                success: false,
                message: error.message,
            };
        }
    }

    /**
     * Finalize the upload
     */
    @Post('finalize')
    @HttpCode(HttpStatus.OK)
    async finalizeUpload(@Body() request: FinalizeUploadRequest) {
        try {
            const result = await this.chunkedUploadService.finalizeUpload(request);

            return {
                success: result.success,
                data: result.success ? { fileName: result.fileName } : undefined,
                message: result.message,
            };
        } catch (error) {
            return {
                success: false,
                message: error.message,
            };
        }
    }

    /**
     * Queue file for background processing
     */
    @Post('queue')
    @HttpCode(HttpStatus.OK)
    async queueForProcessing(@Body() body: { uploadId: string; finalFileName: string; courseId?: string; lessonTitle?: string }) {
        try {
            const result = await this.backgroundUploadService.queueUpload(
                body.uploadId,
                body.finalFileName,
                body.courseId,
                body.lessonTitle
            );

            return {
                success: true,
                data: result,
                message: 'File queued for background processing',
            };
        } catch (error) {
            return {
                success: false,
                message: error.message,
            };
        }
    }

    /**
     * Get upload progress
     */
    @Get('progress/:uploadId')
    @HttpCode(HttpStatus.OK)
    async getUploadProgress(@Param('uploadId') uploadId: string) {
        try {
            const progress = this.chunkedUploadService.getUploadProgress(uploadId);

            if (!progress) {
                return {
                    success: false,
                    message: 'Upload not found',
                };
            }

            return {
                success: true,
                data: progress,
                message: 'Progress retrieved successfully',
            };
        } catch (error) {
            return {
                success: false,
                message: error.message,
            };
        }
    }

    /**
     * Get upload status with detailed information
     */
    @Get('status/:uploadId')
    @HttpCode(HttpStatus.OK)
    async getUploadStatus(@Param('uploadId') uploadId: string) {
        try {
            const status = this.chunkedUploadService.getUploadStatus(uploadId);

            if (!status) {
                return {
                    success: false,
                    message: 'Upload not found',
                };
            }

            return {
                success: true,
                data: status,
                message: 'Status retrieved successfully',
            };
        } catch (error) {
            return {
                success: false,
                message: error.message,
            };
        }
    }

    /**
     * Cancel an upload
     */
    @Delete('cancel/:uploadId')
    @HttpCode(HttpStatus.OK)
    async cancelUpload(@Param('uploadId') uploadId: string) {
        try {
            const result = await this.chunkedUploadService.cancelUpload(uploadId);

            return {
                success: result.success,
                message: result.message,
            };
        } catch (error) {
            return {
                success: false,
                message: error.message,
            };
        }
    }

    /**
     * Get background job status
     */
    @Get('job/:jobId')
    @HttpCode(HttpStatus.OK)
    async getJobStatus(@Param('jobId') jobId: string) {
        try {
            const job = this.backgroundUploadService.getJobStatus(jobId);

            if (!job) {
                return {
                    success: false,
                    message: 'Job not found',
                };
            }

            return {
                success: true,
                data: job,
                message: 'Job status retrieved successfully',
            };
        } catch (error) {
            return {
                success: false,
                message: error.message,
            };
        }
    }

    /**
     * Get all jobs for a course
     */
    @Get('jobs/course/:courseId')
    @HttpCode(HttpStatus.OK)
    async getJobsForCourse(@Param('courseId') courseId: string) {
        try {
            const jobs = this.backgroundUploadService.getJobsForCourse(courseId);

            return {
                success: true,
                data: jobs,
                message: 'Jobs retrieved successfully',
            };
        } catch (error) {
            return {
                success: false,
                message: error.message,
            };
        }
    }

    /**
     * Get all active jobs
     */
    @Get('jobs/active')
    @HttpCode(HttpStatus.OK)
    async getActiveJobs() {
        try {
            const jobs = this.backgroundUploadService.getActiveJobs();

            return {
                success: true,
                data: jobs,
                message: 'Active jobs retrieved successfully',
            };
        } catch (error) {
            return {
                success: false,
                message: error.message,
            };
        }
    }
}
