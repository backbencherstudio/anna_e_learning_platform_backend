import { Test, TestingModule } from '@nestjs/testing';
import { ScheduleEventController } from './schedule-event.controller';
import { ScheduleEventService } from './schedule-event.service';

describe('ScheduleEventController', () => {
  let controller: ScheduleEventController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScheduleEventController],
      providers: [ScheduleEventService],
    }).compile();

    controller = module.get<ScheduleEventController>(ScheduleEventController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
