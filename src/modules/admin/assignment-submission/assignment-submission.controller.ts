import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { AssignmentSubmissionService } from './assignment-submission.service';
import { CreateAssignmentSubmissionDto } from './dto/create-assignment-submission.dto';
import { UpdateAssignmentSubmissionDto } from './dto/update-assignment-submission.dto';

@Controller('assignment-submission')
export class AssignmentSubmissionController {
  constructor(private readonly assignmentSubmissionService: AssignmentSubmissionService) {}

  @Post()
  create(@Body() createAssignmentSubmissionDto: CreateAssignmentSubmissionDto) {
    return this.assignmentSubmissionService.create(createAssignmentSubmissionDto);
  }

  @Get()
  findAll() {
    return this.assignmentSubmissionService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.assignmentSubmissionService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateAssignmentSubmissionDto: UpdateAssignmentSubmissionDto) {
    return this.assignmentSubmissionService.update(+id, updateAssignmentSubmissionDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.assignmentSubmissionService.remove(+id);
  }
}
