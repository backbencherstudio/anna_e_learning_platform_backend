import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class TeacherSectionPublishService {
    private readonly logger = new Logger(TeacherSectionPublishService.name);

    constructor(
        @InjectQueue('teacher-section-publish') private queue: Queue,
    ) { }

    async scheduleRelease(sectionId: string, releaseAt: Date): Promise<void> {
        const delay = releaseAt.getTime() - Date.now();
        if (delay <= 0) throw new Error('Release time must be in the future');
        await this.queue.add(
            'release-teacher-section',
            { sectionId },
            {
                delay,
                jobId: `teacher-section-release-${sectionId}`,
                removeOnComplete: 10,
                removeOnFail: 50,
            },
        );
    }

    async cancelScheduledRelease(sectionId: string): Promise<void> {
        const jobId = `teacher-section-release-${sectionId}`;
        const job = await this.queue.getJob(jobId);
        if (job) await job.remove();
    }
}


