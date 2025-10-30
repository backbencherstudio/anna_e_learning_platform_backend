import { Injectable, Logger } from '@nestjs/common';
import * as ffmpeg from 'fluent-ffmpeg';
import * as ffmpegPath from '@ffmpeg-installer/ffmpeg';
import * as ffprobePath from '@ffprobe-installer/ffprobe';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

@Injectable()
export class VideoQualityService {
    private readonly logger = new Logger(VideoQualityService.name);

    constructor() {
        try {
            ffmpeg.setFfmpegPath(ffmpegPath.path);
            ffmpeg.setFfprobePath(ffprobePath.path);
            this.logger.log(`FFmpeg path set to: ${ffmpegPath.path}`);
        } catch (error) {
            this.logger.error(`Failed to set FFmpeg paths: ${error.message}`);
        }
    }

    /**
     * Generate adaptive streaming qualities (480p, 720p, 1080p) from a video file
     * @param fileBuffer - The video file buffer
     * @param originalName - Original filename
     * @param outputDir - Directory to save output files
     * @returns Promise with quality information and file paths
     */
    async generateAdaptiveQualities(
        fileBuffer: Buffer,
        originalName: string,
        outputDir: string
    ): Promise<{
        qualities: {
            [key: string]: {
                resolution: string;
                bitrate: string;
                playlist: string;
                segments: string[];
            };
        };
        masterPlaylist: string;
    } | null> {
        try {
            this.logger.log(`Generating adaptive qualities for: ${originalName}`);

            // Validate buffer
            if (!fileBuffer || fileBuffer.length === 0) {
                this.logger.warn(`Empty or invalid buffer for file: ${originalName}`);
                return null;
            }

            // Get original video resolution first
            const tempDir = os.tmpdir();
            const tempFileName = `temp_video_${Date.now()}_${Math.random().toString(36).substring(7)}${path.extname(originalName)}`;
            const tempFilePath = path.join(tempDir, tempFileName);

            this.logger.log(`Creating temporary file: ${tempFilePath}`);
            fs.writeFileSync(tempFilePath, fileBuffer);

            try {
                // Get video metadata to determine original resolution
                const metadata = await this.getVideoMetadata(tempFilePath);
                if (!metadata) {
                    this.logger.error('Failed to get video metadata');
                    return null;
                }

                const originalResolution = metadata.width || 1920;
                const qualities: {
                    [key: string]: {
                        resolution: string;
                        bitrate: string;
                        playlist: string;
                        segments: string[];
                    };
                } = {};

                // Define quality presets
                const qualityPresets = [
                    { name: '480p', width: 854, height: 480, bitrate: '1000k' },
                    { name: '720p', width: 1280, height: 720, bitrate: '2500k' },
                    { name: '1080p', width: 1920, height: 1080, bitrate: '5000k' },
                ];

                // Filter qualities based on original resolution
                const applicableQualities = qualityPresets.filter(
                    preset => preset.width <= originalResolution
                );

                // Generate each quality
                for (const preset of applicableQualities) {
                    try {
                        const qualityResult = await this.generateQuality(
                            tempFilePath,
                            preset,
                            outputDir
                        );

                        if (qualityResult) {
                            qualities[preset.name] = qualityResult;
                            this.logger.log(`✅ Generated ${preset.name} quality`);
                        }
                    } catch (error) {
                        this.logger.error(`Failed to generate ${preset.name} quality: ${error.message}`);
                    }
                }

                if (Object.keys(qualities).length === 0) {
                    this.logger.error('No qualities were generated');
                    return null;
                }

                // Generate master playlist (HLS multi-quality playlist)
                const masterPlaylist = this.generateMasterPlaylist(qualities);

                return {
                    qualities,
                    masterPlaylist,
                };
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
            this.logger.error(`Error generating adaptive qualities: ${error.message}`, error.stack);
            return null;
        }
    }

    /**
     * Generate a single quality version of the video
     */
    private async generateQuality(
        inputPath: string,
        preset: { name: string; width: number; height: number; bitrate: string },
        outputDir: string
    ): Promise<{
        resolution: string;
        bitrate: string;
        playlist: string;
        segments: string[];
    } | null> {
        return new Promise((resolve, reject) => {
            // Ensure output directory exists
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            const playlistName = `playlist_${preset.name}.m3u8`;
            const segmentPattern = `segment_${preset.name}_%03d.ts`;
            const playlistPath = path.join(outputDir, playlistName);

            ffmpeg(inputPath)
                .videoCodec('libx264')
                .audioCodec('aac')
                .size(`${preset.width}x${preset.height}`)
                .videoBitrate(preset.bitrate)
                .audioBitrate('128k')
                .format('hls')
                .outputOptions([
                    '-hls_time 10', // 10 second segments
                    '-hls_list_size 0', // Keep all segments in playlist
                    '-hls_flags independent_segments',
                    `-hls_segment_filename ${path.join(outputDir, segmentPattern)}`,
                    '-preset fast',
                    '-crf 23', // Quality setting
                ])
                .output(playlistPath)
                .on('start', (commandLine) => {
                    this.logger.log(`FFmpeg command: ${commandLine}`);
                })
                .on('progress', (progress) => {
                    this.logger.log(`Processing ${preset.name}: ${Math.round(progress.percent || 0)}%`);
                })
                .on('end', () => {
                    // List generated segments
                    const segments = fs.readdirSync(outputDir)
                        .filter(file => file.startsWith(`segment_${preset.name}_`) && file.endsWith('.ts'))
                        .sort();

                    resolve({
                        resolution: `${preset.width}x${preset.height}`,
                        bitrate: preset.bitrate,
                        playlist: playlistPath,
                        segments: segments.map(seg => path.join(outputDir, seg)),
                    });

                    this.logger.log(`✅ ${preset.name} processing completed`);
                })
                .on('error', (err) => {
                    this.logger.error(`FFmpeg error for ${preset.name}: ${err.message}`, err.stack);
                    reject(err);
                })
                .run();
        });
    }

    /**
     * Get video metadata
     */
    private async getVideoMetadata(filePath: string): Promise<{
        width?: number;
        height?: number;
        duration?: number;
    } | null> {
        return new Promise((resolve) => {
            ffmpeg.ffprobe(filePath, (err, metadata) => {
                if (err) {
                    this.logger.error(`FFprobe error: ${err.message}`, err.stack);
                    resolve(null);
                    return;
                }

                try {
                    const videoStream = metadata.streams?.find(stream => stream.codec_type === 'video');
                    resolve({
                        width: videoStream?.width,
                        height: videoStream?.height,
                        duration: metadata.format?.duration,
                    });
                } catch (error) {
                    this.logger.error(`Error parsing metadata: ${error.message}`);
                    resolve(null);
                }
            });
        });
    }

    /**
     * Generate HLS master playlist for adaptive streaming
     */
    private generateMasterPlaylist(qualities: {
        [key: string]: {
            resolution: string;
            bitrate: string;
            playlist: string;
            segments: string[];
        };
    }): string {
        let playlist = '#EXTM3U\n';
        playlist += '#EXT-X-VERSION:3\n\n';

        // Add each quality as a variant stream
        Object.entries(qualities).forEach(([name, quality]) => {
            const [width, height] = quality.resolution.split('x');
            const bandwidth = quality.bitrate.replace('k', '000');

            playlist += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${quality.resolution}\n`;
            playlist += path.basename(quality.playlist) + '\n\n';
        });

        return playlist;
    }

    /**
     * Check if a file is a video file
     */
    isVideoFile(mimetype: string): boolean {
        return mimetype.startsWith('video/');
    }
}
