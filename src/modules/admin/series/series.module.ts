import { Module } from '@nestjs/common';
import { SeriesService } from './series.service';
import { SeriesController } from './series.controller';
import { ChunkedUploadService } from '../../../common/lib/upload/ChunkedUploadService';
import { BackgroundUploadService } from '../../../common/lib/upload/BackgroundUploadService';

@Module({
  controllers: [SeriesController],
  providers: [SeriesService, ChunkedUploadService, BackgroundUploadService],
  exports: [SeriesService, ChunkedUploadService, BackgroundUploadService],
})
export class SeriesModule { }
