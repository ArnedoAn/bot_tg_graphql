import { Test, TestingModule } from '@nestjs/testing';
import { TranscaribeHandler } from './transcaribe.handler';

describe('TranscaribeHandlerService', () => {
  let service: TranscaribeHandler;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TranscaribeHandler],
    }).compile();

    service = module.get<TranscaribeHandler>(TranscaribeHandler);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
