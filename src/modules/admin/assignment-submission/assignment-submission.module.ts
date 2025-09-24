import { Module } from '@nestjs/common';
import { AssignmentSubmissionService } from './assignment-submission.service';
import { AssignmentSubmissionController } from './assignment-submission.controller';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AssignmentSubmissionController],
  providers: [AssignmentSubmissionService],
})
export class AssignmentSubmissionModule { }
