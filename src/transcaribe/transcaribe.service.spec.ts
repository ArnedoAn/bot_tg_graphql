import { Test, TestingModule } from '@nestjs/testing';
import { TranscaribeService } from './transcaribe.service';

describe('TranscaribeService', () => {
  let service: TranscaribeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TranscaribeService],
    }).compile();

    service = module.get<TranscaribeService>(TranscaribeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
