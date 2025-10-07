import { Module, forwardRef } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { PrismaModule } from '../../../prisma/prisma.module';
import { SeriesModule } from '../series/series.module';
import { ScheduleEventModule } from '../schedule-event/schedule-event.module';
import { MaterialsModule } from '../materials/materials.module';

@Module({
  imports: [PrismaModule, SeriesModule, ScheduleEventModule, MaterialsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule { }
