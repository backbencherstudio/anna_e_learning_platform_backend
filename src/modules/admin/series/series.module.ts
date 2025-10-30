import { Module } from '@nestjs/common';
import { SeriesService } from './series.service';
import { SeriesController } from './series.controller';
import { VideoDurationService } from '../../../common/lib/video-duration/video-duration.service';
import { QueueModule } from '../../queue/queue.module';

@Module({
  imports: [QueueModule],
  controllers: [SeriesController],
  providers: [SeriesService, VideoDurationService],
  exports: [SeriesService, VideoDurationService],
})
export class SeriesModule { }
