import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SeriesPublishProcessor } from './processors/series-publish.processor';
import { SeriesPublishService } from './services/series-publish.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
    imports: [
        BullModule.registerQueue({
            name: 'series-publish',
        }),
        PrismaModule,
    ],
    providers: [SeriesPublishProcessor, SeriesPublishService],
    exports: [BullModule, SeriesPublishService],
})
export class QueueModule { }
