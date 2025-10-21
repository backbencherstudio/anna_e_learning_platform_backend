import { Module } from '@nestjs/common';
import { SeriesService } from './series.service.refactored';
import { SeriesController } from './series.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { SeriesServicesModule } from './series-services.module';

@Module({
  imports: [PrismaModule, SeriesServicesModule],
  controllers: [SeriesController],
  providers: [SeriesService],
  exports: [SeriesService],
})
export class SeriesModule { }
