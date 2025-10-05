import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SeriesPublishProcessor } from './processors/series-publish.processor';
import { SeriesPublishService } from './services/series-publish.service';
import { QuizPublishProcessor } from './processors/quiz-publish.processor';
import { QuizPublishService } from './services/quiz-publish.service';
import { AssignmentPublishProcessor } from './processors/assignment-publish.processor';
import { AssignmentPublishService } from './services/assignment-publish.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { TeacherSectionPublishService } from './teacher-section-publish.service';
import { TeacherSectionPublishProcessor } from './processors/teacher-section-publish.processor';

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
        BullModule.registerQueue({
            name: 'teacher-section-publish',
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
        TeacherSectionPublishProcessor,
        TeacherSectionPublishService,
    ],
    exports: [
        BullModule,
        SeriesPublishService,
        QuizPublishService,
        AssignmentPublishService,
        TeacherSectionPublishProcessor,
        TeacherSectionPublishService,
    ],
})
export class QueueModule { }
