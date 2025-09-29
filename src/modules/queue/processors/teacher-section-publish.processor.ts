import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';

@Processor('teacher-section-publish')
@Injectable()
export class TeacherSectionPublishProcessor extends WorkerHost {
    private readonly logger = new Logger(TeacherSectionPublishProcessor.name);

    constructor(private readonly prisma: PrismaService) {
        super();
    }

    async process(job: Job<any>): Promise<any> {
        switch (job.name) {
            case 'release-teacher-section':
                return this.release(job.data.sectionId);
            default:
                this.logger.warn(`Unknown job: ${job.name}`);
                return;
        }
    }

    private async release(sectionId: string) {
        try {
            const section = await this.prisma.teacherSection.findUnique({
                where: { id: sectionId },
                select: {
                    id: true,
                    release_status: true,
                    scheduled_release_at: true,
                },
            });

            if (!section) return;
            if (section.release_status !== 'SCHEDULED') return;
            if (section.scheduled_release_at && section.scheduled_release_at > new Date()) return;

            await this.prisma.teacherSection.update({
                where: { id: sectionId },
                data: {
                    is_released: true,
                    status: 'published',
                    release_status: 'PUBLISHED',
                    scheduled_release_at: null,
                },
            });
        } catch (e) {
            this.logger.error(`Failed to release teacher section ${sectionId}: ${e.message}`);
            throw e;
        }
    }
}


