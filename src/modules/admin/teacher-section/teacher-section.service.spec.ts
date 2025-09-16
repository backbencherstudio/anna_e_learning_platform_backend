import { Test, TestingModule } from '@nestjs/testing';
import { TeacherSectionService } from './teacher-section.service';

describe('TeacherSectionService', () => {
  let service: TeacherSectionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TeacherSectionService],
    }).compile();

    service = module.get<TeacherSectionService>(TeacherSectionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
