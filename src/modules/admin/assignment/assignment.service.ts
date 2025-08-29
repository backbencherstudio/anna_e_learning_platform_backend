import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { AssignmentResponse } from './interfaces/assignment-response.interface';
import { Assignment, AssignmentQuestion } from '@prisma/client';

@Injectable()
export class AssignmentService {
  private readonly logger = new Logger(AssignmentService.name);

  constructor(private readonly prisma: PrismaService) { }

  /**
   * Create a new assignment with questions
   */
  async create(createAssignmentDto: CreateAssignmentDto): Promise<AssignmentResponse<Assignment>> {
    try {
      this.logger.log('Creating new assignment');

      // Validate that at least one question is provided
      if (!createAssignmentDto.questions || createAssignmentDto.questions.length === 0) {
        throw new BadRequestException('At least one question is required');
      }

      // Validate that course_id is provided
      if (!createAssignmentDto.course_id) {
        throw new BadRequestException('Course ID is required');
      }

      // Calculate total marks if not provided
      let totalMarks = createAssignmentDto.total_marks;
      if (!totalMarks) {
        totalMarks = createAssignmentDto.questions.reduce((sum, question) => sum + (question.points || 0), 0);
      }

      // Create assignment with questions in a transaction
      const result = await this.prisma.$transaction(async (prisma) => {
        // Create the assignment
        const assignment = await prisma.assignment.create({
          data: {
            title: createAssignmentDto.title,
            description: createAssignmentDto.description,
            total_marks: totalMarks,
            due_at: createAssignmentDto.due_at ? new Date(createAssignmentDto.due_at) : undefined,
            is_published: createAssignmentDto.is_published || false,
            published_at: createAssignmentDto.published_at ? new Date(createAssignmentDto.published_at) : undefined,
            course_id: createAssignmentDto.course_id,
            lesson_id: createAssignmentDto.lesson_id,
          },
        });

        this.logger.log(`Created assignment with ID: ${assignment.id}`);

        // Create questions for this assignment
        for (const questionDto of createAssignmentDto.questions) {
          const question = await prisma.assignmentQuestion.create({
            data: {
              assignment_id: assignment.id,
              title: questionDto.title,
              points: questionDto.points || 0,
              position: questionDto.position || 0,
            },
          });

          this.logger.log(`Created assignment question with ID: ${question.id}`);
        }

        return assignment;
      });

      // Fetch the complete assignment with relations
      const assignmentWithRelations = await this.prisma.assignment.findUnique({
        where: { id: result.id },
        include: {
          questions: {
            orderBy: { position: 'asc' },
          },
        },
      });

      this.logger.log(`Assignment created successfully with ID: ${result.id}`);

      return {
        success: true,
        message: 'Assignment created successfully',
        data: assignmentWithRelations,
      };
    } catch (error) {
      this.logger.error(`Error creating assignment: ${error.message}`, error.stack);

      if (error instanceof BadRequestException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to create assignment',
        error: error.message,
      };
    }
  }

  /**
   * Get all assignments with pagination and filtering
   */
  async findAll(page: number = 1, limit: number = 10, search?: string): Promise<AssignmentResponse<{ assignments: any[]; pagination: any }>> {
    try {
      this.logger.log('Fetching all assignments');

      const skip = (page - 1) * limit;

      const where = search ? {
        OR: [
          { title: { contains: search, mode: 'insensitive' as any } },
          { description: { contains: search, mode: 'insensitive' as any } },
        ],
      } : {};

      const [assignments, total] = await Promise.all([
        this.prisma.assignment.findMany({
          where,
          skip,
          take: limit,
          select: {
            id: true,
            title: true,
            description: true,
            total_marks: true,
            due_at: true,
            is_published: true,
            published_at: true,
            created_at: true,
            updated_at: true,
            course: {
              select: {
                id: true,
                title: true,
                slug: true,
              },
            },
            lesson: {
              select: {
                id: true,
                title: true,
                slug: true,
              },
            },
            questions: {
              select: {
                id: true,
                title: true,
                points: true,
                position: true,
                created_at: true,
              },
              orderBy: { position: 'asc' },
            },
            _count: {
              select: {
                questions: true,
                submissions: true,
              },
            },
          },
          orderBy: { created_at: 'desc' },
        }),
        this.prisma.assignment.count({ where }),
      ]);

      // Calculate pagination values
      const totalPages = Math.ceil(total / limit);
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;

      return {
        success: true,
        message: 'Assignments retrieved successfully',
        data: {
          assignments,
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
      this.logger.error(`Error fetching assignments: ${error.message}`, error.stack);

      return {
        success: false,
        message: 'Failed to fetch assignments',
        error: error.message,
      };
    }
  }

  /**
   * Get a single assignment by ID
   */
  async findOne(id: string): Promise<AssignmentResponse<Assignment>> {
    try {
      this.logger.log(`Fetching assignment with ID: ${id}`);

      const assignment = await this.prisma.assignment.findUnique({
        where: { id },
        include: {
          course: {
            select: {
              id: true,
              title: true,
              slug: true,
            },
          },
          lesson: {
            select: {
              id: true,
              title: true,
              slug: true,
            },
          },
          questions: {
            orderBy: { position: 'asc' },
          },
        },
      });

      if (!assignment) {
        throw new NotFoundException(`Assignment with ID ${id} not found`);
      }

      return {
        success: true,
        message: 'Assignment retrieved successfully',
        data: assignment,
      };
    } catch (error) {
      this.logger.error(`Error fetching assignment ${id}: ${error.message}`, error.stack);

      if (error instanceof NotFoundException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to fetch assignment',
        error: error.message,
      };
    }
  }

  /**
   * Update an assignment by ID
   */
  async update(id: string, updateAssignmentDto: UpdateAssignmentDto): Promise<AssignmentResponse<any>> {
    try {
      this.logger.log(`Updating assignment with ID: ${id}`);

      // Check if assignment exists
      const existingAssignment = await this.prisma.assignment.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!existingAssignment) {
        throw new NotFoundException(`Assignment with ID ${id} not found`);
      }

      // Update assignment and handle questions in a transaction
      const updatedAssignment = await this.prisma.$transaction(async (prisma) => {
        // Prepare update data
        const updateData: any = { ...updateAssignmentDto };
        if (updateAssignmentDto.due_at) updateData.due_at = new Date(updateAssignmentDto.due_at);
        if (updateAssignmentDto.published_at) updateData.published_at = new Date(updateAssignmentDto.published_at);

        // Remove questions from updateData as we'll handle them separately
        delete updateData.questions;

        // Calculate total marks if questions are being updated
        if (updateAssignmentDto.questions && updateAssignmentDto.questions.length > 0) {
          const totalMarks = updateAssignmentDto.questions.reduce((sum, question) => sum + (question.points || 0), 0);
          updateData.total_marks = totalMarks;
        }

        const assignment = await prisma.assignment.update({
          where: { id },
          data: updateData,
        });

        // Handle questions if provided
        if (updateAssignmentDto.questions && updateAssignmentDto.questions.length > 0) {
          // Delete existing questions
          await prisma.assignmentQuestion.deleteMany({
            where: { assignment_id: id },
          });

          // Create new questions
          for (const questionDto of updateAssignmentDto.questions) {
            await prisma.assignmentQuestion.create({
              data: {
                assignment_id: assignment.id,
                title: questionDto.title,
                points: questionDto.points || 0,
                position: questionDto.position || 0,
              },
            });
          }
        }

        return assignment;
      });

      // Fetch the complete updated assignment with relations
      const assignmentWithRelations = await this.prisma.assignment.findUnique({
        where: { id },
        include: {
          questions: {
            orderBy: { position: 'asc' },
          },
        },
      });

      this.logger.log(`Assignment updated successfully with ID: ${id}`);

      return {
        success: true,
        message: 'Assignment updated successfully',
        data: assignmentWithRelations,
      };
    } catch (error) {
      this.logger.error(`Error updating assignment ${id}: ${error.message}`, error.stack);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to update assignment',
        error: error.message,
      };
    }
  }

  /**
   * Delete an assignment by ID (soft delete)
   */
  async remove(id: string): Promise<AssignmentResponse<{ id: string }>> {
    try {
      this.logger.log(`Deleting assignment with ID: ${id}`);

      // Check if assignment exists
      const existingAssignment = await this.prisma.assignment.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!existingAssignment) {
        throw new NotFoundException(`Assignment with ID ${id} not found`);
      }

      // Soft delete the assignment (Prisma middleware will handle this)
      await this.prisma.assignment.delete({
        where: { id },
      });

      this.logger.log(`Assignment deleted successfully with ID: ${id}`);

      return {
        success: true,
        message: 'Assignment deleted successfully',
        data: { id },
      };
    } catch (error) {
      this.logger.error(`Error deleting assignment ${id}: ${error.message}`, error.stack);

      if (error instanceof NotFoundException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to delete assignment',
        error: error.message,
      };
    }
  }
}
