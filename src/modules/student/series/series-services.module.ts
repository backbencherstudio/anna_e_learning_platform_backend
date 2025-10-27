import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { VideoProgressService } from './services/video-progress.service';
import { LessonUnlockService } from './services/lesson-unlock.service';
import { CourseProgressService } from './services/course-progress.service';
import { LessonProgressService } from './services/lesson-progress.service';

@Module({
    imports: [PrismaModule],
    providers: [
        VideoProgressService,
        LessonUnlockService,
        CourseProgressService,
        LessonProgressService,
    ],
    exports: [
        VideoProgressService,
        LessonUnlockService,
        CourseProgressService,
        LessonProgressService,
    ],
})
export class SeriesServicesModule { }
