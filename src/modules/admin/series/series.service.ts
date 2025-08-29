import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateSeriesDto } from './dto/create-series.dto';
import { UpdateSeriesDto } from './dto/update-series.dto';
import { SeriesResponse } from './interfaces/series-response.interface';
import { Series, Course } from '@prisma/client';
import appConfig from 'src/config/app.config';
import { StringHelper } from 'src/common/helper/string.helper';
import { SojebStorage } from '../../../common/lib/Disk/SojebStorage';

@Injectable()
export class SeriesService {
  private readonly logger = new Logger(SeriesService.name);

  constructor(private readonly prisma: PrismaService) { }

  /**
   * Create a new series with optional course associations
   */
  async create(createSeriesDto: CreateSeriesDto, thumbnail?: Express.Multer.File): Promise<SeriesResponse<Series>> {
    try {
      this.logger.log('Creating new series');

      // Validate that course_ids exist if provided
      if (createSeriesDto.course_ids && createSeriesDto.course_ids.length > 0) {
        const existingCourses = await this.prisma.course.findMany({
          where: {
            id: { in: createSeriesDto.course_ids },
            deleted_at: null,
          },
          select: { id: true },
        });

        if (existingCourses.length !== createSeriesDto.course_ids.length) {
          throw new BadRequestException('One or more course IDs are invalid');
        }
      }

      // Handle thumbnail file upload if provided
      let thumbnailFileName: string | undefined;
      if (thumbnail) {
        thumbnailFileName = StringHelper.generateRandomFileName(thumbnail.originalname);
        await SojebStorage.put(appConfig().storageUrl.series_thumbnail + thumbnailFileName, thumbnail.buffer);
        this.logger.log(`Uploaded thumbnail: ${thumbnailFileName}`);
      }

      // Create series with course associations in a transaction
      const result = await this.prisma.$transaction(async (prisma) => {
        const series = await prisma.series.create({
          data: {
            title: createSeriesDto.title,
            description: createSeriesDto.description,
            thumbnail: thumbnailFileName,
          },
        });

        this.logger.log(`Created series with ID: ${series.id}`);

        // Associate courses if provided
        if (createSeriesDto.course_ids && createSeriesDto.course_ids.length > 0) {
          for (const courseId of createSeriesDto.course_ids) {
            await prisma.course.update({
              where: { id: courseId },
              data: { series_id: series.id },
            });
          }
          this.logger.log(`Associated ${createSeriesDto.course_ids.length} courses with series`);
        }

        return series;
      });

      // Fetch the complete series with relations
      const seriesWithRelations = await this.prisma.series.findUnique({
        where: { id: result.id },
        include: {
          courses: {
            where: { deleted_at: null },
            select: {
              id: true,
              title: true,
              slug: true,
              thumbnail: true,
              summary: true,
            },
            orderBy: { created_at: 'asc' },
          },
        },
      });

      // Add thumbnail URL for series
      if (seriesWithRelations?.thumbnail) {
        seriesWithRelations.thumbnail = appConfig().storageUrl.series_thumbnail + seriesWithRelations.thumbnail;
      }

      // Add thumbnail URL for courses
      if (seriesWithRelations.courses && seriesWithRelations.courses.length > 0) {
        seriesWithRelations.courses.forEach(course => {
          if (course.thumbnail) {
            course.thumbnail = appConfig().storageUrl.course_thumbnail + course.thumbnail;
          }
        });
      }

      this.logger.log(`Series created successfully with ID: ${result.id}`);

      return {
        success: true,
        message: 'Series created successfully',
        data: seriesWithRelations,
      };
    } catch (error) {
      this.logger.error(`Error creating series: ${error.message}`, error.stack);

      if (error instanceof BadRequestException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to create series',
        error: error.message,
      };
    }
  }

  /**
   * Get all series with pagination and filtering
   */
  async findAll(page: number = 1, limit: number = 10, search?: string): Promise<SeriesResponse<{ series: any[]; pagination: any }>> {
    try {
      this.logger.log('Fetching all series');

      const skip = (page - 1) * limit;

      const where = search ? {
        OR: [
          { title: { contains: search, mode: 'insensitive' as any } },
          { description: { contains: search, mode: 'insensitive' as any } },
        ],
      } : {};

      const [series, total] = await Promise.all([
        this.prisma.series.findMany({
          where,
          skip,
          take: limit,
          select: {
            id: true,
            title: true,
            description: true,
            thumbnail: true,

            created_at: true,
            updated_at: true,
            courses: {
              where: { deleted_at: null },
              select: {
                id: true,
                title: true,
                slug: true,
                thumbnail: true,
                summary: true,
              },
              orderBy: { created_at: 'asc' },
            },
            _count: {
              select: {
                courses: true,
              },
            },
          },
          orderBy: { created_at: 'desc' },
        }),
        this.prisma.series.count({ where }),
      ]);

      // add thumbnail url for series
      for (const s of series) {
        if (s.thumbnail) {
          s['thumbnail_url'] = SojebStorage.url(appConfig().storageUrl.series_thumbnail + s.thumbnail);
        }

        // add thumbnail url for courses
        if (s.courses && s.courses.length > 0) {
          s.courses.forEach(course => {
            if (course.thumbnail) {
              course['thumbnail_url'] = SojebStorage.url(appConfig().storageUrl.course_thumbnail + course.thumbnail);
            }
          });
        }
      }

      // Calculate pagination values
      const totalPages = Math.ceil(total / limit);
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;

      return {
        success: true,
        message: 'Series retrieved successfully',
        data: {
          series,
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
      this.logger.error(`Error fetching series: ${error.message}`, error.stack);

      return {
        success: false,
        message: 'Failed to fetch series',
        error: error.message,
      };
    }
  }

  /**
   * Get a single series by ID
   */
  async findOne(id: string): Promise<SeriesResponse<Series>> {
    try {
      this.logger.log(`Fetching series with ID: ${id}`);

      const series = await this.prisma.series.findUnique({
        where: { id },
        include: {
          courses: {
            where: { deleted_at: null },
            select: {
              id: true,
              title: true,
              slug: true,
              thumbnail: true,
              summary: true,
              description: true,
              visibility: true,
              estimated_min: true,
              price: true,
              created_at: true,
            },
            orderBy: { created_at: 'asc' },
          },
        },
      });

      if (!series) {
        throw new NotFoundException(`Series with ID ${id} not found`);
      }

      // Add thumbnail URL for series
      if (series.thumbnail) {
        series['thumbnail_url'] = SojebStorage.url(appConfig().storageUrl.series_thumbnail + series.thumbnail);
      }

      // Add thumbnail URL for courses
      if (series.courses && series.courses.length > 0) {
        series.courses.forEach(course => {
          if (course.thumbnail) {
            course['thumbnail_url'] = SojebStorage.url(appConfig().storageUrl.course_thumbnail + course.thumbnail);
          }
        });
      }

      return {
        success: true,
        message: 'Series retrieved successfully',
        data: series,
      };
    } catch (error) {
      this.logger.error(`Error fetching series ${id}: ${error.message}`, error.stack);

      if (error instanceof NotFoundException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to fetch series',
        error: error.message,
      };
    }
  }

  /**
   * Update a series by ID
   */
  async update(id: string, updateSeriesDto: UpdateSeriesDto, thumbnail?: Express.Multer.File): Promise<SeriesResponse<any>> {
    try {
      this.logger.log(`Updating series with ID: ${id}`);

      // Check if series exists
      const existingSeries = await this.prisma.series.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!existingSeries) {
        throw new NotFoundException(`Series with ID ${id} not found`);
      }

      // Validate that course_ids exist if provided
      if (updateSeriesDto.course_ids && updateSeriesDto.course_ids.length > 0) {
        const existingCourses = await this.prisma.course.findMany({
          where: {
            id: { in: updateSeriesDto.course_ids },
            deleted_at: null,
          },
          select: { id: true },
        });

        if (existingCourses.length !== updateSeriesDto.course_ids.length) {
          throw new BadRequestException('One or more course IDs are invalid');
        }
      }

      // Handle thumbnail file upload if provided
      let thumbnailFileName: string | undefined;
      if (thumbnail) {
        // Get existing series to delete old thumbnail
        const existingSeries = await this.prisma.series.findUnique({
          where: { id },
          select: { thumbnail: true },
        });

        // Delete old thumbnail if exists
        if (existingSeries?.thumbnail) {
          const { SojebStorage } = await import('../../../common/lib/Disk/SojebStorage');
          try {
            await SojebStorage.delete(appConfig().storageUrl.series_thumbnail + existingSeries.thumbnail);
            this.logger.log(`Deleted old thumbnail: ${existingSeries.thumbnail}`);
          } catch (error) {
            this.logger.warn(`Failed to delete old thumbnail: ${error.message}`);
          }
        }

        // Upload new thumbnail
        const { StringHelper } = await import('../../../common/helper/string.helper');
        thumbnailFileName = StringHelper.generateRandomFileName(thumbnail.originalname);
        const { SojebStorage } = await import('../../../common/lib/Disk/SojebStorage');
        await SojebStorage.put(appConfig().storageUrl.series_thumbnail + thumbnailFileName, thumbnail.buffer);
        this.logger.log(`Uploaded new thumbnail: ${thumbnailFileName}`);
      }

      // Update series and handle course associations in a transaction
      const updatedSeries = await this.prisma.$transaction(async (prisma) => {
        // Prepare update data
        const updateData: any = { ...updateSeriesDto };
        if (thumbnailFileName) {
          updateData.thumbnail = thumbnailFileName;
        }

        // Remove course_ids from updateData as we'll handle them separately
        delete updateData.course_ids;

        const series = await prisma.series.update({
          where: { id },
          data: updateData,
        });

        // Handle course associations if provided
        if (updateSeriesDto.course_ids !== undefined) {
          // Remove all existing course associations
          await prisma.course.updateMany({
            where: { series_id: id },
            data: { series_id: null },
          });

          // Add new course associations
          if (updateSeriesDto.course_ids && updateSeriesDto.course_ids.length > 0) {
            for (const courseId of updateSeriesDto.course_ids) {
              await prisma.course.update({
                where: { id: courseId },
                data: { series_id: id },
              });
            }
          }
        }

        return series;
      });

      // Fetch the complete updated series with relations
      const seriesWithRelations = await this.prisma.series.findUnique({
        where: { id },
        include: {
          courses: {
            where: { deleted_at: null },
            select: {
              id: true,
              title: true,
              slug: true,
              thumbnail: true,
              summary: true,
            },
            orderBy: { created_at: 'asc' },
          },
        },
      });

      // Add thumbnail URL for series
      if (seriesWithRelations?.thumbnail) {
        seriesWithRelations.thumbnail = appConfig().storageUrl.series_thumbnail + seriesWithRelations.thumbnail;
      }

      // Add thumbnail URL for courses
      if (seriesWithRelations.courses && seriesWithRelations.courses.length > 0) {
        seriesWithRelations.courses.forEach(course => {
          if (course.thumbnail) {
            course.thumbnail = appConfig().storageUrl.course_thumbnail + course.thumbnail;
          }
        });
      }

      this.logger.log(`Series updated successfully with ID: ${id}`);

      return {
        success: true,
        message: 'Series updated successfully',
        data: seriesWithRelations,
      };
    } catch (error) {
      this.logger.error(`Error updating series ${id}: ${error.message}`, error.stack);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to update series',
        error: error.message,
      };
    }
  }

  /**
   * Delete a series by ID (soft delete)
   */
  async remove(id: string): Promise<SeriesResponse<{ id: string }>> {
    try {
      this.logger.log(`Deleting series with ID: ${id}`);

      // Check if series exists and get thumbnail
      const existingSeries = await this.prisma.series.findUnique({
        where: { id },
        select: { id: true, thumbnail: true },
      });

      if (!existingSeries) {
        throw new NotFoundException(`Series with ID ${id} not found`);
      }

      // Remove course associations and soft delete the series in a transaction
      await this.prisma.$transaction(async (prisma) => {
        // Remove all course associations
        await prisma.course.updateMany({
          where: { series_id: id },
          data: { series_id: null },
        });

        // Soft delete the series (Prisma middleware will handle this)
        await prisma.series.delete({
          where: { id },
        });
      });

      // Delete thumbnail file if exists
      if (existingSeries?.thumbnail) {
        try {
          await SojebStorage.delete(appConfig().storageUrl.series_thumbnail + existingSeries.thumbnail);
          this.logger.log(`Deleted thumbnail: ${existingSeries.thumbnail}`);
        } catch (error) {
          this.logger.warn(`Failed to delete thumbnail: ${error.message}`);
        }
      }

      this.logger.log(`Series deleted successfully with ID: ${id}`);

      return {
        success: true,
        message: 'Series deleted successfully',
        data: { id },
      };
    } catch (error) {
      this.logger.error(`Error deleting series ${id}: ${error.message}`, error.stack);

      if (error instanceof NotFoundException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to delete series',
        error: error.message,
      };
    }
  }
}
