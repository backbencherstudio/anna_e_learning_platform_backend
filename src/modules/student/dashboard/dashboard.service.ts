import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { SojebStorage } from 'src/common/lib/Disk/SojebStorage';
import appConfig from 'src/config/app.config';
import { SeriesService } from '../series/series.service';

@Injectable()
export class DashboardService {
    private readonly logger = new Logger(DashboardService.name);
    constructor(private readonly prisma: PrismaService, private readonly seriesService: SeriesService) { }

    async TeacherSection() {
        try {
            // Fetch all published teacher sections
            const sections = await this.prisma.teacherSection.findMany({
                where: {
                    deleted_at: null,
                    status: 'published'
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

    async getEnrolledSeries(userId: string) {
        try {
            this.logger.log(`Fetching enrolled series for user: ${userId}`);

            // Base where clause for enrolled series with completed payment
            const enrollmentWhere = {
                user_id: userId,
                status: 'ACTIVE' as any,
                payment_status: 'completed',
                //visibility: 'published',
                deleted_at: null,
            };


            // Get all enrollments first (no pagination at DB level when search is used)
            const enrollments = await this.prisma.enrollment.findMany({
                where: enrollmentWhere,
                include: {
                    series: {
                        select: {
                            id: true,
                            title: true,
                            description: true,
                            video_length: true,
                            duration: true,
                            thumbnail: true,
                            course_type: true,
                            note: true,
                            available_site: true,
                            language: {
                                select: {
                                    id: true,
                                    name: true,
                                    code: true,
                                },
                            },
                            courses: {
                                select: {
                                    id: true,
                                    title: true,
                                    position: true,
                                    video_length: true,
                                    intro_video_url: true,
                                    end_video_url: true,
                                    lesson_files: {
                                        select: {
                                            id: true,
                                            title: true,
                                            url: true,
                                            kind: true,
                                            alt: true,
                                            position: true,
                                            video_length: true,
                                            is_locked: true,
                                        },
                                        orderBy: { position: 'asc' },
                                    },
                                },
                                orderBy: { position: 'asc' },
                            },
                            _count: {
                                select: {
                                    courses: true,
                                    quizzes: true,
                                    assignments: true,
                                },
                            },
                        },
                    },
                },
                orderBy: { enrolled_at: 'desc' },
            });

            // Extract series from enrollments
            const series = enrollments.map(enrollment => enrollment.series).filter(Boolean);

            // Add file URLs and lesson progress to all series
            for (const seriesItem of series) {
                if (seriesItem.thumbnail) {
                    seriesItem['thumbnail_url'] = SojebStorage.url(appConfig().storageUrl.series_thumbnail + seriesItem.thumbnail);
                }

                // Calculate total lesson files count
                const totalLessonFiles = seriesItem.courses?.reduce((total, course) => {
                    return total + (course.lesson_files?.length || 0);
                }, 0) || 0;
                (seriesItem._count as any).lesson_files = totalLessonFiles;

                if (seriesItem.courses && seriesItem.courses.length > 0) {
                    for (const course of seriesItem.courses) {
                        if (course.lesson_files && course.lesson_files.length > 0) {
                            // Get lesson progress for this user and course
                            const lessonProgress = await this.seriesService.getLessonProgressForCourse(userId, course.id);

                            for (const lessonFile of course.lesson_files) {
                                if (lessonFile.url) {
                                    lessonFile['file_url'] = SojebStorage.url(appConfig().storageUrl.lesson_file + lessonFile.url);
                                }

                                // Check if lesson is unlocked for this user
                                const progress = lessonProgress.find(p => p.lesson_id === lessonFile.id);
                                lessonFile['is_unlocked'] = await this.seriesService.isLessonUnlocked(userId, lessonFile.id, course.lesson_files, lessonProgress);
                                lessonFile['progress'] = progress || null;
                            }
                        }
                        if (course.intro_video_url) {
                            course['intro_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + course.intro_video_url);
                        }
                        if (course.end_video_url) {
                            course['end_video_url'] = SojebStorage.url(appConfig().storageUrl.module_file + course.end_video_url);
                        }
                    }
                }
            }

            return {
                success: true,
                message: 'Enrolled series retrieved successfully',
                data: series
            };
        } catch (error) {
            this.logger.error(`Error fetching enrolled series: ${error.message}`, error.stack);

            return {
                success: false,
                message: 'Failed to fetch enrolled series',
                error: error.message,
            };
        }
    }

    async getDashboard(userId: string) {
        try {
            const teacherSections = await this.TeacherSection();
            const enrolledSeries = await this.getEnrolledSeries(userId);

            return {
                success: true,
                message: 'Dashboard retrieved successfully',
                data: {
                    teacher_sections: teacherSections.data,
                    enrolled_series: enrolledSeries.data
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
                    }
                }
            };
        }
    }
}
