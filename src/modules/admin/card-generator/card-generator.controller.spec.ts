import { Test, TestingModule } from '@nestjs/testing';
import { CardGeneratorController } from './card-generator.controller';
import { CardGeneratorService } from './card-generator.service';

describe('CardGeneratorController', () => {
  let controller: CardGeneratorController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CardGeneratorController],
      providers: [CardGeneratorService],
    }).compile();

    controller = module.get<CardGeneratorController>(CardGeneratorController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
