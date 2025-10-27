import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { S3 } from 'aws-sdk';
import appConfig from '../../config/app.config';
import { SojebStorage } from '../../common/lib/Disk/SojebStorage';
import { VideoDurationService } from '../../common/lib/video-duration/video-duration.service';
import { StringHelper } from '../../common/helper/string.helper';

@Injectable()
export class UploadService {
    private readonly logger = new Logger(UploadService.name);
    private readonly s3: S3;

    constructor(
        private readonly prisma: PrismaService,
        private readonly videoDurationService: VideoDurationService
    ) {
        this.s3 = new S3({
            endpoint: appConfig().fileSystems.s3.endpoint,
            region: appConfig().fileSystems.s3.region,
            accessKeyId: appConfig().fileSystems.s3.key,
            secretAccessKey: appConfig().fileSystems.s3.secret,
            s3ForcePathStyle: true, // Required for MinIO
        });
    }

    /**
     * Generate presigned URL for direct MinIO upload
     */
    async generatePresignedUrl(body: {
        fileName: string;
        fileType: string;
        fileSize: number;
        courseId: string;
    }) {
        try {
            const { fileName, fileType, fileSize, courseId } = body;

            // Validate course exists
            const course = await this.prisma.course.findUnique({
                where: { id: courseId },
                select: { id: true, title: true, series_id: true }
            });

            if (!course) {
                throw new NotFoundException(`Course with ID ${courseId} not found`);
            }

            // Generate unique key for the file
            const timestamp = Date.now();
            const randomId = Math.random().toString(36).substr(2, 9);
            const fileExtension = fileName.split('.').pop();
            const baseName = fileName.replace(/\.[^/.]+$/, '');
            const key = `lesson-files/${timestamp}-${randomId}-${baseName}.${fileExtension}`;

            // Generate presigned URL for PUT operation
            const presignedUrl = this.s3.getSignedUrl('putObject', {
                Bucket: appConfig().fileSystems.s3.bucket,
                Key: key,
                ContentType: fileType,
                Expires: 3600, // 1 hour
                Metadata: {
                    'original-name': fileName,
                    'course-id': courseId,
                    'file-size': fileSize.toString(),
                    'upload-timestamp': timestamp.toString()
                }
            });

            this.logger.log(`📤 Generated presigned URL for: ${fileName} (${Math.round(fileSize / 1024 / 1024)}MB)`);

            return {
                success: true,
                message: 'Presigned URL generated successfully',
                data: {
                    uploadUrl: presignedUrl,
                    key,
                    fileName,
                    fileSize,
                    fileType,
                    courseId,
                    expiresIn: 3600,
                    bucket: appConfig().fileSystems.s3.bucket
                }
            };

        } catch (error) {
            this.logger.error(`Failed to generate presigned URL: ${error.message}`, error.stack);

            if (error instanceof NotFoundException) {
                throw error;
            }

            return {
                success: false,
                message: 'Failed to generate presigned URL',
                error: error.message
            };
        }
    }

    /**
     * Complete upload and create lesson file record
     */
    async completeUpload(body: {
        key: string;
        fileName: string;
        courseId: string;
        fileSize: number;
        fileType?: string;
    }) {
        try {
            const { key, fileName, courseId, fileSize, fileType } = body;

            // Validate course exists
            const course = await this.prisma.course.findUnique({
                where: { id: courseId },
                select: { id: true, title: true, series_id: true }
            });

            if (!course) {
                throw new NotFoundException(`Course with ID ${courseId} not found`);
            }

            // Generate lesson file title
            const title = fileName.split('.')[0];
            const lessonTitle = StringHelper.generateLessonFileNameWithoutPosition(title, fileName);

            // Determine file kind
            const kind = this.getFileKind(fileType || 'application/octet-stream');

            // Calculate video duration if it's a video file
            let videoLength: string | null = null;
            if (kind === 'video' && this.videoDurationService.isVideoFile(fileType || '')) {
                try {
                    // Download file from MinIO to calculate duration
                    const fileBuffer = await SojebStorage.get(key);
                    videoLength = await this.videoDurationService.calculateVideoLength(fileBuffer, fileName);
                    this.logger.log(`📹 Video duration calculated: ${videoLength} for ${fileName}`);
                } catch (error) {
                    this.logger.error(`Failed to calculate video duration: ${error.message}`);
                }
            }

            // Create lesson file record
            const lessonFile = await this.prisma.$transaction(async (prisma) => {
                const result = await prisma.lessonFile.create({
                    data: {
                        course_id: courseId,
                        title: lessonTitle,
                        url: key,
                        kind: kind,
                        alt: fileName,
                        video_length: videoLength,
                    },
                });

                // Update course and series video length
                if (videoLength) {
                    await this.updateCourseAndSeriesLength(courseId, course.series_id, videoLength, prisma);
                }

                return result;
            });

            this.logger.log(`✅ Upload completed: Lesson ${lessonFile.id} - ${fileName}`);

            return {
                success: true,
                message: 'Upload completed successfully',
                data: {
                    id: lessonFile.id,
                    title: lessonFile.title,
                    url: lessonFile.url,
                    kind: lessonFile.kind,
                    video_length: lessonFile.video_length,
                    file_url: SojebStorage.url(key),
                    course: {
                        id: course.id,
                        title: course.title
                    }
                }
            };

        } catch (error) {
            this.logger.error(`Failed to complete upload: ${error.message}`, error.stack);

            if (error instanceof NotFoundException) {
                throw error;
            }

            return {
                success: false,
                message: 'Failed to complete upload',
                error: error.message
            };
        }
    }

    /**
     * Test MinIO connection
     */
    async testMinIOConnection() {
        try {
            // Test connection by listing buckets
            const result = await this.s3.listBuckets().promise();

            const bucketName = appConfig().fileSystems.s3.bucket;
            const bucketExists = result.Buckets.some(b => b.Name === bucketName);

            return {
                success: true,
                message: 'MinIO connection successful',
                data: {
                    bucket: bucketName,
                    endpoint: appConfig().fileSystems.s3.endpoint,
                    region: appConfig().fileSystems.s3.region,
                    bucketExists,
                    availableBuckets: result.Buckets.map(b => b.Name),
                    timestamp: new Date().toISOString()
                }
            };

        } catch (error) {
            this.logger.error(`MinIO connection test failed: ${error.message}`);

            return {
                success: false,
                message: 'MinIO connection failed',
                error: error.message,
                data: {
                    bucket: appConfig().fileSystems.s3.bucket,
                    endpoint: appConfig().fileSystems.s3.endpoint,
                    region: appConfig().fileSystems.s3.region
                }
            };
        }
    }

    /**
     * Get bucket information
     */
    async getBucketInfo() {
        try {
            const bucketName = appConfig().fileSystems.s3.bucket;

            // Get bucket location
            const location = await this.s3.getBucketLocation({ Bucket: bucketName }).promise();

            // List objects in bucket (first 10)
            const objects = await this.s3.listObjectsV2({
                Bucket: bucketName,
                MaxKeys: 10
            }).promise();

            return {
                success: true,
                message: 'Bucket information retrieved',
                data: {
                    bucket: bucketName,
                    location: location.LocationConstraint || 'us-east-1',
                    objectCount: objects.KeyCount,
                    totalSize: objects.Contents?.reduce((sum, obj) => sum + (obj.Size || 0), 0) || 0,
                    recentObjects: objects.Contents?.map(obj => ({
                        key: obj.Key,
                        size: obj.Size,
                        lastModified: obj.LastModified
                    })) || []
                }
            };

        } catch (error) {
            this.logger.error(`Failed to get bucket info: ${error.message}`);

            return {
                success: false,
                message: 'Failed to get bucket information',
                error: error.message
            };
        }
    }

    /**
     * Get file kind from MIME type
     */
    private getFileKind(mimetype: string): string {
        if (mimetype.startsWith('video/')) return 'video';
        if (mimetype.startsWith('audio/')) return 'audio';
        if (mimetype.startsWith('image/')) return 'image';
        if (mimetype.includes('pdf')) return 'pdf';
        if (mimetype.includes('document') || mimetype.includes('text')) return 'document';
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
                    .map(l => l.video_length)
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
                    .flatMap(course => course.lesson_files)
                    .map(lesson => lesson.video_length)
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
