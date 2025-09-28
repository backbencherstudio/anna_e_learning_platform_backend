import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { MaterialsResponse } from './interfaces/materials-response.interface';
import { MaterialsFile } from '@prisma/client';
import { SojebStorage } from '../../../common/lib/Disk/SojebStorage';
import appConfig from '../../../config/app.config';
import { StringHelper } from '../../../common/helper/string.helper';

@Injectable()
export class MaterialsService {
  private readonly logger = new Logger(MaterialsService.name);

  constructor(private readonly prisma: PrismaService) { }

  async getAllSeries() {
    return this.prisma.series.findMany({
      where: {
        deleted_at: null,
      },
    });
  }
  async getAllCourses(series_id?: string) {
    return this.prisma.course.findMany({
      where: {
        deleted_at: null,
        series_id: series_id,
      },
    });
  }

  /**
   * Create a new material with optional file upload
   */
  async create(createMaterialDto: CreateMaterialDto, file?: Express.Multer.File): Promise<MaterialsResponse<MaterialsFile>> {
    try {
      this.logger.log('Creating new material');

      // Validate that either series_id or course_id is provided
      if (!createMaterialDto.series_id && !createMaterialDto.course_id) {
        throw new BadRequestException('Either series_id or course_id must be provided');
      }

      // If both are provided, validate they exist
      if (createMaterialDto.series_id && createMaterialDto.course_id) {
        const [series, course] = await Promise.all([
          this.prisma.series.findUnique({ where: { id: createMaterialDto.series_id } }),
          this.prisma.course.findUnique({ where: { id: createMaterialDto.course_id } }),
        ]);

        if (!series) {
          throw new BadRequestException('Series not found');
        }
        if (!course) {
          throw new BadRequestException('Course not found');
        }
      } else if (createMaterialDto.series_id) {
        const series = await this.prisma.series.findUnique({ where: { id: createMaterialDto.series_id } });
        if (!series) {
          throw new BadRequestException('Series not found');
        }
      } else if (createMaterialDto.course_id) {
        const course = await this.prisma.course.findUnique({ where: { id: createMaterialDto.course_id } });
        if (!course) {
          throw new BadRequestException('Course not found');
        }
      }

      // Handle file upload if provided
      let fileUrl: string | undefined;
      if (file) {
        const fileName = StringHelper.generateRandomFileName(file.originalname);
        await SojebStorage.put(appConfig().storageUrl.materials_file + fileName, file.buffer);
        fileUrl = fileName;
        this.logger.log(`Uploaded material file: ${fileName}`);
      } else if (createMaterialDto.url) {
        fileUrl = createMaterialDto.url;
      }

      const material = await this.prisma.materialsFile.create({
        data: {
          title: createMaterialDto.title,
          description: createMaterialDto.description,
          lecture_type: createMaterialDto.lecture_type,
          url: fileUrl,
          type: createMaterialDto.type,
          position: createMaterialDto.position || 0,
          series_id: createMaterialDto.series_id,
          course_id: createMaterialDto.course_id,
        },
        include: {
          series: {
            select: {
              id: true,
              title: true,
            },
          },
          course: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      });

      // Add file URL to response
      if (material.url) {
        material['file_url'] = SojebStorage.url(appConfig().storageUrl.materials_file + material.url);
      }

      return {
        success: true,
        message: 'Material created successfully',
        data: material,
      };
    } catch (error) {
      this.logger.error(`Error creating material: ${error.message}`, error.stack);
      return {
        success: false,
        message: 'Failed to create material',
        error: error.message,
      };
    }
  }

  /**
   * Get all materials with pagination and filtering
   */
  async findAll(
    page: number = 1,
    limit: number = 10,
    search?: string,
    series_id?: string,
    course_id?: string,
    type?: string,
    lecture_type?: string,
  ): Promise<MaterialsResponse<{ materials: any[]; pagination: any }>> {
    try {
      this.logger.log('Fetching all materials');

      const skip = (page - 1) * limit;
      const where: any = {
        deleted_at: null,
      };

      // Add search filter
      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' as any } },
          { description: { contains: search, mode: 'insensitive' as any } },
        ];
      }

      // Add series filter
      if (series_id) {
        where.series_id = series_id;
      }

      // Add course filter
      if (course_id) {
        where.course_id = course_id;
      }

      // Add type filter
      if (type) {
        where.type = type;
      }

      // Add lecture type filter
      if (lecture_type) {
        where.lecture_type = lecture_type;
      }

      const [materials, total] = await Promise.all([
        this.prisma.materialsFile.findMany({
          where,
          skip,
          take: limit,
          include: {
            series: {
              select: {
                id: true,
                title: true,
              },
            },
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
        }),
        this.prisma.materialsFile.count({ where }),
      ]);

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
   * Get a single material by ID
   */
  async findOne(id: string): Promise<MaterialsResponse<MaterialsFile>> {
    try {
      this.logger.log(`Fetching material with ID: ${id}`);

      const material = await this.prisma.materialsFile.findFirst({
        where: {
          id,
          deleted_at: null,
        },
        include: {
          series: {
            select: {
              id: true,
              title: true,
            },
          },
          course: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      });

      if (!material) {
        throw new NotFoundException('Material not found');
      }

      // Add file URL to response
      if (material.url) {
        material['file_url'] = SojebStorage.url(appConfig().storageUrl.materials_file + material.url);
      }

      return {
        success: true,
        message: 'Material retrieved successfully',
        data: material,
      };
    } catch (error) {
      this.logger.error(`Error fetching material: ${error.message}`, error.stack);
      return {
        success: false,
        message: 'Failed to fetch material',
        error: error.message,
      };
    }
  }

  /**
   * Update a material with optional file upload
   */
  async update(id: string, updateMaterialDto: UpdateMaterialDto, file?: Express.Multer.File): Promise<MaterialsResponse<MaterialsFile>> {
    try {
      this.logger.log(`Updating material with ID: ${id}`);

      // Check if material exists
      const existingMaterial = await this.prisma.materialsFile.findFirst({
        where: {
          id,
          deleted_at: null,
        },
      });

      if (!existingMaterial) {
        throw new NotFoundException('Material not found');
      }

      // Validate series_id or course_id if provided
      if (updateMaterialDto.series_id) {
        const series = await this.prisma.series.findUnique({ where: { id: updateMaterialDto.series_id } });
        if (!series) {
          throw new BadRequestException('Series not found');
        }
      }

      if (updateMaterialDto.course_id) {
        const course = await this.prisma.course.findUnique({ where: { id: updateMaterialDto.course_id } });
        if (!course) {
          throw new BadRequestException('Course not found');
        }
      }

      // Handle file upload if provided
      let fileUrl = updateMaterialDto.url;
      if (file) {
        const fileName = StringHelper.generateRandomFileName(file.originalname);
        await SojebStorage.put(appConfig().storageUrl.materials_file + fileName, file.buffer);
        fileUrl = fileName;
        this.logger.log(`Uploaded updated material file: ${fileName}`);
      }

      const material = await this.prisma.materialsFile.update({
        where: { id },
        data: {
          ...updateMaterialDto,
          url: fileUrl,
          updated_at: new Date(),
        },
        include: {
          series: {
            select: {
              id: true,
              title: true,
            },
          },
          course: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      });

      // Add file URL to response
      if (material.url) {
        material['file_url'] = SojebStorage.url(appConfig().storageUrl.materials_file + material.url);
      }

      return {
        success: true,
        message: 'Material updated successfully',
        data: material,
      };
    } catch (error) {
      this.logger.error(`Error updating material: ${error.message}`, error.stack);
      return {
        success: false,
        message: 'Failed to update material',
        error: error.message,
      };
    }
  }

  /**
   * Soft delete a material
   */
  async remove(id: string): Promise<MaterialsResponse<null>> {
    try {
      this.logger.log(`Deleting material with ID: ${id}`);

      // Check if material exists
      const existingMaterial = await this.prisma.materialsFile.findFirst({
        where: {
          id,
          deleted_at: null,
        },
      });

      if (!existingMaterial) {
        throw new NotFoundException('Material not found');
      }

      await this.prisma.materialsFile.update({
        where: { id },
        data: {
          deleted_at: new Date(),
        },
      });

      return {
        success: true,
        message: 'Material deleted successfully',
        data: null,
      };
    } catch (error) {
      this.logger.error(`Error deleting material: ${error.message}`, error.stack);
      return {
        success: false,
        message: 'Failed to delete material',
        error: error.message,
      };
    }
  }

  /**
   * Get materials by series ID
   */
  async findBySeries(series_id: string): Promise<MaterialsResponse<MaterialsFile[]>> {
    try {
      this.logger.log(`Fetching materials for series: ${series_id}`);

      const materials = await this.prisma.materialsFile.findMany({
        where: {
          series_id,
          deleted_at: null,
        },
        include: {
          series: {
            select: {
              id: true,
              title: true,
            },
          },
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
      });

      // Add file URLs to all materials
      for (const material of materials) {
        if (material.url) {
          material['file_url'] = SojebStorage.url(appConfig().storageUrl.materials_file + material.url);
        }
      }

      return {
        success: true,
        message: 'Materials retrieved successfully',
        data: materials,
      };
    } catch (error) {
      this.logger.error(`Error fetching materials by series: ${error.message}`, error.stack);
      return {
        success: false,
        message: 'Failed to fetch materials',
        error: error.message,
      };
    }
  }

  /**
   * Get materials by course ID
   */
  async findByCourse(course_id: string): Promise<MaterialsResponse<MaterialsFile[]>> {
    try {
      this.logger.log(`Fetching materials for course: ${course_id}`);

      const materials = await this.prisma.materialsFile.findMany({
        where: {
          course_id,
          deleted_at: null,
        },
        include: {
          series: {
            select: {
              id: true,
              title: true,
            },
          },
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
      });

      // Add file URLs to all materials
      for (const material of materials) {
        if (material.url) {
          material['file_url'] = SojebStorage.url(appConfig().storageUrl.materials_file + material.url);
        }
      }

      return {
        success: true,
        message: 'Materials retrieved successfully',
        data: materials,
      };
    } catch (error) {
      this.logger.error(`Error fetching materials by course: ${error.message}`, error.stack);
      return {
        success: false,
        message: 'Failed to fetch materials',
        error: error.message,
      };
    }
  }
}
