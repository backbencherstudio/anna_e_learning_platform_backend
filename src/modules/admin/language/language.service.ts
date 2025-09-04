import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { CreateLanguageDto } from './dto/create-language.dto';
import { UpdateLanguageDto } from './dto/update-language.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { LanguageResponse } from './interfaces/language-response.interface';

@Injectable()
export class LanguageService {
  private readonly logger = new Logger(LanguageService.name);

  constructor(private readonly prisma: PrismaService) { }

  /**
   * Create a new language
   */
  async create(createLanguageDto: CreateLanguageDto): Promise<LanguageResponse<any>> {
    try {
      this.logger.log('Creating new language');

      // Check if language with same code already exists
      const existingLanguage = await this.prisma.language.findFirst({
        where: { code: createLanguageDto.code },
      });

      if (existingLanguage) {
        throw new BadRequestException(`Language with code '${createLanguageDto.code}' already exists`);
      }

      const language = await this.prisma.language.create({
        data: {
          ...createLanguageDto,
        },
        select: {
          id: true,
          name: true,
          code: true,
          created_at: true,
        },
      });

      this.logger.log(`Language created successfully with ID: ${language.id}`);

      return {
        success: true,
        message: 'Language created successfully',
        data: language,
      };
    } catch (error) {
      this.logger.error(`Error creating language: ${error.message}`, error.stack);

      if (error instanceof BadRequestException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to create language',
        error: error.message,
      };
    }
  }

  /**
   * Get all languages with pagination and search
   */
  async findAll(page: number = 1, limit: number = 10, search?: string): Promise<LanguageResponse<{ languages: any[]; pagination: any }>> {
    try {
      this.logger.log('Fetching all languages');

      const skip = (page - 1) * limit;

      const where = search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as any } },
          { code: { contains: search, mode: 'insensitive' as any } },
        ],
      } : {};

      const [languages, total] = await Promise.all([
        this.prisma.language.findMany({
          where,
          skip,
          take: limit,
          select: {
            id: true,
            name: true,
            code: true,
            created_at: true,
            updated_at: true,
          },
          orderBy: { created_at: 'desc' },
        }),
        this.prisma.language.count({ where }),
      ]);

      // Calculate pagination values
      const totalPages = Math.ceil(total / limit);
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;

      this.logger.log(`Retrieved ${languages.length} languages out of ${total}`);

      return {
        success: true,
        message: languages.length ? 'Languages retrieved successfully' : 'No languages found',
        data: {
          languages,
          pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNextPage,
            hasPreviousPage,
          },
        },
      };
    } catch (error) {
      this.logger.error(`Error fetching languages: ${error.message}`, error.stack);

      return {
        success: false,
        message: 'Failed to fetch languages',
        error: error.message,
      };
    }
  }

  /**
   * Get a single language by ID
   */
  async findOne(id: string): Promise<LanguageResponse<any>> {
    try {
      this.logger.log(`Fetching language with ID: ${id}`);

      const language = await this.prisma.language.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          code: true,
          created_at: true,
          updated_at: true,
        },
      });

      if (!language) {
        throw new NotFoundException(`Language with ID ${id} not found`);
      }

      this.logger.log(`Language retrieved successfully with ID: ${id}`);

      return {
        success: true,
        message: 'Language retrieved successfully',
        data: language,
      };
    } catch (error) {
      this.logger.error(`Error fetching language ${id}: ${error.message}`, error.stack);

      if (error instanceof NotFoundException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to fetch language',
        error: error.message,
      };
    }
  }

  /**
   * Update an existing language
   */
  async update(id: string, updateLanguageDto: UpdateLanguageDto): Promise<LanguageResponse<any>> {
    try {
      this.logger.log(`Updating language with ID: ${id}`);

      // Check if language exists
      const existingLanguage = await this.prisma.language.findUnique({
        where: { id },
        select: { id: true, code: true },
      });

      if (!existingLanguage) {
        throw new NotFoundException(`Language with ID ${id} not found`);
      }

      // Check if new code conflicts with existing language (excluding current one)
      if (updateLanguageDto.code && updateLanguageDto.code !== existingLanguage.code) {
        const codeExists = await this.prisma.language.findFirst({
          where: {
            code: updateLanguageDto.code,
            id: { not: id },
          },
        });

        if (codeExists) {
          throw new BadRequestException(`Language with code '${updateLanguageDto.code}' already exists`);
        }
      }

      const updatedLanguage = await this.prisma.language.update({
        where: { id },
        data: {
          ...updateLanguageDto,
        },
        select: {
          id: true,
          name: true,
          code: true,
          created_at: true,
          updated_at: true,
        },
      });

      this.logger.log(`Language updated successfully with ID: ${id}`);

      return {
        success: true,
        message: 'Language updated successfully',
        data: updatedLanguage,
      };
    } catch (error) {
      this.logger.error(`Error updating language ${id}: ${error.message}`, error.stack);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to update language',
        error: error.message,
      };
    }
  }

  /**
   * Delete a language by ID
   */
  async remove(id: string): Promise<LanguageResponse<{ id: string }>> {
    try {
      this.logger.log(`Deleting language with ID: ${id}`);

      // Check if language exists
      const existingLanguage = await this.prisma.language.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!existingLanguage) {
        throw new NotFoundException(`Language with ID ${id} not found`);
      }

      // Check if language is being used by any courses
      const coursesUsingLanguage = await this.prisma.course.findFirst({
        where: { language_id: id },
        select: { id: true },
      });

      if (coursesUsingLanguage) {
        throw new BadRequestException('Cannot delete language as it is being used by courses');
      }

      // Delete the language
      await this.prisma.language.delete({
        where: { id },
      });

      this.logger.log(`Language deleted successfully with ID: ${id}`);

      return {
        success: true,
        message: 'Language deleted successfully',
        data: { id },
      };
    } catch (error) {
      this.logger.error(`Error deleting language ${id}: ${error.message}`, error.stack);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to delete language',
        error: error.message,
      };
    }
  }
}
