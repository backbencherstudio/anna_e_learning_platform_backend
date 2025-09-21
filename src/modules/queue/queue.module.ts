import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SeriesPublishProcessor } from './processors/series-publish.processor';
import { SeriesPublishService } from './services/series-publish.service';
import { QuizPublishProcessor } from './processors/quiz-publish.processor';
import { QuizPublishService } from './quiz-publish.service';
import { AssignmentPublishProcessor } from './processors/assignment-publish.processor';
import { AssignmentPublishService } from './assignment-publish.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
    imports: [
        BullModule.registerQueue({
            name: 'series-publish',
        }),
        BullModule.registerQueue({
            name: 'quiz-publish',
        }),
        BullModule.registerQueue({
            name: 'assignment-publish',
        }),
        PrismaModule,
    ],
    providers: [
        SeriesPublishProcessor,
        SeriesPublishService,
        QuizPublishProcessor,
        QuizPublishService,
        AssignmentPublishProcessor,
        AssignmentPublishService,
    ],
    exports: [BullModule, SeriesPublishService, QuizPublishService, AssignmentPublishService],
})
export class QueueModule { }
