import { Test, TestingModule } from '@nestjs/testing';
import { QuizSubmissionController } from './quiz-submission.controller';
import { QuizSubmissionService } from './quiz-submission.service';

describe('QuizSubmissionController', () => {
  let controller: QuizSubmissionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QuizSubmissionController],
      providers: [QuizSubmissionService],
    }).compile();

    controller = module.get<QuizSubmissionController>(QuizSubmissionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
