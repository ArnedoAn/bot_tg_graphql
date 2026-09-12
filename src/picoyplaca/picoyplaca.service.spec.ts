import axios from 'axios';
import { Test, TestingModule } from '@nestjs/testing';
import { PicoyplacaService } from './picoyplaca.service';
import { VehicleService } from '../shared/prisma/vehicle.service';

describe('PicoyplacaService', () => {
  let service: PicoyplacaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PicoyplacaService,
        { provide: VehicleService, useValue: {} },
      ],
    }).compile();

    service = module.get<PicoyplacaService>(PicoyplacaService);
  });

  describe('getPicoyplacaInfo', () => {
    it('should return Pico y Placa message', async () => {
      jest.spyOn(axios, 'get').mockRejectedValue(new Error('offline'));

      const result = await service.getPicoyplacaInfo();

      expect(result).toContain('Pico y Placa');
    });
  });
});
