import { Test, TestingModule } from '@nestjs/testing';
import { QuizSubmissionService } from './quiz-submission.service';

describe('QuizSubmissionService', () => {
  let service: QuizSubmissionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [QuizSubmissionService],
    }).compile();

    service = module.get<QuizSubmissionService>(QuizSubmissionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
