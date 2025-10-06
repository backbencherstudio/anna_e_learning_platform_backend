import { Module } from "@nestjs/common";
import { ScheduleEventController } from "./schedule-event.controller";
import { ScheduleEventService } from "./schedule-event.service";
import { PrismaModule } from "../../../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [ScheduleEventController],
  providers: [ScheduleEventService],
  exports: [ScheduleEventService],
})
export class ScheduleEventModule {}
