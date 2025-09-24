import { PartialType } from '@nestjs/swagger';
import { CreateAssignmentSubmissionDto } from './create-assignment-submission.dto';

export class UpdateAssignmentSubmissionDto extends PartialType(CreateAssignmentSubmissionDto) {}
