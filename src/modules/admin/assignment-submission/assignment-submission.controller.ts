import { Controller, Get, Post, Body, Patch, Param, Delete, Query, HttpStatus, HttpCode, Req } from '@nestjs/common';
import { AssignmentSubmissionService } from './assignment-submission.service';
import { CreateAssignmentSubmissionDto } from './dto/create-assignment-submission.dto';
import { UpdateAssignmentSubmissionDto } from './dto/update-assignment-submission.dto';
import { GradeSubmissionDto } from './dto/grade-submission.dto';

@Controller('admin/assignment-submission')
export class AssignmentSubmissionController {
  constructor(private readonly assignmentSubmissionService: AssignmentSubmissionService) { }

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
    @Query('assignment_id') assignment_id?: string,
    @Query('student_id') student_id?: string,
    @Query('status') status?: string,
  ) {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    return this.assignmentSubmissionService.findAll(pageNum, limitNum, search, assignment_id, student_id, status);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  findOne(@Param('id') id: string) {
    return this.assignmentSubmissionService.findOne(id);
  }

  @Post(':id/grade')
  @HttpCode(HttpStatus.OK)
  async gradeSubmission(
    @Param('id') id: string,
    @Body() gradeSubmissionDto: GradeSubmissionDto,
    @Req() req: any,
  ) {
    return this.assignmentSubmissionService.gradeSubmission(
      id,
      gradeSubmissionDto.answers,
      gradeSubmissionDto.overall_feedback,
    );
  }

  @Patch(':id/grade')
  @HttpCode(HttpStatus.OK)
  async updateGrade(
    @Param('id') id: string,
    @Body() gradeSubmissionDto: GradeSubmissionDto,
  ) {
    return this.assignmentSubmissionService.updateGrade(
      id,
      gradeSubmissionDto.answers,
      gradeSubmissionDto.overall_feedback,
    );
  }
}
