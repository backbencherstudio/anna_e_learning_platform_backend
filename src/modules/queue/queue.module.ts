import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SeriesPublishProcessor } from './processors/series-publish.processor';
import { SeriesPublishService } from './services/series-publish.service';
import { QuizPublishProcessor } from './processors/quiz-publish.processor';
import { QuizPublishService } from './services/quiz-publish.service';
import { AssignmentPublishProcessor } from './processors/assignment-publish.processor';
import { AssignmentPublishService } from './services/assignment-publish.service';
import { ChunkUploadProcessor } from './processors/chunk-upload.processor';
import { ChunkUploadQueueService } from './services/chunk-upload.service';
import { ChunkedUploadService } from '../../common/lib/ChunkedUpload/chunked-upload.service';
import { ChunkUploadGateway } from '../../common/lib/ChunkedUpload/chunk-upload.gateway';
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
        BullModule.registerQueue({
            name: 'chunk-upload',
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
        ChunkUploadProcessor,
        ChunkUploadQueueService,
        ChunkedUploadService,
        ChunkUploadGateway,
        TeacherSectionPublishProcessor,
        TeacherSectionPublishService,
    ],
    exports: [
        BullModule,
        SeriesPublishService,
        QuizPublishService,
        AssignmentPublishService,
        ChunkUploadQueueService,
        ChunkedUploadService,
        ChunkUploadGateway,
        TeacherSectionPublishProcessor,
        TeacherSectionPublishService,
    ],
})
export class QueueModule { }
