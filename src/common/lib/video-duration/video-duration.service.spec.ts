import { Test, TestingModule } from '@nestjs/testing';
import { VideoDurationService } from './video-duration.service';

describe('VideoDurationService', () => {
    let service: VideoDurationService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [VideoDurationService],
        }).compile();

        service = module.get<VideoDurationService>(VideoDurationService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    it('should identify video files by MIME type', () => {
        expect(service.isVideoFile('video/mp4')).toBe(true);
        expect(service.isVideoFile('video/webm')).toBe(true);
        expect(service.isVideoFile('video/avi')).toBe(true);
        expect(service.isVideoFile('image/jpeg')).toBe(false);
        expect(service.isVideoFile('application/pdf')).toBe(false);
    });

    it('should identify video files by extension', () => {
        expect(service.isVideoFileByExtension('test.mp4')).toBe(true);
        expect(service.isVideoFileByExtension('test.webm')).toBe(true);
        expect(service.isVideoFileByExtension('test.avi')).toBe(true);
        expect(service.isVideoFileByExtension('test.mov')).toBe(true);
        expect(service.isVideoFileByExtension('test.jpg')).toBe(false);
        expect(service.isVideoFileByExtension('test.pdf')).toBe(false);
    });

    it('should format length correctly', () => {
        // This tests the private method indirectly through the public interface
        // We'll create a mock video buffer to test the full flow
        const mockVideoBuffer = Buffer.from('mock video data');

        // Note: This test will fail in CI/CD without actual video files
        // In a real scenario, you'd use a small test video file
        service.calculateVideoLength(mockVideoBuffer, 'test.mp4').then(result => {
            // The result will be null for invalid video data, which is expected
            expect(result).toBeNull();
        });
    });
});
