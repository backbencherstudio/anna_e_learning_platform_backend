import { Injectable, Logger } from '@nestjs/common';
import * as ffmpeg from 'fluent-ffmpeg';
import * as ffmpegPath from '@ffmpeg-installer/ffmpeg';
import * as ffprobePath from '@ffprobe-installer/ffprobe';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

@Injectable()
export class VideoDurationService {
    private readonly logger = new Logger(VideoDurationService.name);

    constructor() {
        try {
            // Set the FFmpeg path
            ffmpeg.setFfmpegPath(ffmpegPath.path);
            // Set the FFprobe path using the dedicated package
            ffmpeg.setFfprobePath(ffprobePath.path);
            this.logger.log(`FFmpeg path set to: ${ffmpegPath.path}`);
            this.logger.log(`FFprobe path set to: ${ffprobePath.path}`);
        } catch (error) {
            this.logger.error(`Failed to set FFmpeg/FFprobe paths: ${error.message}`);
        }
    }

    /**
     * Calculate video length from file buffer
     * @param fileBuffer - The video file buffer
     * @param originalName - Original filename for extension detection
     * @returns Promise<string> - Video length in format "18m 44s" or "18 min 44 sec"
     */
    async calculateVideoLength(fileBuffer: Buffer, originalName: string): Promise<string | null> {
        try {
            // Create a temporary file
            const tempDir = os.tmpdir();
            const tempFileName = `temp_video_${Date.now()}_${Math.random().toString(36).substring(7)}${path.extname(originalName)}`;
            const tempFilePath = path.join(tempDir, tempFileName);

            // Write buffer to temporary file
            fs.writeFileSync(tempFilePath, fileBuffer);

            try {
                // Get video length using ffprobe
                const length = await this.getVideoLengthFromFile(tempFilePath);

                if (length !== null) {
                    return this.formatDuration(length);
                }

                return null;
            } finally {
                // Clean up temporary file
                try {
                    fs.unlinkSync(tempFilePath);
                } catch (error) {
                    this.logger.warn(`Failed to delete temporary file: ${tempFilePath}`, error);
                }
            }
        } catch (error) {
            this.logger.error(`Error calculating video length: ${error.message}`, error.stack);
            return null;
        }
    }

    /**
     * Get video length from file path using ffprobe
     * @param filePath - Path to the video file
     * @returns Promise<number> - Length in seconds
     */
    private async getVideoLengthFromFile(filePath: string): Promise<number | null> {
        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(filePath, (err, metadata) => {
                if (err) {
                    this.logger.error(`FFprobe error: ${err.message}`);
                    resolve(null);
                    return;
                }

                try {
                    const length = metadata.format.duration;
                    if (length && !isNaN(length)) {
                        resolve(Math.floor(length));
                    } else {
                        this.logger.warn('Invalid length from metadata');
                        resolve(null);
                    }
                } catch (error) {
                    this.logger.error(`Error parsing length: ${error.message}`);
                    resolve(null);
                }
            });
        });
    }

    /**
     * Format length in seconds to human-readable format
     * @param lengthInSeconds - Length in seconds
     * @returns string - Formatted length like "18m 44s" or "18 min 44 sec"
     */
    private formatDuration(lengthInSeconds: number): string {
        const hours = Math.floor(lengthInSeconds / 3600);
        const minutes = Math.floor((lengthInSeconds % 3600) / 60);
        const seconds = lengthInSeconds % 60;

        const parts: string[] = [];

        if (hours > 0) {
            parts.push(`${hours}h`);
        }

        if (minutes > 0) {
            parts.push(`${minutes}m`);
        }

        if (seconds > 0 || parts.length === 0) {
            parts.push(`${seconds}s`);
        }

        return parts.join(' ');
    }

    /**
     * Check if a file is a video based on MIME type
     * @param mimetype - MIME type of the file
     * @returns boolean - True if it's a video file
     */
    isVideoFile(mimetype: string): boolean {
        return mimetype.startsWith('video/');
    }

    /**
     * Check if a file is a video based on file extension
     * @param fileName - Name of the file
     * @returns boolean - True if it's a video file
     */
    isVideoFileByExtension(fileName: string): boolean {
        const ext = path.extname(fileName).toLowerCase();
        const videoExtensions = ['.mp4', '.webm', '.ogg', '.avi', '.mov', '.wmv', '.mkv', '.flv', '.3gp'];
        return videoExtensions.includes(ext);
    }

    /**
     * Parse length string back to seconds for calculations
     * @param lengthString - Length string like "18m 44s" or "1h 30m 45s"
     * @returns number - Length in seconds
     */
    parseLengthToSeconds(lengthString: string): number {
        if (!lengthString) return 0;

        let totalSeconds = 0;
        const parts = lengthString.split(' ');

        for (const part of parts) {
            if (part.endsWith('h')) {
                const hours = parseInt(part.replace('h', ''));
                totalSeconds += hours * 3600;
            } else if (part.endsWith('m')) {
                const minutes = parseInt(part.replace('m', ''));
                totalSeconds += minutes * 60;
            } else if (part.endsWith('s')) {
                const seconds = parseInt(part.replace('s', ''));
                totalSeconds += seconds;
            }
        }

        return totalSeconds;
    }

    /**
     * Calculate total length from an array of length strings
     * @param lengths - Array of length strings
     * @returns string - Total length formatted as "1h 30m 45s"
     */
    calculateTotalLength(lengths: (string | null)[]): string {
        const totalSeconds = lengths.reduce((total, length) => {
            return total + this.parseLengthToSeconds(length || '');
        }, 0);

        return this.formatDuration(totalSeconds);
    }
}
