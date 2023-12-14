import { Test, TestingModule } from '@nestjs/testing';
import { PicoyplacaService } from './picoyplaca.service';

describe('PicoyplacaService', () => {
  let service: PicoyplacaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PicoyplacaService],
    }).compile();

    service = module.get<PicoyplacaService>(PicoyplacaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
