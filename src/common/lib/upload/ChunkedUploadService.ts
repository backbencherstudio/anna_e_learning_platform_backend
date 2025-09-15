import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { SojebStorage } from '../Disk/SojebStorage';
import { StringHelper } from '../../helper/string.helper';

export interface ChunkInfo {
    uploadId: string;
    fileName: string;
    fileSize: number;
    totalChunks: number;
    chunkSize: number;
    mimeType: string;
    uploadedChunks: number[];
    status: 'initialized' | 'uploading' | 'completed' | 'failed';
    createdAt: Date;
    updatedAt: Date;
}

export interface InitializeUploadRequest {
    fileName: string;
    fileSize: number;
    mimeType: string;
    totalChunks: number;
}

export interface UploadChunkRequest {
    uploadId: string;
    chunkNumber: number;
    totalChunks: number;
    fileName: string;
    fileSize: number;
    chunkSize: number;
    mimeType: string;
    chunk: Buffer;
}

export interface FinalizeUploadRequest {
    uploadId: string;
    finalFileName: string;
}

@Injectable()
export class ChunkedUploadService {
    private readonly logger = new Logger(ChunkedUploadService.name);
    private readonly uploads = new Map<string, ChunkInfo>();
    private readonly chunkSize = 5 * 1024 * 1024; // 5MB chunks

    /**
     * Initialize a new chunked upload
     */
    async initializeUpload(request: InitializeUploadRequest): Promise<{ uploadId: string; chunkSize: number }> {
        try {
            const uploadId = this.generateUploadId();

            // Validate file size (max 2GB)
            if (request.fileSize > 2 * 1024 * 1024 * 1024) {
                throw new BadRequestException('File size cannot exceed 2GB');
            }

            // Validate MIME type
            if (!this.isValidMimeType(request.mimeType)) {
                throw new BadRequestException('Invalid file type. Only video, audio, document, and image files are allowed');
            }

            const chunkInfo: ChunkInfo = {
                uploadId,
                fileName: request.fileName,
                fileSize: request.fileSize,
                totalChunks: request.totalChunks,
                chunkSize: this.chunkSize,
                mimeType: request.mimeType,
                uploadedChunks: [],
                status: 'initialized',
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            this.logger.log('chunkInfo', chunkInfo);

            this.uploads.set(uploadId, chunkInfo);

            this.logger.log(`Upload initialized: ${uploadId} for file: ${request.fileName}`);

            return {
                uploadId,
                chunkSize: this.chunkSize,
            };
        } catch (error) {
            this.logger.error(`Error initializing upload: ${error.message}`);
            throw error;
        }
    }

    /**
     * Upload a single chunk
     */
    async uploadChunk(request: UploadChunkRequest): Promise<{ progress: number; chunkNumber: number }> {
        try {
            const chunkInfo = this.uploads.get(request.uploadId);

            if (!chunkInfo) {
                throw new BadRequestException('Upload session not found');
            }

            if (chunkInfo.status === 'completed') {
                throw new BadRequestException('Upload already completed');
            }

            if (chunkInfo.status === 'failed') {
                throw new BadRequestException('Upload session failed');
            }

            // Validate chunk number
            if (request.chunkNumber < 1 || request.chunkNumber > request.totalChunks) {
                throw new BadRequestException('Invalid chunk number');
            }

            // Check if chunk already exists
            if (chunkInfo.uploadedChunks.includes(request.chunkNumber)) {
                this.logger.warn(`Chunk ${request.chunkNumber} already uploaded for ${request.uploadId}`);
                const progress = this.calculateProgress(chunkInfo);
                return {
                    progress: progress.progress,
                    chunkNumber: request.chunkNumber,
                };
            }

            // Store chunk
            const chunkKey = `uploads/${request.uploadId}/chunk_${request.chunkNumber}`;
            await SojebStorage.put(chunkKey, request.chunk);

            // Update chunk info
            chunkInfo.uploadedChunks.push(request.chunkNumber);
            chunkInfo.uploadedChunks.sort((a, b) => a - b);
            chunkInfo.status = 'uploading';
            chunkInfo.updatedAt = new Date();

            this.uploads.set(request.uploadId, chunkInfo);

            const progress = this.calculateProgress(chunkInfo);

            this.logger.log(`Chunk ${request.chunkNumber}/${request.totalChunks} uploaded for ${request.uploadId}. Progress: ${progress.progress}%`);

            return {
                progress: progress.progress,
                chunkNumber: request.chunkNumber,
            };
        } catch (error) {
            this.logger.error(`Error uploading chunk: ${error.message}`);
            throw error;
        }
    }

    /**
     * Finalize the upload by combining all chunks
     */
    async finalizeUpload(request: FinalizeUploadRequest): Promise<{ success: boolean; fileName: string; message: string }> {
        try {
            const chunkInfo = this.uploads.get(request.uploadId);

            if (!chunkInfo) {
                throw new BadRequestException('Upload session not found');
            }

            // Check if all chunks are uploaded
            if (chunkInfo.uploadedChunks.length !== chunkInfo.totalChunks) {
                throw new BadRequestException(`Upload incomplete. ${chunkInfo.uploadedChunks.length}/${chunkInfo.totalChunks} chunks uploaded`);
            }
            this.logger.log('chunkInfo', chunkInfo);
            // Verify all chunks exist
            for (let i = 1; i <= chunkInfo.totalChunks; i++) {
                if (!chunkInfo.uploadedChunks.includes(i)) {
                    throw new BadRequestException(`Chunk ${i} is missing`);
                }
            }

            chunkInfo.status = 'completed';
            chunkInfo.updatedAt = new Date();
            this.uploads.set(request.uploadId, chunkInfo);

            this.logger.log(`Upload completed: ${request.uploadId} for file: ${request.finalFileName}`);

            return {
                success: true,
                fileName: request.finalFileName,
                message: 'Upload finalized successfully',
            };
        } catch (error) {
            this.logger.error(`Error finalizing upload: ${error.message}`);

            // Mark upload as failed
            const chunkInfo = this.uploads.get(request.uploadId);
            if (chunkInfo) {
                chunkInfo.status = 'failed';
                this.uploads.set(request.uploadId, chunkInfo);
            }

            return {
                success: false,
                fileName: '',
                message: error.message,
            };
        }
    }

    /**
     * Get upload progress
     */
    getUploadProgress(uploadId: string): { uploadId: string; fileName: string; totalChunks: number; uploadedChunks: number; progress: number; status: string } | null {
        const chunkInfo = this.uploads.get(uploadId);

        if (!chunkInfo) {
            return null;
        }

        const progress = this.calculateProgress(chunkInfo);

        return {
            uploadId,
            fileName: chunkInfo.fileName,
            totalChunks: chunkInfo.totalChunks,
            uploadedChunks: chunkInfo.uploadedChunks.length,
            progress: progress.progress,
            status: chunkInfo.status,
        };
    }

    /**
     * Get upload status with detailed chunk information
     */
    getUploadStatus(uploadId: string): ChunkInfo | null {
        const chunkInfo = this.uploads.get(uploadId);
        return chunkInfo ? { ...chunkInfo } : null;
    }

    /**
     * Cancel an upload and clean up chunks
     */
    async cancelUpload(uploadId: string): Promise<{ success: boolean; message: string }> {
        try {
            const chunkInfo = this.uploads.get(uploadId);

            if (!chunkInfo) {
                throw new BadRequestException('Upload session not found');
            }

            // Delete all uploaded chunks
            for (const chunkNumber of chunkInfo.uploadedChunks) {
                try {
                    const chunkKey = `uploads/${uploadId}/chunk_${chunkNumber}`;
                    await SojebStorage.delete(chunkKey);
                } catch (error) {
                    this.logger.warn(`Failed to delete chunk ${chunkNumber}: ${error.message}`);
                }
            }

            // Remove from memory
            this.uploads.delete(uploadId);

            this.logger.log(`Upload cancelled: ${uploadId}`);

            return {
                success: true,
                message: 'Upload cancelled successfully',
            };
        } catch (error) {
            this.logger.error(`Error cancelling upload: ${error.message}`);
            return {
                success: false,
                message: error.message,
            };
        }
    }

    /**
     * Clean up old uploads (call this periodically)
     */
    async cleanupOldUploads(maxAgeHours: number = 24): Promise<void> {
        const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
        const uploadsToCleanup: string[] = [];

        for (const [uploadId, chunkInfo] of this.uploads.entries()) {
            if (chunkInfo.updatedAt < cutoffTime) {
                uploadsToCleanup.push(uploadId);
            }
        }

        for (const uploadId of uploadsToCleanup) {
            await this.cancelUpload(uploadId);
        }

        this.logger.log(`Cleaned up ${uploadsToCleanup.length} old uploads`);
    }

    /**
     * Generate unique upload ID
     */
    private generateUploadId(): string {
        return `upload_${Date.now()}_${StringHelper.randomString(8)}`;
    }

    /**
     * Calculate upload progress
     */
    private calculateProgress(chunkInfo: ChunkInfo): { progress: number; uploadedChunks: number } {
        const progress = Math.round((chunkInfo.uploadedChunks.length / chunkInfo.totalChunks) * 100);
        return {
            progress,
            uploadedChunks: chunkInfo.uploadedChunks.length,
        };
    }

    /**
     * Validate MIME type
     */
    private isValidMimeType(mimeType: string): boolean {
        const allowedTypes = [
            // Video
            'video/mp4',
            'video/webm',
            'video/ogg',
            'video/avi',
            'video/mov',
            'video/wmv',
            'video/quicktime',
            // Audio
            'audio/mp3',
            'audio/wav',
            'audio/ogg',
            'audio/mpeg',
            // Documents
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            // Images
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/gif',
            'image/webp',
        ];

        return allowedTypes.includes(mimeType);
    }
}
