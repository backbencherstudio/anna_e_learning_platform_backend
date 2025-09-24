import { Module } from '@nestjs/common';
import { AssignmentSubmissionService } from './assignment-submission.service';
import { AssignmentSubmissionController } from './assignment-submission.controller';

@Module({
  controllers: [AssignmentSubmissionController],
  providers: [AssignmentSubmissionService],
})
export class AssignmentSubmissionModule {}
