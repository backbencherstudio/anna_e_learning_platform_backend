import { Module } from '@nestjs/common';
import { QuizService } from './quiz.service';
import { QuizController } from './quiz.controller';
import { QuizSubmissionService } from './quiz-submission.service';
import { QuizSubmissionController, StudentQuizSubmissionController } from './quiz-submission.controller';
import { PrismaModule } from '../../../prisma/prisma.module';
import { QueueModule } from '../../queue/queue.module';

@Module({
  imports: [PrismaModule, QueueModule],
  controllers: [QuizController, QuizSubmissionController, StudentQuizSubmissionController],
  providers: [QuizService, QuizSubmissionService],
  exports: [QuizService, QuizSubmissionService],
})
export class QuizModule { }
