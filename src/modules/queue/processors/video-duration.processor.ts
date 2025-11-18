import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { VideoDurationService as VideoDurationCalculationService } from '../../../common/lib/video-duration/video-duration.service';
import { VideoDurationJobData } from '../services/video-duration.service';

@Processor('video-duration')
@Injectable()
export class VideoDurationProcessor extends WorkerHost {
    private readonly logger = new Logger(VideoDurationProcessor.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly videoDurationService: VideoDurationCalculationService,
    ) {
        super();
    }

    async process(job: Job<VideoDurationJobData>): Promise<any> {
        const jobName = job.name;

        switch (jobName) {
            case 'calculate-video-duration':
                return this.handleCalculateVideoDuration(job);
            default:
                this.logger.warn(`Unknown job name: ${jobName}`);
                return null;
        }
    }

    private async handleCalculateVideoDuration(job: Job<VideoDurationJobData>) {
        const { courseId, videoType, filePath, fileName, seriesId } = job.data;

        this.logger.log(`Processing ${videoType} video duration calculation for course ${courseId}`);

        try {
            // Check if course still exists
            const course = await this.prisma.course.findUnique({
                where: { id: courseId },
                select: {
                    id: true,
                    title: true,
                },
            });

            if (!course) {
                this.logger.warn(`Course with ID ${courseId} not found, skipping duration calculation`);
                return;
            }

            // Calculate video duration
            this.logger.log(`Calculating duration for ${videoType} video: ${filePath}`);
            const videoLength = await this.videoDurationService.calculateVideoLengthFromPath(
                filePath,
                fileName
            );

            if (!videoLength) {
                this.logger.warn(`Failed to calculate duration for ${videoType} video in course ${courseId}, keeping null`);
                return;
            }

            // Update course record with calculated duration
            const updateData: any = {};
            if (videoType === 'intro') {
                updateData.intro_video_length = videoLength;
            } else if (videoType === 'end') {
                updateData.end_video_length = videoLength;
            }

            await this.prisma.course.update({
                where: { id: courseId },
                data: updateData,
            });

            this.logger.log(`Successfully updated ${videoType} video duration: ${videoLength} for course ${courseId}`);

            // Update course total video_length (includes lesson files + intro + end videos)
            await this.updateCourseVideoLength(courseId);

            // Update series totals
            await this.updateSeriesTotalsVideoLength(seriesId);

        } catch (error) {
            // Log error but don't throw (keep null in database as per user preference)
            this.logger.error(
                `Failed to calculate ${videoType} video duration for course ${courseId}: ${error.message}`,
                error.stack
            );
            // Don't re-throw - keep null in database
        }
    }

    /**
     * Update course total video length (lesson files + intro + end videos)
     */
    private async updateCourseVideoLength(courseId: string): Promise<void> {
        try {
            const course = await this.prisma.course.findUnique({
                where: { id: courseId },
                include: {
                    lesson_files: {
                        select: { video_length: true },
                    },
                },
            });

            if (!course) {
                return;
            }

            // Collect all video lengths (lesson files + intro video + end video)
            const allLengths: string[] = [];

            // Add lesson file video lengths
            if (course.lesson_files?.length) {
                course.lesson_files.forEach(lesson => {
                    if (lesson.video_length) allLengths.push(lesson.video_length);
                });
            }

            // Add intro and end video lengths
            if (course.intro_video_length) allLengths.push(course.intro_video_length);
            if (course.end_video_length) allLengths.push(course.end_video_length);

            if (allLengths.length > 0) {
                const totalLength = this.videoDurationService.calculateTotalLength(allLengths);
                await this.prisma.course.update({
                    where: { id: courseId },
                    data: { video_length: totalLength },
                });
                this.logger.log(`Updated course ${courseId} total video length: ${totalLength} (${allLengths.length} videos total)`);
            }
        } catch (error) {
            this.logger.error(`Failed to update course video length for ${courseId}: ${error.message}`, error.stack);
        }
    }

    /**
     * Update series total video length
     */
    private async updateSeriesTotalsVideoLength(seriesId: string): Promise<void> {
        try {
            // Get all courses for the series
            const courses = await this.prisma.course.findMany({
                where: { series_id: seriesId },
                select: {
                    video_length: true,
                    intro_video_length: true,
                    end_video_length: true,
                },
            });

            // Collect all video lengths (course videos + intro videos + end videos)
            const allVideoLengths: string[] = [];

            courses.forEach(course => {
                if (course.video_length) allVideoLengths.push(course.video_length);
                if (course.intro_video_length) allVideoLengths.push(course.intro_video_length);
                if (course.end_video_length) allVideoLengths.push(course.end_video_length);
            });

            // Calculate total video length
            const seriesVideoLength = allVideoLengths.length > 0
                ? this.videoDurationService.calculateTotalLength(allVideoLengths)
                : null;

            // Update series with calculated video length
            await this.prisma.series.update({
                where: { id: seriesId },
                data: {
                    video_length: seriesVideoLength,
                },
            });

            this.logger.log(`Updated series ${seriesId} total video length: ${seriesVideoLength} (${allVideoLengths.length} videos total)`);
        } catch (error) {
            this.logger.error(`Failed to update series video length for ${seriesId}: ${error.message}`, error.stack);
        }
    }
}

