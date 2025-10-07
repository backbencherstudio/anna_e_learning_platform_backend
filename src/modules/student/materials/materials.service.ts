import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { SojebStorage } from 'src/common/lib/Disk/SojebStorage';
import appConfig from 'src/config/app.config';
import { MaterialsResponse } from './interfaces/materials-response.interface';

@Injectable()
export class MaterialsService {
    private readonly logger = new Logger(MaterialsService.name);

    constructor(private readonly prisma: PrismaService) { }

    /**
     * Get all enrolled materials for a user with pagination and filtering
     */
    async findAll(
        userId: string,
        page: number = 1,
        limit: number = 10,
        search?: string,
        series_id?: string,
        course_id?: string,
        lecture_type?: string,
    ): Promise<MaterialsResponse<{ materials: any[]; pagination: any }>> {
        try {
            this.logger.log(`Fetching enrolled materials for user: ${userId}`);

            const skip = (page - 1) * limit;

            // Base where clause for enrolled materials
            const enrollmentWhere = {
                user_id: userId,
                status: {in: ['ACTIVE', 'COMPLETED'] as any},
                payment_status: 'completed',
                deleted_at: null,
            };

            // Series filter for enrollment
            const seriesWhere = series_id ? {
                series_id: series_id,
            } : {};

            // Get all enrollments first
            const enrollments = await this.prisma.enrollment.findMany({
                where: {
                    ...enrollmentWhere,
                    ...seriesWhere,
                },
                include: {
                    series: {
                        select: {
                            id: true,
                            title: true,
                            slug: true,
                            materials_files: {
                                where: {
                                    deleted_at: null,
                                    ...(course_id ? { course_id: course_id } : {}),
                                    ...(lecture_type ? { lecture_type: lecture_type } : {}),
                                },
                                select: {
                                    id: true,
                                    title: true,
                                    description: true,
                                    lecture_type: true,
                                    url: true,
                                    type: true,
                                    position: true,
                                    created_at: true,
                                    updated_at: true,
                                    course: {
                                        select: {
                                            id: true,
                                            title: true,
                                        },
                                    },
                                },
                                orderBy: [
                                    { position: 'asc' },
                                    { created_at: 'desc' },
                                ],
                            },
                        },
                    },
                },
                orderBy: { enrolled_at: 'desc' },
            });

            // Extract materials from enrollments
            const allMaterials = enrollments.flatMap(enrollment =>
                enrollment.series.materials_files.map(material => ({
                    ...material,
                    series: {
                        id: enrollment.series.id,
                        title: enrollment.series.title,
                        slug: enrollment.series.slug,
                    },
                    enrollment: {
                        id: enrollment.id,
                        enrolled_at: enrollment.enrolled_at,
                        progress_percentage: enrollment.progress_percentage,
                        last_accessed_at: enrollment.last_accessed_at,
                    },
                }))
            );

            // Apply search filter if provided
            let filteredMaterials = allMaterials;
            if (search) {
                filteredMaterials = allMaterials.filter(material =>
                    material.title.toLowerCase().includes(search.toLowerCase()) ||
                    (material.description && material.description.toLowerCase().includes(search.toLowerCase()))
                );
            }

            // Apply pagination to filtered results
            const total = filteredMaterials.length;
            const materials = filteredMaterials.slice(skip, skip + limit);

            // Add file URLs to all materials
            for (const material of materials) {
                if (material.url) {
                    material['file_url'] = SojebStorage.url(appConfig().storageUrl.materials_file + material.url);
                }
            }

            // Calculate pagination values
            const totalPages = Math.ceil(total / limit);
            const hasNextPage = page < totalPages;
            const hasPreviousPage = page > 1;

            return {
                success: true,
                message: 'Materials retrieved successfully',
                data: {
                    materials,
                    pagination: {
                        total,
                        page,
                        limit,
                        totalPages,
                        hasNextPage,
                        hasPreviousPage,
                    },
                },
            };
        } catch (error) {
            this.logger.error(`Error fetching materials: ${error.message}`, error.stack);
            return {
                success: false,
                message: 'Failed to fetch materials',
                error: error.message,
            };
        }
    }

    /**
     * Get a single enrolled material by ID
     */
    async findOne(userId: string, materialId: string): Promise<MaterialsResponse<any>> {
        try {
            this.logger.log(`Fetching enrolled material ${materialId} for user: ${userId}`);

            // First check if user is enrolled in the series that contains this material
            const enrollment = await this.prisma.enrollment.findFirst({
                where: {
                    user_id: userId,
                    status: 'ACTIVE' as any,
                    payment_status: 'completed',
                    deleted_at: null,
                },
                include: {
                    series: {
                        select: {
                            id: true,
                            title: true,
                            slug: true,
                            materials_files: {
                                where: {
                                    id: materialId,
                                    deleted_at: null,
                                },
                                select: {
                                    id: true,
                                    title: true,
                                    description: true,
                                    url: true,
                                    type: true,
                                    position: true,
                                    created_at: true,
                                    updated_at: true,
                                    course: {
                                        select: {
                                            id: true,
                                            title: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            });

            if (!enrollment || !enrollment.series.materials_files.length) {
                return {
                    success: false,
                    message: 'Material not found or you are not enrolled in this material',
                };
            }

            const material = enrollment.series.materials_files[0];

            // Add series and enrollment information
            const materialWithContext = {
                ...material,
                series: {
                    id: enrollment.series.id,
                    title: enrollment.series.title,
                    slug: enrollment.series.slug,
                },
                enrollment: {
                    id: enrollment.id,
                    enrolled_at: enrollment.enrolled_at,
                    progress_percentage: enrollment.progress_percentage,
                    last_accessed_at: enrollment.last_accessed_at,
                },
            };

            // Add file URL
            if (materialWithContext.url) {
                materialWithContext['file_url'] = SojebStorage.url(appConfig().storageUrl.materials_file + materialWithContext.url);
            }

            return {
                success: true,
                message: 'Material retrieved successfully',
                data: materialWithContext,
            };
        } catch (error) {
            this.logger.error(`Error fetching material ${materialId}: ${error.message}`, error.stack);
            return {
                success: false,
                message: 'Failed to fetch material',
                error: error.message,
            };
        }
    }
}
