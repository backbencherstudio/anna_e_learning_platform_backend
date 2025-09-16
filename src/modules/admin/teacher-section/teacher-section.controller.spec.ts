import { Test, TestingModule } from '@nestjs/testing';
import { TeacherSectionController } from './teacher-section.controller';
import { TeacherSectionService } from './teacher-section.service';

describe('TeacherSectionController', () => {
  let controller: TeacherSectionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TeacherSectionController],
      providers: [TeacherSectionService],
    }).compile();

    controller = module.get<TeacherSectionController>(TeacherSectionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
