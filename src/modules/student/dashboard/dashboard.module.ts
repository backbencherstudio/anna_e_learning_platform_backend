import { Module, forwardRef } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { PrismaModule } from '../../../prisma/prisma.module';
import { SeriesModule } from '../series/series.module';
import { ScheduleEventModule } from '../schedule-event/schedule-event.module';

@Module({
  imports: [PrismaModule, SeriesModule, ScheduleEventModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule { }
