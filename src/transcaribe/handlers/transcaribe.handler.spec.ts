import { Test, TestingModule } from '@nestjs/testing';
import { TranscaribeHandlerService } from './transcaribe.handler';

describe('TranscaribeHandlerService', () => {
  let service: TranscaribeHandlerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TranscaribeHandlerService],
    }).compile();

    service = module.get<TranscaribeHandlerService>(TranscaribeHandlerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
