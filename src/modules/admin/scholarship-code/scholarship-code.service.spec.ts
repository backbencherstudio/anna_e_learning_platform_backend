import { Test, TestingModule } from '@nestjs/testing';
import { ScholarshipCodeService } from './scholarship-code.service';

describe('ScholarshipCodeService', () => {
  let service: ScholarshipCodeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ScholarshipCodeService],
    }).compile();

    service = module.get<ScholarshipCodeService>(ScholarshipCodeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
