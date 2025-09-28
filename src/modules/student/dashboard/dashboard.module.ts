import { Module, forwardRef } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { PrismaModule } from '../../../prisma/prisma.module';
import { SeriesModule } from '../series/series.module';

@Module({
  imports: [PrismaModule, SeriesModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule { }
