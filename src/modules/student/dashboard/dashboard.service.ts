import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { SojebStorage } from 'src/common/lib/Disk/SojebStorage';
import appConfig from 'src/config/app.config';
import { SeriesService } from '../series/series.service';
import { ScheduleEventService } from '../schedule-event/schedule-event.service';
import { MaterialsService } from '../materials/materials.service';

@Injectable()
export class DashboardService {
    private readonly logger = new Logger(DashboardService.name);
    constructor(
        private readonly prisma: PrismaService,
        private readonly seriesService: SeriesService,
        private readonly scheduleEventService: ScheduleEventService,
        private readonly materialsService: MaterialsService
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

            // Group sections by section_type and limit to 3 items each
            const groupedSections = {
                scripture: sections.filter(section => section.section_type === 'SCRIPTURE').slice(0, 3),
                announcement: sections.filter(section => section.section_type === 'ANNOUNCEMENT').slice(0, 3),
                encouragement: sections.filter(section => section.section_type === 'ENCOURAGEMENT').slice(0, 3)
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
            const enrolledSeries = await this.seriesService.getEnrolledSeries(userId, 1, 1); // Limit to 1 series
            const scheduleEvents = await this.scheduleEventService.listForEnrolledSeries(userId, date);
            const materials = await this.materialsService.findAll(userId, 1, 3);

            return {
                success: true,
                message: 'Dashboard retrieved successfully',
                data: {
                    teacher_sections: teacherSections.data,
                    enrolled_series: enrolledSeries.data.series,
                    today: new Date(),
                    schedule_events: scheduleEvents.data.events,
                    materials: materials.data.materials
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
