import { Test, TestingModule } from '@nestjs/testing';
import { StudentFileController } from './student-file.controller';
import { StudentFileService } from './student-file.service';

describe('StudentFileController', () => {
  let controller: StudentFileController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StudentFileController],
      providers: [StudentFileService],
    }).compile();

    controller = module.get<StudentFileController>(StudentFileController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
