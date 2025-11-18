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
import { VideoDurationProcessor } from './processors/video-duration.processor';
import { VideoDurationService } from './services/video-duration.service';
import { VideoDurationService as VideoDurationCalculationService } from '../../common/lib/video-duration/video-duration.service';

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
        BullModule.registerQueue({
            name: 'video-duration',
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
        VideoDurationProcessor,
        VideoDurationService,
        VideoDurationCalculationService,
    ],
    exports: [
        BullModule,
        SeriesPublishService,
        QuizPublishService,
        AssignmentPublishService,
        TeacherSectionPublishProcessor,
        TeacherSectionPublishService,
        VideoDurationService,
    ],
})
export class QueueModule { }
