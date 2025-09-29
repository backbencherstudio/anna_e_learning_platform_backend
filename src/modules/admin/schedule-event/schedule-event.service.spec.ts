import { Test, TestingModule } from '@nestjs/testing';
import { ScheduleEventService } from './schedule-event.service';

describe('ScheduleEventService', () => {
  let service: ScheduleEventService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ScheduleEventService],
    }).compile();

    service = module.get<ScheduleEventService>(ScheduleEventService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
