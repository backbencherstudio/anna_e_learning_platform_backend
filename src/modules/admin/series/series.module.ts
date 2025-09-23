import { Module } from '@nestjs/common';
import { SeriesService } from './series.service';
import { SeriesController } from './series.controller';
import { ChunkedUploadService } from '../../../common/lib/upload/ChunkedUploadService';
import { BackgroundUploadService } from '../../../common/lib/upload/BackgroundUploadService';
import { VideoDurationService } from '../../../common/lib/video-duration/video-duration.service';
import { QueueModule } from '../../queue/queue.module';

@Module({
  imports: [QueueModule],
  controllers: [SeriesController],
  providers: [SeriesService, ChunkedUploadService, BackgroundUploadService, VideoDurationService],
  exports: [SeriesService, ChunkedUploadService, BackgroundUploadService, VideoDurationService],
})
export class SeriesModule { }
