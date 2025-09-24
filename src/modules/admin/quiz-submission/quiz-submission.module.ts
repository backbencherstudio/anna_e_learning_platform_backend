import { Module } from '@nestjs/common';
import { QuizSubmissionService } from './quiz-submission.service';
import { QuizSubmissionController } from './quiz-submission.controller';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [QuizSubmissionController],
  providers: [QuizSubmissionService],
})
export class QuizSubmissionModule { }
