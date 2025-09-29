import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { ScheduleEventModule } from '../schedule-event/schedule-event.module';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule, ScheduleEventModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule { }
