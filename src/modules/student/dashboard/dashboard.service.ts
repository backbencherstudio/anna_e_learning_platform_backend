import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { SojebStorage } from 'src/common/lib/Disk/SojebStorage';
import appConfig from 'src/config/app.config';
import { SeriesService } from '../series/series.service';
import { ScheduleEventService } from '../schedule-event/schedule-event.service';

@Injectable()
export class DashboardService {
    private readonly logger = new Logger(DashboardService.name);
    constructor(
        private readonly prisma: PrismaService,
        private readonly seriesService: SeriesService,
        private readonly scheduleEventService: ScheduleEventService
    ) { }

    async TeacherSection() {
        try {
            // Fetch all published teacher sections
            const sections = await this.prisma.teacherSection.findMany({
                where: {
                    deleted_at: null,
                    status: "published"
                },
                orderBy: [
                    { position: 'asc' },
                    { created_at: 'desc' }
                ]
            });

            // Group sections by section_type
            const groupedSections = {
                scripture: sections.filter(section => section.section_type === 'SCRIPTURE'),
                announcement: sections.filter(section => section.section_type === 'ANNOUNCEMENT'),
                encouragement: sections.filter(section => section.section_type === 'ENCOURAGEMENT')
            };

            // Add file URLs to each section
            for (const sectionType of Object.keys(groupedSections)) {
                for (const section of groupedSections[sectionType]) {
                    if (section.file_url) {
                        (section as any).file_url = SojebStorage.url(
                            appConfig().storageUrl.teacher_section_file + section.file_url
                        );
                    }
                }
            }

            return {
                success: true,
                message: 'Teacher sections retrieved successfully',
                data: groupedSections
            };
        }
        catch (error) {
            this.logger.error('Error fetching teacher sections:', error);
            return {
                success: false,
                message: 'Failed to fetch teacher sections',
                error: error.message,
                data: {
                    scripture: [],
                    announcement: [],
                    encouragement: []
                }
            };
        }
    }

    async getDashboard(userId: string) {
        try {
            const date = new Date();
            const teacherSections = await this.TeacherSection();
            const enrolledSeries = await this.seriesService.getEnrolledSeries(userId);
            const scheduleEvents = await this.scheduleEventService.listForEnrolledSeries(userId, date);

            return {
                success: true,
                message: 'Dashboard retrieved successfully',
                data: {
                    teacher_sections: teacherSections.data,
                    enrolled_series: enrolledSeries.data.series,
                    today: new Date(),
                    schedule_events: scheduleEvents.data.events
                }
            };
        }
        catch (error) {
            this.logger.error('Error fetching dashboard:', error);
            return {
                success: false,
                message: 'Failed to fetch dashboard',
                error: error.message,
                data: {
                    teacher_sections: {
                        scripture: [],
                        announcement: [],
                        encouragement: []
                    },
                    enrolled_series: [],
                    schedule_events: { events: [] }
                }
            };
        }
    }
}
