import { Test, TestingModule } from '@nestjs/testing';
import { AssignmentSubmissionController } from './assignment-submission.controller';
import { AssignmentSubmissionService } from './assignment-submission.service';

describe('AssignmentSubmissionController', () => {
  let controller: AssignmentSubmissionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssignmentSubmissionController],
      providers: [AssignmentSubmissionService],
    }).compile();

    controller = module.get<AssignmentSubmissionController>(AssignmentSubmissionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
