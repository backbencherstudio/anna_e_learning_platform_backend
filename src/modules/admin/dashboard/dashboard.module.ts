import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { ScheduleEventModule } from '../schedule-event/schedule-event.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AssignmentModule } from '../assignment/assignment.module';
import { QuizModule } from '../quiz/quiz.module';

@Module({
  imports: [PrismaModule, ScheduleEventModule, AssignmentModule, QuizModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule { }
