import { Test, TestingModule } from '@nestjs/testing';
import { ScholarshipCodeController } from './scholarship-code.controller';
import { ScholarshipCodeService } from './scholarship-code.service';

describe('ScholarshipCodeController', () => {
  let controller: ScholarshipCodeController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScholarshipCodeController],
      providers: [ScholarshipCodeService],
    }).compile();

    controller = module.get<ScholarshipCodeController>(ScholarshipCodeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
