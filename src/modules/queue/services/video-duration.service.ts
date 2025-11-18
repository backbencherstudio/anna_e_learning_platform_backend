import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export interface VideoDurationJobData {
    courseId: string;
    videoType: 'intro' | 'end';
    filePath: string;
    fileName: string;
    seriesId: string;
}

@Injectable()
export class VideoDurationService {
    private readonly logger = new Logger(VideoDurationService.name);

    constructor(
        @InjectQueue('video-duration') private videoDurationQueue: Queue,
    ) { }

    /**
     * Enqueue video duration calculation job
     * @param courseId Course ID
     * @param videoType 'intro' or 'end'
     * @param filePath Full path to the video file
     * @param fileName Original file name
     * @param seriesId Series ID for updating totals
     */
    async enqueueVideoDurationCalculation(
        courseId: string,
        videoType: 'intro' | 'end',
        filePath: string,
        fileName: string,
        seriesId: string,
    ): Promise<void> {
        try {
            this.logger.log(`Enqueuing ${videoType} video duration calculation for course ${courseId}`);

            const job = await this.videoDurationQueue.add(
                'calculate-video-duration',
                {
                    courseId,
                    videoType,
                    filePath,
                    fileName,
                    seriesId,
                },
                {
                    priority: 1,
                    attempts: 1, // No retry as per user preference
                    removeOnComplete: true,
                    removeOnFail: false,
                }
            );

            this.logger.log(`Video duration calculation job enqueued: ${job.id} for ${videoType} video in course ${courseId}`);
        } catch (error) {
            this.logger.error(`Failed to enqueue video duration calculation for ${videoType} video in course ${courseId}: ${error.message}`, error.stack);
            throw error;
        }
    }
}

