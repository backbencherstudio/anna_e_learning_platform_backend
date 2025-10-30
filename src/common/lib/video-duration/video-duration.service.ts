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
            this.logger.log(`Starting video length calculation for: ${originalName}, Buffer size: ${fileBuffer.length}`);

            // Validate buffer
            if (!fileBuffer || fileBuffer.length === 0) {
                this.logger.warn(`Empty or invalid buffer for file: ${originalName}`);
                return null;
            }

            // Create a temporary file
            const tempDir = os.tmpdir();
            const tempFileName = `temp_video_${Date.now()}_${Math.random().toString(36).substring(7)}${path.extname(originalName)}`;
            const tempFilePath = path.join(tempDir, tempFileName);

            this.logger.log(`Creating temporary file: ${tempFilePath}`);

            // Write buffer to temporary file
            fs.writeFileSync(tempFilePath, fileBuffer);
            this.logger.log(`Temporary file created successfully, size: ${fs.statSync(tempFilePath).size} bytes`);

            try {
                // Get video length using ffprobe
                this.logger.log(`Calling ffprobe for: ${tempFilePath}`);
                const length = await this.getVideoLengthFromFile(tempFilePath);
                this.logger.log(`FFprobe returned length: ${length}`);

                if (length !== null && length > 0) {
                    const formattedLength = this.formatDuration(length);
                    this.logger.log(`Formatted length: ${formattedLength}`);
                    return formattedLength;
                }

                this.logger.warn(`FFprobe returned invalid length (${length}) for: ${originalName}`);

                // Try alternative method - estimate based on file size (very rough estimate)
                const fileSize = fs.statSync(tempFilePath).size;
                const estimatedLength = this.estimateVideoLengthFromSize(fileSize, originalName);
                if (estimatedLength) {
                    this.logger.log(`Using estimated length: ${estimatedLength}`);
                    return estimatedLength;
                }

                return null;
            } finally {
                // Clean up temporary file
                try {
                    fs.unlinkSync(tempFilePath);
                    this.logger.log(`Temporary file deleted: ${tempFilePath}`);
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
            this.logger.log(`FFprobe starting for file: ${filePath}`);

            ffmpeg.ffprobe(filePath, (err, metadata) => {
                if (err) {
                    this.logger.error(`FFprobe error: ${err.message}`, err.stack);
                    resolve(null);
                    return;
                }

                try {
                    this.logger.log(`FFprobe metadata received:`, JSON.stringify(metadata.format, null, 2));

                    const length = metadata.format.duration;
                    this.logger.log(`Raw duration from metadata: ${length}`);

                    if (length && !isNaN(length)) {
                        const roundedLength = Math.floor(length);
                        this.logger.log(`Rounded duration: ${roundedLength} seconds`);
                        resolve(roundedLength);
                    } else {
                        this.logger.warn(`Invalid length from metadata: ${length}`);
                        resolve(null);
                    }
                } catch (error) {
                    this.logger.error(`Error parsing length: ${error.message}`, error.stack);
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

    /**
     * Calculate video resolution from file buffer
     * @param fileBuffer - The video file buffer
     * @param originalName - Original filename for extension detection
     * @returns Promise<string> - Video resolution in format "1920x1080" or null
     */
    async calculateVideoResolution(fileBuffer: Buffer, originalName: string): Promise<string | null> {
        try {
            this.logger.log(`Starting video resolution calculation for: ${originalName}`);

            // Validate buffer
            if (!fileBuffer || fileBuffer.length === 0) {
                this.logger.warn(`Empty or invalid buffer for file: ${originalName}`);
                return null;
            }

            // Create a temporary file
            const tempDir = os.tmpdir();
            const tempFileName = `temp_video_${Date.now()}_${Math.random().toString(36).substring(7)}${path.extname(originalName)}`;
            const tempFilePath = path.join(tempDir, tempFileName);

            this.logger.log(`Creating temporary file for resolution: ${tempFilePath}`);

            // Write buffer to temporary file
            fs.writeFileSync(tempFilePath, fileBuffer);
            this.logger.log(`Temporary file created successfully`);

            try {
                // Get video resolution using ffprobe
                const resolution = await this.getVideoResolutionFromFile(tempFilePath);
                this.logger.log(`FFprobe returned resolution: ${resolution}`);
                return resolution;
            } finally {
                // Clean up temporary file
                try {
                    fs.unlinkSync(tempFilePath);
                    this.logger.log(`Temporary file deleted: ${tempFilePath}`);
                } catch (error) {
                    this.logger.warn(`Failed to delete temporary file: ${tempFilePath}`, error);
                }
            }
        } catch (error) {
            this.logger.error(`Error calculating video resolution: ${error.message}`, error.stack);
            return null;
        }
    }

    /**
     * Get video resolution from file path using ffprobe
     * @param filePath - Path to the video file
     * @returns Promise<string | null> - Resolution like "1920x1080" or null
     */
    private async getVideoResolutionFromFile(filePath: string): Promise<string | null> {
        return new Promise((resolve) => {
            this.logger.log(`FFprobe starting for resolution: ${filePath}`);

            ffmpeg.ffprobe(filePath, (err, metadata) => {
                if (err) {
                    this.logger.error(`FFprobe error: ${err.message}`, err.stack);
                    resolve(null);
                    return;
                }

                try {
                    // Look for video stream to get resolution
                    const videoStream = metadata.streams?.find(stream => stream.codec_type === 'video');

                    if (videoStream && videoStream.width && videoStream.height) {
                        const resolution = `${videoStream.width}x${videoStream.height}`;
                        this.logger.log(`Video resolution: ${resolution}`);
                        resolve(resolution);
                    } else {
                        this.logger.warn(`No video stream found or missing width/height`);
                        resolve(null);
                    }
                } catch (error) {
                    this.logger.error(`Error parsing resolution: ${error.message}`, error.stack);
                    resolve(null);
                }
            });
        });
    }

    /**
     * Estimate video length based on file size (very rough estimate)
     * @param fileSize - File size in bytes
     * @param fileName - Original file name
     * @returns string | null - Estimated length or null
     */
    private estimateVideoLengthFromSize(fileSize: number, fileName: string): string | null {
        try {
            // Very rough estimation based on typical video bitrates
            // This is just a fallback when FFprobe fails
            const ext = path.extname(fileName).toLowerCase();

            // Different formats have different typical bitrates
            let estimatedBitrate = 1000000; // 1 Mbps default

            switch (ext) {
                case '.mp4':
                    estimatedBitrate = 2000000; // 2 Mbps
                    break;
                case '.webm':
                    estimatedBitrate = 1500000; // 1.5 Mbps
                    break;
                case '.avi':
                    estimatedBitrate = 3000000; // 3 Mbps
                    break;
                case '.mov':
                    estimatedBitrate = 2500000; // 2.5 Mbps
                    break;
            }

            // Calculate estimated duration: fileSize (bytes) / bitrate (bits per second) * 8 (bits per byte)
            const estimatedSeconds = Math.floor((fileSize * 8) / estimatedBitrate);

            if (estimatedSeconds > 0 && estimatedSeconds < 36000) { // Less than 10 hours
                this.logger.log(`Estimated video length: ${estimatedSeconds} seconds for ${fileName} (${fileSize} bytes)`);
                return this.formatDuration(estimatedSeconds);
            }

            return null;
        } catch (error) {
            this.logger.error(`Error estimating video length: ${error.message}`);
            return null;
        }
    }
}
