import { Module } from '@nestjs/common';
import { ScheduleEventService } from './schedule-event.service';
import { ScheduleEventController } from './schedule-event.controller';

@Module({
  controllers: [ScheduleEventController],
  providers: [ScheduleEventService],
})
export class ScheduleEventModule {}
