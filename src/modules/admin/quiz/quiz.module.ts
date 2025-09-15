import { Module } from '@nestjs/common';
import { QuizService } from './quiz.service';
import { QuizController } from './quiz.controller';
import { QuizSubmissionService } from './quiz-submission.service';
import { QuizSubmissionController, StudentQuizSubmissionController } from './quiz-submission.controller';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [QuizController, QuizSubmissionController, StudentQuizSubmissionController],
  providers: [QuizService, QuizSubmissionService],
  exports: [QuizService, QuizSubmissionService],
})
export class QuizModule { }
