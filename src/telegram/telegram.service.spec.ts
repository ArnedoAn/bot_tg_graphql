import { Test, TestingModule } from '@nestjs/testing';
import { TelegramService } from './telegram.service';
import { PicoyplacaModule } from '../picoyplaca/picoyplaca.module';
import { TranscaribeModule } from '../transcaribe/transcaribe.module';
import { SharedModule } from '../shared/shared.module';

describe('TelegramService', () => {
  let service: TelegramService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TelegramService],
      imports: [PicoyplacaModule, SharedModule, TranscaribeModule],
    }).compile();

    service = module.get<TelegramService>(TelegramService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
