import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SojebStorage } from '../../common/lib/Disk/SojebStorage';
import { VideoDurationService } from '../../common/lib/video-duration/video-duration.service';
import { StringHelper } from '../../common/helper/string.helper';
import appConfig from '../../config/app.config';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { UploadChunkDto } from './dto/upload-chunk.dto';
import { MergeChunksDto } from './dto/merge-chunks.dto';
import { AbortChunkUploadDto } from './dto/abort-chunk-upload.dto';

@Injectable()
export class ChunkUploadService {
    private readonly logger = new Logger(ChunkUploadService.name);
    private readonly tempChunksDir: string;

    constructor(
        private readonly prisma: PrismaService,
        private readonly videoDurationService: VideoDurationService,
    ) {
        // Set temp chunks directory
        this.tempChunksDir = path.join(process.cwd(), 'public', 'storage', 'temp', 'chunks');

        // Ensure temp directory exists
        if (!fs.existsSync(this.tempChunksDir)) {
            fs.mkdirSync(this.tempChunksDir, { recursive: true });
            this.logger.log(`Created temp chunks directory: ${this.tempChunksDir}`);
        }
    }

    /**
     * Save a chunk to temporary storage
     */
    async saveChunk(chunk: Express.Multer.File, dto: UploadChunkDto) {
        try {
            const chunkFileName = `${dto.fileName}-part-${dto.index}`;
            const chunkPath = path.join(this.tempChunksDir, chunkFileName);

            // Ensure directory exists
            const dirPath = path.dirname(chunkPath);
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }

            // Save chunk to disk
            fs.writeFileSync(chunkPath, chunk.buffer);

            this.logger.log(`✅ Chunk ${dto.index + 1}/${dto.totalChunks} saved: ${chunkFileName} (${Math.round(chunk.buffer.length / 1024 / 1024)}MB)`);

            return {
                success: true,
                message: 'Chunk uploaded successfully',
                index: dto.index,
                totalChunks: dto.totalChunks,
                chunkSize: chunk.buffer.length,
            };
        } catch (error) {
            this.logger.error(`Failed to save chunk: ${error.message}`, error.stack);
            throw new BadRequestException(`Failed to save chunk: ${error.message}`);
        }
    }

    /**
     * Merge all chunks and create or update lesson file record
     */
    async mergeChunks(dto: MergeChunksDto) {
        try {
            // Validate course exists
            const course = await this.prisma.course.findUnique({
                where: { id: dto.courseId },
                select: { id: true, title: true, series_id: true },
            });

            if (!course) {
                throw new NotFoundException(`Course with ID ${dto.courseId} not found`);
            }

            // Check if updating existing lesson file
            let existingLessonFile: any = null;
            if (dto.lessonFileId) {
                existingLessonFile = await this.prisma.lessonFile.findUnique({
                    where: { id: dto.lessonFileId },
                    select: {
                        id: true,
                        course_id: true,
                        url: true,
                        doc: true,
                        video_qualities: true,
                    },
                });

                if (!existingLessonFile) {
                    throw new NotFoundException(`Lesson file with ID ${dto.lessonFileId} not found`);
                }

                // Validate that lesson file belongs to the same course
                if (existingLessonFile.course_id !== dto.courseId) {
                    throw new BadRequestException(
                        `Lesson file ${dto.lessonFileId} does not belong to course ${dto.courseId}`
                    );
                }

                this.logger.log(`🔄 Updating existing lesson file: ${dto.lessonFileId}`);
            }

            // Generate final file name
            const title = dto.title || dto.fileName.split('.')[0];
            const finalFileName = StringHelper.generateLessonFileNameWithoutPosition(title, dto.fileName);
            const finalFilePath = appConfig().storageUrl.lesson_file + finalFileName;

            // Delete old files before merging new chunks (if updating)
            if (existingLessonFile) {
                try {
                    // Delete old video file (only if file name is different, otherwise it will be overwritten)
                    if (existingLessonFile.url && existingLessonFile.url !== finalFileName) {
                        await SojebStorage.delete(appConfig().storageUrl.lesson_file + existingLessonFile.url);
                        this.logger.log(`✅ Deleted old video file: ${existingLessonFile.url}`);
                    } else if (existingLessonFile.url === finalFileName) {
                        this.logger.log(`⚠️ New file name matches old file name: ${finalFileName}. Old file will be overwritten.`);
                    }

                    // Always delete video quality files (they are separate files and will be regenerated if needed)
                    if (existingLessonFile.video_qualities) {
                        await this.deleteVideoQualityFiles(existingLessonFile.video_qualities, existingLessonFile.url);
                    }

                    // Delete doc file if exists
                    if (existingLessonFile.doc) {
                        await SojebStorage.delete(appConfig().storageUrl.doc_file + existingLessonFile.doc);
                        this.logger.log(`✅ Deleted old doc file: ${existingLessonFile.doc}`);
                    }
                } catch (error) {
                    this.logger.warn(`Failed to delete some old files: ${error.message}`);
                    // Continue with update even if some files couldn't be deleted
                }
            }

            this.logger.log(`🔄 Starting to merge chunks for: ${dto.fileName}`);

            // Merge chunks using streams (efficient for large files)
            await this.combineChunks(dto.fileName, finalFilePath);

            this.logger.log(`✅ Chunks merged successfully: ${finalFileName}`);

            // Determine file kind
            const kind = this.getFileKind(dto.fileType);

            // Calculate video duration if it's a video file
            let videoLength: string | null = null;
            if (kind === 'video' && this.videoDurationService.isVideoFile(dto.fileType)) {
                try {
                    // Read file from storage to calculate duration
                    // Use fs.readFile directly to get binary buffer (SojebStorage.get() uses UTF-8 encoding)
                    const storagePath = path.join(process.cwd(), 'public', 'storage', finalFilePath);
                    const fileBuffer = fs.readFileSync(storagePath);
                    videoLength = await this.videoDurationService.calculateVideoLength(fileBuffer, dto.fileName);
                    this.logger.log(`📹 Video duration calculated: ${videoLength} for ${finalFileName}`);
                } catch (error) {
                    this.logger.error(`Failed to calculate video duration: ${error.message}`);
                }
            }

            // Create or update lesson file record in database
            const lessonFile = await this.prisma.$transaction(async (prisma) => {
                if (existingLessonFile) {
                    // Update existing record
                    const result = await prisma.lessonFile.update({
                        where: { id: dto.lessonFileId },
                        data: {
                            title: title,
                            url: finalFileName,
                            kind: kind,
                            alt: dto.fileName,
                            video_length: videoLength,
                            video_resolution: null, // Clear old resolution
                            video_qualities: null, // Clear old qualities
                        },
                    });

                    // Update course/series video length
                    if (videoLength) {
                        await this.updateCourseAndSeriesLength(dto.courseId, course.series_id, videoLength, prisma);
                    }

                    this.logger.log(`✅ Lesson file updated: ${result.id} - ${finalFileName}`);
                    return result;
                } else {
                    // Create new record
                    const result = await prisma.lessonFile.create({
                        data: {
                            course_id: dto.courseId,
                            title: title,
                            url: finalFileName,
                            kind: kind,
                            alt: dto.fileName,
                            video_length: videoLength,
                        },
                    });

                    // Update course/series video length
                    if (videoLength) {
                        await this.updateCourseAndSeriesLength(dto.courseId, course.series_id, videoLength, prisma);
                    }

                    this.logger.log(`✅ Lesson file created: ${result.id} - ${finalFileName}`);
                    return result;
                }
            });

            // Clean up temporary chunk files
            this.cleanupChunks(dto.fileName);

            // Get file URL
            const fileUrl = SojebStorage.url(finalFilePath);

            const action = existingLessonFile ? 'updated' : 'created';
            this.logger.log(`🎉 Lesson file ${action} successfully: ${lessonFile.id} - ${finalFileName}`);

            return {
                success: true,
                message: `Chunks merged and lesson file ${action} successfully`,
                lessonFile: {
                    id: lessonFile.id,
                    title: lessonFile.title,
                    url: lessonFile.url,
                    kind: lessonFile.kind,
                    video_length: lessonFile.video_length,
                    file_url: fileUrl,
                },
                course: {
                    id: course.id,
                    title: course.title,
                },
            };
        } catch (error) {
            this.logger.error(`Failed to merge chunks: ${error.message}`, error.stack);

            // Clean up chunks on error
            this.cleanupChunks(dto.fileName);

            if (error instanceof NotFoundException || error instanceof BadRequestException) {
                throw error;
            }

            throw new BadRequestException(`Failed to merge chunks: ${error.message}`);
        }
    }

    /**
     * Combine chunks into final file using streams and save to SojebStorage
     */
    private async combineChunks(fileName: string, finalFilePath: string): Promise<void> {
        let index = 0;
        let totalBytes = 0;
        const serviceInstance = this;

        // Create a readable stream that reads chunks sequentially
        const chunkStream = new Readable({
            objectMode: false,
            read(size) {
                const chunkFileName = `${fileName}-part-${index}`;
                const chunkPath = path.join(serviceInstance.tempChunksDir, chunkFileName);

                if (!fs.existsSync(chunkPath)) {
                    // No more chunks, end the stream
                    this.push(null);
                    serviceInstance.logger.log(`📦 Merged ${index} chunks, total size: ${Math.round(totalBytes / 1024 / 1024)}MB`);
                    return;
                }

                try {
                    const chunkBuffer = fs.readFileSync(chunkPath);
                    totalBytes += chunkBuffer.length;
                    this.push(chunkBuffer);
                    index++;
                } catch (error) {
                    this.destroy(error);
                }
            },
        });

        // Use putLargeFile to save the stream to storage (memory-efficient for large files)
        await SojebStorage.putLargeFile(finalFilePath, chunkStream);
        this.logger.log(`💾 File saved to storage: ${finalFilePath} (${Math.round(totalBytes / 1024 / 1024)}MB)`);
    }

    /**
     * Clean up temporary chunk files
     */
    cleanupChunks(fileName: string): void {
        try {
            let index = 0;
            let cleanedCount = 0;

            while (true) {
                const chunkFileName = `${fileName}-part-${index}`;
                const chunkPath = path.join(this.tempChunksDir, chunkFileName);

                if (!fs.existsSync(chunkPath)) {
                    break;
                }

                try {
                    fs.unlinkSync(chunkPath);
                    cleanedCount++;
                } catch (error) {
                    this.logger.warn(`Failed to delete chunk ${chunkFileName}: ${error.message}`);
                }

                index++;
            }

            if (cleanedCount > 0) {
                this.logger.log(`🧹 Cleaned up ${cleanedCount} chunk files for: ${fileName}`);
            }
        } catch (error) {
            this.logger.warn(`Failed to cleanup chunks for ${fileName}: ${error.message}`);
        }
    }

    /**
     * Abort chunk upload and clean up
     */
    async abortChunkUpload(dto: AbortChunkUploadDto) {
        try {
            this.cleanupChunks(dto.fileName);

            return {
                success: true,
                message: 'Chunks cleaned up successfully',
            };
        } catch (error) {
            this.logger.error(`Failed to abort chunk upload: ${error.message}`, error.stack);
            throw new BadRequestException(`Failed to abort chunk upload: ${error.message}`);
        }
    }

    /**
     * Delete video quality files from storage
     */
    private async deleteVideoQualityFiles(videoQualities: any, originalUrl?: string): Promise<void> {
        if (!videoQualities || typeof videoQualities !== 'object') {
            return;
        }

        try {
            for (const [quality, data] of Object.entries(videoQualities)) {
                if (data && typeof data === 'object' && 'url' in data) {
                    const qualityUrl = (data as any).url;
                    if (qualityUrl) {
                        // Skip if this is the original quality and URL matches the main file URL
                        // (to avoid deleting the main file which is already handled separately)
                        if (quality === 'original' && originalUrl && qualityUrl === originalUrl) {
                            continue;
                        }

                        const qualityFilePath = appConfig().storageUrl.lesson_file + qualityUrl;
                        try {
                            await SojebStorage.delete(qualityFilePath);
                            this.logger.log(`✅ Deleted quality file: ${quality} - ${qualityUrl}`);
                        } catch (error) {
                            this.logger.warn(`Failed to delete quality file ${quality} (${qualityUrl}): ${error.message}`);
                        }
                    }
                }
            }
        } catch (error) {
            this.logger.error(`Error deleting video quality files: ${error.message}`);
        }
    }

    /**
     * Get file kind from MIME type
     */
    private getFileKind(mimetype: string): string {
        if (mimetype.startsWith('image/')) return 'image';
        if (mimetype.startsWith('video/')) return 'video';
        if (mimetype.startsWith('audio/')) return 'audio';
        if (mimetype === 'application/pdf') return 'pdf';
        if (mimetype.includes('powerpoint') || mimetype.includes('presentation')) return 'slides';
        return 'other';
    }

    /**
     * Update course and series video length
     */
    private async updateCourseAndSeriesLength(
        courseId: string,
        seriesId: string,
        videoLength: string | null,
        prisma: any
    ) {
        if (!videoLength) return;

        try {
            const course = await prisma.course.findUnique({
                where: { id: courseId },
                include: {
                    lesson_files: {
                        select: { video_length: true },
                    },
                },
            });

            if (course?.lesson_files.length) {
                const lengths = course.lesson_files
                    .map((l: any) => l.video_length)
                    .filter(Boolean);

                if (lengths.length > 0) {
                    const totalLength = this.videoDurationService.calculateTotalLength(lengths);
                    await prisma.course.update({
                        where: { id: courseId },
                        data: { video_length: totalLength },
                    });

                    // Update series totals
                    await this.updateSeriesTotalsVideoLength(seriesId, prisma);
                }
            }
        } catch (error) {
            this.logger.error(`Failed to update video lengths: ${error.message}`);
        }
    }

    /**
     * Update series total video length
     */
    private async updateSeriesTotalsVideoLength(seriesId: string, prisma: any) {
        try {
            const series = await prisma.series.findUnique({
                where: { id: seriesId },
                include: {
                    courses: {
                        include: {
                            lesson_files: {
                                select: { video_length: true },
                            },
                        },
                    },
                },
            });

            if (series?.courses.length) {
                const allLengths = series.courses
                    .flatMap((course: any) => course.lesson_files)
                    .map((lesson: any) => lesson.video_length)
                    .filter(Boolean);

                if (allLengths.length > 0) {
                    const totalLength = this.videoDurationService.calculateTotalLength(allLengths);
                    await prisma.series.update({
                        where: { id: seriesId },
                        data: { video_length: totalLength },
                    });
                }
            }
        } catch (error) {
            this.logger.error(`Failed to update series video length: ${error.message}`);
        }
    }
}

