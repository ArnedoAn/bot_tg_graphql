import { Test, TestingModule } from '@nestjs/testing';
import { TranscaribeService } from './transcaribe.service';
import { PrismaModule } from 'src/shared/prisma/prisma.module';
import { SharedModule } from 'src/shared/shared.module';

describe('TranscaribeService', () => {
  let service: TranscaribeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TranscaribeService],
      imports: [PrismaModule, SharedModule],
    }).compile();

    service = module.get<TranscaribeService>(TranscaribeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
