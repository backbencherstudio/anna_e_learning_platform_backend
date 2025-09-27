import { Test, TestingModule } from '@nestjs/testing';
import { CardGeneratorService } from './card-generator.service';

describe('CardGeneratorService', () => {
  let service: CardGeneratorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CardGeneratorService],
    }).compile();

    service = module.get<CardGeneratorService>(CardGeneratorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
