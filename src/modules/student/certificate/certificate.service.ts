import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class CertificateService {
    private readonly logger = new Logger(CertificateService.name);
    constructor(private readonly prisma: PrismaService) { }

    async getCourseProgress(userId: string) {
        try {
            this.logger.log(`Fetching course progress data for user: ${userId}`);

            // Get all completed enrollments for the user
            const enrollments = await this.prisma.enrollment.findMany({
                where: {
                    user_id: userId,
                    status: 'COMPLETED' as any,
                    deleted_at: null
                },
                include: {
                    series: {
                        select: {
                            id: true,
                            title: true,
                            start_date: true,
                            end_date: true,
                            courses: {
                                select: {
                                    id: true,
                                    title: true,
                                    created_at: true,
                                    course_progress: {
                                        where: {
                                            user_id: userId,
                                            deleted_at: null
                                        },
                                        select: {
                                            id: true,
                                            status: true,
                                            completion_percentage: true,
                                            is_completed: true,
                                            started_at: true,
                                            completed_at: true,
                                            created_at: true,
                                            updated_at: true
                                        }
                                    }
                                },
                                orderBy: {
                                    created_at: 'asc'
                                }
                            }
                        }
                    }
                }
            });

            if (!enrollments.length) {
                throw new NotFoundException('No completed enrollments found');
            }

            // Transform data to include all required fields
            const seriesData = enrollments.map(enrollment => {
                const series = enrollment.series;

                // Get course progress data for each course
                const coursesWithProgress = series.courses.map(course => {
                    const courseProgress = course.course_progress[0]; // Get the user's progress for this course

                    return {
                        course_id: course.id,
                        course_title: course.title,
                        course_start_date: course.created_at,
                        course_completion_date: courseProgress?.completed_at || null,
                        course_status: courseProgress?.status || 'pending',
                        completion_percentage: courseProgress?.completion_percentage || 0,
                        is_completed: courseProgress?.is_completed || false,
                        progress_started_at: courseProgress?.started_at || null,
                        progress_created_at: courseProgress?.created_at || null,
                        progress_updated_at: courseProgress?.updated_at || null,
                        series: {
                            series_id: series.id,
                            title: series.title,
                            start_date: series.start_date,
                            end_date: series.end_date
                        }
                    };
                });

                // Calculate overall series progress
                const totalCourses = series.courses.length;
                const completedCourses = series.courses.filter(course =>
                    course.course_progress[0]?.is_completed
                ).length;
                const seriesCompletionPercentage = totalCourses > 0 ? Math.round((completedCourses / totalCourses) * 100) : 0;

                return {
                    series_id: series.id,
                    series_title: series.title,
                    series_start_date: series.start_date,
                    series_end_date: series.end_date,
                    enrollment_completed_at: enrollment.completed_at,
                    total_courses: totalCourses,
                    completed_courses: completedCourses,
                    series_completion_percentage: seriesCompletionPercentage,
                    courses: coursesWithProgress
                };
            });

            // Flatten all courses from all series into a single array
            const allCourses = seriesData.flatMap(series => series.courses);

            return {
                success: true,
                message: 'Course progress data retrieved successfully',
                data: {
                    total_series: seriesData.length,
                    total_courses: allCourses.length,
                    courses: allCourses
                }
            };
        } catch (error) {
            this.logger.error(`Failed to get series course progress: ${error.message}`, error.stack);
            return {
                success: false,
                message: 'Failed to fetch series course progress',
                error: error.message
            };
        }
    }

    async getCertificateData(userId: string, courseId: string) {
        try {
            this.logger.log(`Getting certificate data for user ${userId} and course ${courseId}`);

            // Get user details
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
                select: {
                    id: true,
                    name: true,
                    email: true
                }
            });

            if (!user) {
                throw new NotFoundException('User not found');
            }

            // Get course details with series and progress
            const course = await this.prisma.course.findFirst({
                where: {
                    id: courseId,
                    deleted_at: null
                },
                include: {
                    series: {
                        select: {
                            id: true,
                            title: true,
                            start_date: true,
                            end_date: true
                        }
                    },
                    course_progress: {
                        where: {
                            user_id: userId,
                            deleted_at: null
                        },
                        select: {
                            id: true,
                            status: true,
                            completion_percentage: true,
                            is_completed: true,
                            completed_at: true
                        }
                    }
                }
            });

            if (!course) {
                throw new NotFoundException('Course not found');
            }

            const courseProgress = course.course_progress[0];
            if (!courseProgress || !courseProgress.is_completed) {
                throw new NotFoundException('Course not completed yet');
            }

            // Generate certificate data
            const certificateData = {
                lms_name: 'The White Eagles Academy',
                student_name: user.name,
                student_email: user.email,
                course_title: course.title,
                series_title: course.series.title,
                course_id: course.id,
                series_id: course.series.id,
                completion_date: courseProgress.completed_at,
                completion_percentage: courseProgress.completion_percentage,
                status: courseProgress.status,
                certificate_id: `${course.id}_${user.id}_${new Date().getTime()}`,
                generated_at: new Date(),
                series_start_date: course.series.start_date,
                series_end_date: course.series.end_date
            };

            this.logger.log(`Certificate data retrieved successfully for user ${userId} and course ${courseId}`);

            return {
                success: true,
                message: 'Certificate data retrieved successfully',
                data: certificateData
            };
        } catch (error) {
            this.logger.error(`Failed to get certificate data: ${error.message}`, error.stack);
            return {
                success: false,
                message: 'Failed to get certificate data',
                error: error.message
            };
        }
    }

    async getDiplomaData(userId: string, seriesId: string) {
        try {
            this.logger.log(`Getting diploma data for user ${userId} and series ${seriesId}`);

            // Get user details
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
                select: {
                    id: true,
                    name: true,
                    email: true
                }
            });

            if (!user) {
                throw new NotFoundException('User not found');
            }

            // Get series details with enrollment and course progress
            const series = await this.prisma.series.findFirst({
                where: {
                    id: seriesId,
                    deleted_at: null
                },
                include: {
                    enrollments: {
                        where: {
                            user_id: userId,
                            status: 'COMPLETED' as any,
                            deleted_at: null
                        },
                        select: {
                            id: true,
                            enrolled_at: true,
                            completed_at: true,
                            progress_percentage: true
                        }
                    },
                    courses: {
                        where: {
                            deleted_at: null
                        },
                        select: {
                            id: true,
                            title: true,
                            course_progress: {
                                where: {
                                    user_id: userId,
                                    deleted_at: null
                                },
                                select: {
                                    id: true,
                                    status: true,
                                    completion_percentage: true,
                                    is_completed: true,
                                    completed_at: true
                                }
                            }
                        },
                        orderBy: {
                            created_at: 'asc'
                        }
                    }
                }
            });

            if (!series) {
                throw new NotFoundException('Series not found');
            }

            const enrollment = series.enrollments[0];
            if (!enrollment) {
                throw new NotFoundException('Series not completed yet');
            }

            // Check if all courses are completed
            const totalCourses = series.courses.length;
            const completedCourses = series.courses.filter(course =>
                course.course_progress[0]?.is_completed
            ).length;

            if (completedCourses !== totalCourses) {
                throw new NotFoundException('All courses in the series must be completed to receive a diploma');
            }

            // Calculate series completion details
            const totalCompletionPercentage = series.courses.reduce((sum, course) => {
                return sum + (course.course_progress[0]?.completion_percentage || 0);
            }, 0) / totalCourses;

            const completedCoursesData = series.courses.map(course => ({
                course_id: course.id,
                course_title: course.title,
                completion_date: course.course_progress[0]?.completed_at,
                completion_percentage: course.course_progress[0]?.completion_percentage || 0
            }));

            // Generate diploma data
            const diplomaData = {
                lms_name: 'The White Eagles Academy',
                student_name: user.name,
                student_email: user.email,
                series_title: series.title,
                series_id: series.id,
                enrollment_id: enrollment.id,
                enrolled_at: enrollment.enrolled_at,
                completed_at: enrollment.completed_at,
                series_start_date: series.start_date,
                series_end_date: series.end_date,
                total_courses: totalCourses,
                completed_courses: completedCourses,
                overall_completion_percentage: Math.round(totalCompletionPercentage),
                courses: completedCoursesData,
                diploma_id: `DIPLOMA_${series.id}_${user.id}_${new Date().getTime()}`,
                generated_at: new Date(),
                achievement_type: 'Diploma',
                program_duration: this.calculateProgramDuration(series.start_date, series.end_date)
            };

            this.logger.log(`Diploma data retrieved successfully for user ${userId} and series ${seriesId}`);

            return {
                success: true,
                message: 'Diploma data retrieved successfully',
                data: diplomaData
            };
        } catch (error) {
            this.logger.error(`Failed to get diploma data: ${error.message}`, error.stack);
            return {
                success: false,
                message: 'Failed to get diploma data',
                error: error.message
            };
        }
    }

    private calculateProgramDuration(startDate: Date | null, endDate: Date | null): string {
        if (!startDate || !endDate) return 'N/A';

        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 30) {
            return `${diffDays} days`;
        } else if (diffDays < 365) {
            const months = Math.round(diffDays / 30);
            return `${months} month${months > 1 ? 's' : ''}`;
        } else {
            const years = Math.round(diffDays / 365);
            return `${years} year${years > 1 ? 's' : ''}`;
        }
    }

}
