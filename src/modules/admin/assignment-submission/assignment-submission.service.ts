import { Injectable } from '@nestjs/common';
import { CreateAssignmentSubmissionDto } from './dto/create-assignment-submission.dto';
import { UpdateAssignmentSubmissionDto } from './dto/update-assignment-submission.dto';

@Injectable()
export class AssignmentSubmissionService {
  create(createAssignmentSubmissionDto: CreateAssignmentSubmissionDto) {
    return 'This action adds a new assignmentSubmission';
  }

  findAll() {
    return `This action returns all assignmentSubmission`;
  }

  findOne(id: number) {
    return `This action returns a #${id} assignmentSubmission`;
  }

  update(id: number, updateAssignmentSubmissionDto: UpdateAssignmentSubmissionDto) {
    return `This action updates a #${id} assignmentSubmission`;
  }

  remove(id: number) {
    return `This action removes a #${id} assignmentSubmission`;
  }
}
