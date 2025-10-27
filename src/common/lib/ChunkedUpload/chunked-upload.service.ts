import { Injectable, Logger } from '@nestjs/common';
import { SojebStorage } from '../Disk/SojebStorage';
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { ChunkUploadGateway } from './chunk-upload.gateway';

export interface ChunkUploadOptions {
    uploadId?: string;
    chunkSize?: number;
    userId?: string;
    onProgress?: (progress: number) => void;
    onComplete?: (result: ChunkUploadResult, targetPath: string) => void;
    onError?: (error: Error) => void;
}

export interface ChunkUploadResult {
    success: boolean;
    message: string;
    fileName?: string;
    totalChunks?: number;
    uploadedChunks?: number;
    error?: string;
}

@Injectable()
export class ChunkedUploadService {
    private readonly logger = new Logger(ChunkedUploadService.name);
    private readonly DEFAULT_CHUNK_SIZE = 10 * 1024 * 1024; // 10MB

    constructor(private readonly chunkUploadGateway: ChunkUploadGateway) { }

    /**
     * Upload file in chunks for large files
     */
    async uploadFileInChunks(
        file: Express.Multer.File,
        targetPath: string,
        options: ChunkUploadOptions = {}
    ): Promise<ChunkUploadResult> {
        const {
            uploadId = `upload-${Date.now()}-${randomBytes(4).toString('hex')}`,
            chunkSize = this.DEFAULT_CHUNK_SIZE,
            userId,
            onProgress,
            onComplete,
            onError,
        } = options;

        try {
            this.logger.log(`Starting chunked upload for ${file.originalname} (${Math.round(file.size / 1024 / 1024)}MB)`);

            const totalChunks = Math.ceil(file.size / chunkSize);
            let uploadedChunks = 0;

            // Create temporary directory for chunks
            const tempDir = path.join(process.cwd(), 'temp_uploads', uploadId);
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            // Split file into chunks
            for (let i = 0; i < totalChunks; i++) {
                const start = i * chunkSize;
                const end = Math.min(start + chunkSize, file.size);
                const chunk = file.buffer.slice(start, end);

                const chunkPath = path.join(tempDir, `chunk-${i}`);
                fs.writeFileSync(chunkPath, chunk);

                // Upload chunk with retry mechanism
                const chunkUploaded = await this.uploadChunkWithRetry(chunkPath, `${targetPath}.chunk-${i}`, 3);

                if (!chunkUploaded) {
                    throw new Error(`Failed to upload chunk ${i}`);
                }

                uploadedChunks++;
                const progress = Math.round((uploadedChunks / totalChunks) * 100);

                this.logger.log(`Chunk ${i + 1}/${totalChunks} uploaded (${progress}%)`);
                onProgress?.(progress);

                // Emit progress via WebSocket
                this.chunkUploadGateway.sendProgressUpdate(uploadId, {
                    uploadId,
                    progress,
                    totalChunks,
                    uploadedChunks,
                    fileName: file.originalname,
                    fileSize: file.size,
                    chunkSize,
                });
            }

            // Combine chunks into final file
            await this.combineChunks(tempDir, targetPath, totalChunks);

            // Clean up temporary files
            this.cleanupTempFiles(tempDir);

            const result: ChunkUploadResult = {
                success: true,
                message: 'File uploaded successfully in chunks',
                fileName: path.basename(targetPath),
                totalChunks,
                uploadedChunks,
            };

            this.logger.log(`Chunked upload completed for ${file.originalname}`);
            onComplete?.(result, targetPath);

            return result;
        } catch (error) {
            this.logger.error(`Chunked upload failed: ${error.message}`, error.stack);
            onError?.(error);
            return {
                success: false,
                message: 'Failed to upload file in chunks',
                error: error.message,
            };
        }
    }

    /**
     * Upload file from disk path in chunks (for BullMQ jobs)
     */
    async uploadFileFromPathInChunks(
        filePath: string,
        fileName: string,
        targetPath: string,
        options: ChunkUploadOptions = {}
    ): Promise<ChunkUploadResult> {
        const {
            uploadId = `upload-${Date.now()}-${randomBytes(4).toString('hex')}`,
            chunkSize = this.DEFAULT_CHUNK_SIZE,
            onProgress,
            onComplete,
            onError,
        } = options;

        try {
            if (!fs.existsSync(filePath)) {
                throw new Error(`File not found: ${filePath}`);
            }

            const fileSize = fs.statSync(filePath).size;
            this.logger.log(`Starting chunked upload from path for ${fileName} (${Math.round(fileSize / 1024 / 1024)}MB)`);

            const totalChunks = Math.ceil(fileSize / chunkSize);
            let uploadedChunks = 0;

            // Create temporary directory for chunks
            const tempDir = path.join(process.cwd(), 'temp_uploads', uploadId);
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            // Read file in chunks
            const fileStream = fs.createReadStream(filePath, { highWaterMark: chunkSize });
            let chunkIndex = 0;

            return new Promise((resolve, reject) => {
                fileStream.on('data', async (chunk) => {
                    try {
                        const chunkPath = path.join(tempDir, `chunk-${chunkIndex}`);
                        fs.writeFileSync(chunkPath, chunk);

                        // Upload chunk with retry mechanism
                        const chunkUploaded = await this.uploadChunkWithRetry(chunkPath, `${targetPath}.chunk-${chunkIndex}`, 3);

                        if (!chunkUploaded) {
                            throw new Error(`Failed to upload chunk ${chunkIndex}`);
                        }

                        uploadedChunks++;
                        const progress = Math.round((uploadedChunks / totalChunks) * 100);

                        this.logger.log(`Chunk ${chunkIndex + 1}/${totalChunks} uploaded (${progress}%)`);
                        onProgress?.(progress);

                        // Emit progress via WebSocket
                        this.chunkUploadGateway.sendProgressUpdate(uploadId, {
                            uploadId,
                            progress,
                            totalChunks,
                            uploadedChunks,
                            fileName,
                            fileSize,
                            chunkSize,
                        });

                        chunkIndex++;
                    } catch (error) {
                        reject(error);
                    }
                });

                fileStream.on('end', async () => {
                    try {
                        // Combine chunks into final file
                        await this.combineChunks(tempDir, targetPath, totalChunks);

                        // Clean up temporary files
                        this.cleanupTempFiles(tempDir);

                        const result: ChunkUploadResult = {
                            success: true,
                            message: 'File uploaded successfully in chunks',
                            fileName: path.basename(targetPath),
                            totalChunks,
                            uploadedChunks,
                        };

                        this.logger.log(`Chunked upload completed for ${fileName}`);
                        onComplete?.(result, targetPath);

                        resolve(result);
                    } catch (error) {
                        reject(error);
                    }
                });

                fileStream.on('error', (error) => {
                    reject(error);
                });
            });
        } catch (error) {
            this.logger.error(`Chunked upload from path failed: ${error.message}`, error.stack);
            onError?.(error);
            return {
                success: false,
                message: 'Failed to upload file in chunks',
                error: error.message,
            };
        }
    }

    /**
     * Upload chunk with retry mechanism
     */
    private async uploadChunkWithRetry(chunkPath: string, targetPath: string, maxRetries: number): Promise<boolean> {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const chunkBuffer = fs.readFileSync(chunkPath);
                await SojebStorage.put(targetPath, chunkBuffer);
                return true;
            } catch (error) {
                this.logger.warn(`Chunk upload attempt ${attempt} failed: ${error.message}`);
                if (attempt === maxRetries) {
                    throw error;
                }
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }
        return false;
    }

    /**
     * Combine chunks into final file
     */
    private async combineChunks(tempDir: string, targetPath: string, totalChunks: number): Promise<void> {
        this.logger.log(`Combining ${totalChunks} chunks into final file`);

        const chunks: Buffer[] = [];

        for (let i = 0; i < totalChunks; i++) {
            const chunkPath = path.join(tempDir, `chunk-${i}`);
            if (fs.existsSync(chunkPath)) {
                const chunkBuffer = fs.readFileSync(chunkPath);
                chunks.push(chunkBuffer);
            }
        }

        if (chunks.length !== totalChunks) {
            throw new Error(`Missing chunks: expected ${totalChunks}, found ${chunks.length}`);
        }

        // Combine all chunks
        const finalBuffer = Buffer.concat(chunks);

        // Upload final file
        await SojebStorage.put(targetPath, finalBuffer);

        this.logger.log(`Final file created: ${targetPath} (${Math.round(finalBuffer.length / 1024 / 1024)}MB)`);
    }

    /**
     * Clean up temporary files
     */
    private cleanupTempFiles(tempDir: string): void {
        try {
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
                this.logger.log(`Cleaned up temporary files: ${tempDir}`);
            }
        } catch (error) {
            this.logger.warn(`Failed to clean up temporary files: ${error.message}`);
        }
    }

    /**
     * Start background chunked upload (fire-and-forget)
     */
    startBackgroundChunkedUpload(
        file: Express.Multer.File,
        targetPath: string,
        options: ChunkUploadOptions = {}
    ): string {
        const uploadId = options.uploadId || `upload-${Date.now()}-${randomBytes(4).toString('hex')}`;

        // Run upload in background
        setImmediate(async () => {
            try {
                await this.uploadFileInChunks(file, targetPath, { ...options, uploadId });
            } catch (error) {
                this.logger.error(`Background chunked upload failed for ${uploadId}: ${error.message}`);
            }
        });

        return uploadId;
    }
}
