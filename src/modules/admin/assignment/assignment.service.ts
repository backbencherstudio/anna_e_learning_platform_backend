import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { AssignmentResponse } from './interfaces/assignment-response.interface';
import { Assignment, AssignmentQuestion, ScheduleType } from '@prisma/client';
import { DateHelper } from 'src/common/helper/date.helper';
import { AssignmentPublishService } from '../../queue/assignment-publish.service';
import { ScheduleEventRepository } from 'src/common/repository/schedule-event/schedule-event.repository';
import { NotificationRepository } from 'src/common/repository/notification/notification.repository';
import { MessageGateway } from 'src/modules/chat/message/message.gateway';

@Injectable()
export class AssignmentService {
  private readonly logger = new Logger(AssignmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly assignmentPublishService: AssignmentPublishService,
    private readonly messageGateway: MessageGateway,
  ) { }

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
      if (!createAssignmentDto.series_id) {
        throw new BadRequestException('Series ID is required');
      }

      // Calculate total marks if not provided
      let totalMarks = createAssignmentDto.total_marks;
      if (!totalMarks) {
        totalMarks = createAssignmentDto.questions.reduce((sum, question) => sum + (question.points || 0), 0);
      }

      // Create assignment with questions in a transaction
      const result = await this.prisma.$transaction(async (prisma) => {
        // Determine publication status and scheduling
        const now = new Date();
        const publishAt = createAssignmentDto.published_at ? new Date(createAssignmentDto.published_at) : undefined;
        const shouldPublishImmediately = createAssignmentDto.is_published || (publishAt && publishAt <= now);

        let publicationStatus = 'DRAFT';
        let scheduledPublishAt = null;

        if (shouldPublishImmediately) {
          publicationStatus = 'PUBLISHED';
        } else if (publishAt && publishAt > now) {
          publicationStatus = 'SCHEDULED';
          scheduledPublishAt = publishAt;
        }

        // Create the assignment
        const assignment = await prisma.assignment.create({
          data: {
            title: createAssignmentDto.title,
            description: createAssignmentDto.description,
            total_marks: totalMarks,
            due_at: createAssignmentDto.due_at ? new Date(createAssignmentDto.due_at) : undefined,
            is_published: shouldPublishImmediately,
            published_at: publishAt,
            publication_status: publicationStatus,
            scheduled_publish_at: scheduledPublishAt,
            series_id: createAssignmentDto.series_id,
            course_id: createAssignmentDto.course_id,
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

      // Schedule publication if needed (outside transaction)
      if (result.publication_status === 'SCHEDULED' && result.scheduled_publish_at) {
        try {
          await this.assignmentPublishService.scheduleAssignmentPublication(result.id, result.scheduled_publish_at);
          this.logger.log(`Assignment ${result.id} scheduled for publication at ${result.scheduled_publish_at.toISOString()}`);
        } catch (error) {
          this.logger.error(`Failed to schedule assignment publication for ${result.id}: ${error.message}`, error.stack);
          // Don't throw error here as the assignment was created successfully
        }
      }

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

      // Create schedule event
      await ScheduleEventRepository.createEvent({
        assignment_id: result.id,
        title: result.title,
        start_at: result.published_at,
        end_at: result.due_at,
        type: ScheduleType.ASSIGNMENT,
        series_id: result.series_id,
        course_id: result.course_id,
      });

      // Get all enrolled students in the series
      const enrolledStudents = await this.prisma.enrollment.findMany({
        where: {
          series_id: result.series_id,
          deleted_at: null,
          status: { in: ['ACTIVE', 'COMPLETED'] as any },
        },
        select: { user_id: true },
      });

      // Send notifications to all enrolled students
      const notificationPromises = enrolledStudents.map(student =>
        NotificationRepository.createNotification({
          receiver_id: student.user_id,
          text: `New assignment "${result.title}" has been published`,
          type: 'assignment',
          entity_id: result.id,
        })
      );

      await Promise.all(notificationPromises);

      // Send real-time notifications to all enrolled students
      enrolledStudents.forEach(student => {
        this.messageGateway.server.emit('notification', {
          receiver_id: student.user_id,
          text: `New assignment "${result.title}" has been published`,
          type: 'assignment',
          entity_id: result.id,
        });
      });

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

  async getDashboard(query?: { series_id?: string; course_id?: string; limit?: number }): Promise<any> {
    try {
      this.logger.log('Fetching assignment dashboard data');

      const limit = query?.limit || 10;
      const whereClause: any = {};

      if (query?.series_id) {
        whereClause.series_id = query.series_id;
      }
      if (query?.course_id) {
        whereClause.course_id = query.course_id;
      }

      // Fetch assignments with submissions
      const assignmentsWithSubmissions = await this.prisma.assignment.findMany({
        where: {
          ...whereClause,
          is_published: true,
          submissions: {
            some: {
              status: {
                in: ['SUBMITTED'],
              },
              submitted_at: {
                not: null,
              },
            },
          },
        },
        take: limit,
        select: {
          id: true,
          title: true,
          due_at: true,
          published_at: true,
          is_published: true,
          created_at: true,
          total_marks: true,
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
          _count: {
            select: {
              submissions: true,
            },
          },
          submissions: {
            select: {
              id: true,
              status: true,
              total_grade: true,
              overall_feedback: true,
              graded_at: true,
              graded_by_id: true,
              graded_by: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
        orderBy: { created_at: 'desc' },
      });

      // Fetch published assignments
      const publishedAssignments = await this.prisma.assignment.findMany({
        where: {
          ...whereClause,
          is_published: true,
          // due_at: {
          //   gte: new Date(),
          // },
        },
        take: limit,
        select: {
          id: true,
          title: true,
          due_at: true,
          published_at: true,
          is_published: true,
          created_at: true,
          total_marks: true,
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
        orderBy: { created_at: 'desc' },
      });

      // Fetch unpublished assignments
      const unpublishedAssignments = await this.prisma.assignment.findMany({
        where: {
          ...whereClause,
          is_published: false,
        },
        take: limit,
        select: {
          id: true,
          title: true,
          due_at: true,
          published_at: true,
          is_published: true,
          created_at: true,
          total_marks: true,
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
        orderBy: { created_at: 'desc' },
      });

      // Calculate submission statistics for assignments
      const assignmentsWithStats = assignmentsWithSubmissions.map(assignment => {
        const submittedCount = assignment.submissions.filter(s => s.status === 'SUBMITTED' || s.status === 'GRADED').length;
        const gradedCount = assignment.submissions.filter(s => s.status === 'GRADED').length;
        const remainingTime = assignment.due_at ? DateHelper.diff(assignment.due_at.toISOString(), DateHelper.now().toISOString(), 'days') : null;
        const averageScore = gradedCount > 0
          ? assignment.submissions
            .filter(s => s.status === 'GRADED')
            .reduce((sum, s) => sum + (s.total_grade || 0), 0) / gradedCount
          : 0;

        return {
          ...assignment,
          submission_count: submittedCount,
          graded_count: gradedCount,
          average_score: averageScore,
          remaining_time: remainingTime,
        };
      });

      const publishedAssignmentsWithStats = publishedAssignments.map(assignment => {
        const remainingTime = assignment.due_at ? DateHelper.diff(assignment.due_at.toISOString(), DateHelper.now().toISOString(), 'days') : null;
        return {
          ...assignment,
          remaining_time: remainingTime,
        };
      });

      // Get counts for summary
      const [totalPublishedAssignments, totalUnpublishedAssignments, totalAssignmentSubmissions] = await Promise.all([
        this.prisma.assignment.count({ where: { ...whereClause, is_published: true } }),
        this.prisma.assignment.count({ where: { ...whereClause, is_published: false } }),
        this.prisma.assignmentSubmission.count({
          where: {
            assignment: whereClause,
            status: { in: ['SUBMITTED', 'GRADED'] }
          }
        }),
      ]);

      return {
        success: true,
        message: 'Assignment dashboard data retrieved successfully',
        data: {
          assignments_with_submissions: assignmentsWithStats,
          published_assignments: publishedAssignmentsWithStats,
          unpublished_assignments: unpublishedAssignments,
          total_published_assignments: totalPublishedAssignments,
          total_unpublished_assignments: totalUnpublishedAssignments,
          total_submissions: totalAssignmentSubmissions,
          summary: {
            total_assignments: totalPublishedAssignments + totalUnpublishedAssignments,
            active_assignments: totalPublishedAssignments,
            pending_publication: totalUnpublishedAssignments,
            total_submissions: totalAssignmentSubmissions,
          }
        },
      };
    } catch (error) {
      this.logger.error(`Error fetching assignment dashboard data: ${error.message}`, error.stack);
      return {
        success: false,
        message: 'Failed to fetch assignment dashboard data',
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
            series: {
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
          series: {
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

        // Handle publication scheduling
        const now = new Date();
        const publishAt = updateAssignmentDto.published_at ? new Date(updateAssignmentDto.published_at) : undefined;
        const shouldPublishImmediately = updateAssignmentDto.is_published || (publishAt && publishAt <= now);

        let publicationStatus = 'DRAFT';
        let scheduledPublishAt = null;

        if (shouldPublishImmediately) {
          publicationStatus = 'PUBLISHED';
          updateData.published_at = now;
        } else if (publishAt && publishAt > now) {
          publicationStatus = 'SCHEDULED';
          scheduledPublishAt = publishAt;
        } else if (updateAssignmentDto.published_at === null) {
          // If published_at is explicitly set to null, cancel scheduling
          publicationStatus = 'DRAFT';
          scheduledPublishAt = null;
        }

        updateData.publication_status = publicationStatus;
        updateData.scheduled_publish_at = scheduledPublishAt;
        updateData.is_published = shouldPublishImmediately;

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

      // Handle queue scheduling after transaction is committed
      if (updatedAssignment.publication_status === 'SCHEDULED' && updatedAssignment.scheduled_publish_at) {
        try {
          await this.assignmentPublishService.scheduleAssignmentPublication(id, updatedAssignment.scheduled_publish_at);
          this.logger.log(`Assignment ${id} scheduled for publication at ${updatedAssignment.scheduled_publish_at.toISOString()}`);
        } catch (error) {
          this.logger.error(`Failed to schedule assignment publication for ${id}: ${error.message}`, error.stack);
        }
      } else if (updatedAssignment.publication_status === 'DRAFT' || updatedAssignment.publication_status === 'PUBLISHED') {
        try {
          await this.assignmentPublishService.cancelScheduledPublication(id);
          this.logger.log(`Cancelled scheduled publication for assignment ${id}`);
        } catch (error) {
          this.logger.error(`Failed to cancel scheduled publication for assignment ${id}: ${error.message}`, error.stack);
        }
      }

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

      // Get all submissions first
      const submissions = await this.prisma.assignmentSubmission.findMany({
        where: { assignment_id: id },
        select: { id: true },
      });

      // Delete all assignment answers
      if (submissions.length > 0) {
        await this.prisma.assignmentAnswer.deleteMany({
          where: { submission_id: { in: submissions.map(submission => submission.id) } },
        });
      }

      // Delete all assignment submissions
      await this.prisma.assignmentSubmission.deleteMany({
        where: { assignment_id: id },
      });

      // Delete all assignment questions
      await this.prisma.assignmentQuestion.deleteMany({
        where: { assignment_id: id },
      });

      // delete all event
      await this.prisma.scheduleEvent.deleteMany({
        where: { assignment_id: id },
      });



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

  /**
   * Get assignment publication status
   */
  async getAssignmentPublicationStatus(id: string): Promise<AssignmentResponse<any>> {
    try {
      this.logger.log(`Getting publication status for assignment: ${id}`);

      // Check if assignment exists
      const assignment = await this.prisma.assignment.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          publication_status: true,
          scheduled_publish_at: true,
          is_published: true,
          published_at: true,
        },
      });

      if (!assignment) {
        throw new NotFoundException(`Assignment with ID ${id} not found`);
      }

      // Get queue status
      const queueStatus = await this.assignmentPublishService.getAssignmentPublicationStatus(id);

      return {
        success: true,
        message: 'Assignment publication status retrieved successfully',
        data: {
          ...assignment,
          queue_status: queueStatus,
        },
      };
    } catch (error) {
      this.logger.error(`Error getting assignment publication status ${id}: ${error.message}`, error.stack);

      if (error instanceof NotFoundException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to get assignment publication status',
        error: error.message,
      };
    }
  }

  /**
   * Cancel scheduled assignment publication
   */
  async cancelScheduledPublication(id: string): Promise<AssignmentResponse<any>> {
    try {
      this.logger.log(`Cancelling scheduled publication for assignment: ${id}`);

      // Check if assignment exists
      const existingAssignment = await this.prisma.assignment.findUnique({
        where: { id },
        select: { id: true, title: true, publication_status: true },
      });

      if (!existingAssignment) {
        throw new NotFoundException(`Assignment with ID ${id} not found`);
      }

      // Cancel scheduled publication
      await this.assignmentPublishService.cancelScheduledPublication(id);

      // Update assignment status to DRAFT
      const updatedAssignment = await this.prisma.assignment.update({
        where: { id },
        data: {
          publication_status: 'DRAFT',
          scheduled_publish_at: null,
        },
      });

      this.logger.log(`Cancelled scheduled publication for assignment ${id}`);

      return {
        success: true,
        message: `Scheduled publication cancelled for assignment "${updatedAssignment.title}"`,
        data: updatedAssignment,
      };
    } catch (error) {
      this.logger.error(`Error cancelling scheduled publication for assignment ${id}: ${error.message}`, error.stack);

      if (error instanceof NotFoundException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to cancel scheduled publication',
        error: error.message,
      };
    }
  }
}
