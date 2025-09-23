import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateScholarshipCodeDto } from './dto/create-scholarship-code.dto';
import { UpdateScholarshipCodeDto } from './dto/update-scholarship-code.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ScholarshipCodeService {
  private readonly logger = new Logger(ScholarshipCodeService.name);
  constructor(private readonly prisma: PrismaService) { }

  private generateCode(length: number = 10): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < length; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
    return out;
  }

  async create(createScholarshipCodeDto: CreateScholarshipCodeDto) {
    try {
      const code = createScholarshipCodeDto.code || this.generateCode(10);

      // Ensure uniqueness
      const exists = await this.prisma.scholarshipCode.findFirst({ where: { code, deleted_at: null } });
      if (exists) throw new BadRequestException('Scholarship code already exists');

      const created = await this.prisma.scholarshipCode.create({
        data: {
          code,
          code_type: createScholarshipCodeDto.code_type || 'code',
          name: createScholarshipCodeDto.name,
          description: createScholarshipCodeDto.description,
          scholarship_type: createScholarshipCodeDto.scholarship_type || 'free_student',
          status: createScholarshipCodeDto.status ?? 1,
          series_id: createScholarshipCodeDto.series_id,
          student_id: createScholarshipCodeDto.student_id,
          courses: {
            connect: createScholarshipCodeDto.course_ids?.map(id => ({ id })) || [],
          },
        },
      });

      return { success: true, message: 'Scholarship code created', data: created };
    } catch (error) {
      this.logger.error(`Create scholarship code failed: ${error.message}`, error.stack);
      if (error instanceof BadRequestException) throw error;
      return { success: false, message: 'Failed to create scholarship code', error: error.message };
    }
  }

  async findAll(page: number = 1, limit: number = 10, search?: string) {
    try {
      const skip = (page - 1) * limit;
      const where: any = { deleted_at: null };
      if (search) {
        where.OR = [
          { code: { contains: search, mode: 'insensitive' as any } },
          { name: { contains: search, mode: 'insensitive' as any } },
          { description: { contains: search, mode: 'insensitive' as any } },
        ];
      }

      const [items, total] = await Promise.all([
        this.prisma.scholarshipCode.findMany({
          where,
          skip,
          take: limit,
          orderBy: { created_at: 'desc' },
          select: {
            id: true,
            code: true,
            code_type: true,
            name: true,
            description: true,
            scholarship_type: true,
            status: true,
            created_at: true,
            updated_at: true,
            student: { select: { id: true, name: true, email: true } },
            series: { select: { id: true, title: true, slug: true } },
            courses: { select: { id: true, title: true } },
          },
        }),
        this.prisma.scholarshipCode.count({ where }),
      ]);

      const totalPages = Math.ceil(total / limit);
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;

      return {
        success: true,
        message: 'Scholarship codes retrieved successfully',
        data: {
          scholarship_codes: items,
          pagination: { total, page, limit, totalPages, hasNextPage, hasPreviousPage },
        },
      };
    } catch (error) {
      this.logger.error(`Error fetching scholarship codes: ${error.message}`, error.stack);
      return { success: false, message: 'Failed to fetch scholarship codes', error: error.message };
    }
  }

  async findOne(id: string) {
    try {
      const item = await this.prisma.scholarshipCode.findFirst({
        where: { id, deleted_at: null },
        select: {
          id: true,
          code: true,
          code_type: true,
          name: true,
          description: true,
          scholarship_type: true,
          status: true,
          created_at: true,
          updated_at: true,
          student: { select: { id: true, name: true, email: true } },
          series: { select: { id: true, title: true, slug: true } },
          courses: { select: { id: true, title: true } },
        },
      });
      if (!item) throw new NotFoundException('Scholarship code not found');
      return { success: true, message: 'Scholarship code retrieved successfully', data: item };
    } catch (error) {
      this.logger.error(`Error fetching scholarship code ${id}: ${error.message}`, error.stack);
      if (error instanceof NotFoundException) throw error;
      return { success: false, message: 'Failed to fetch scholarship code', error: error.message };
    }
  }

  async update(id: string, updateScholarshipCodeDto: UpdateScholarshipCodeDto) {
    await this.findOne(id);
    const updated = await this.prisma.scholarshipCode.update({ where: { id }, data: { ...updateScholarshipCodeDto } });
    return { success: true, message: 'Scholarship code updated', data: updated };
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.scholarshipCode.update({ where: { id }, data: { deleted_at: new Date() } });
    return { success: true, message: 'Scholarship code removed', data: { id } };
  }
}
