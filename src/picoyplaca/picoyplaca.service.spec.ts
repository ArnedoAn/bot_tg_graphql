import { Test, TestingModule } from '@nestjs/testing';
import { PicoyplacaService } from './picoyplaca.service';
import { HttpModule, HttpService } from '@nestjs/axios';

describe('PicoyplacaService', () => {
  let service: PicoyplacaService;
  let httpService: HttpService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [HttpModule],
      providers: [PicoyplacaService],
    }).compile();

    service = module.get<PicoyplacaService>(PicoyplacaService);
    httpService = module.get<HttpService>(HttpService);
  });

  describe('getPicoyplacaInfo', () => {
    it('should return Pico y Placa message', async () => {
      // jest
      //   .spyOn(service, 'getPicoyplacaInfo')
      //   .mockResolvedValue('Pico y Placa: 1️⃣, 2️⃣, 3️⃣');
      const result = await service.getPicoyplacaInfo();
      expect(result).toContain('Pico y Placa');
      // expect(result).toContain('1️⃣, 2️⃣, 3️⃣');
    });

    // it('should handle error and return error message', async () => {
    //   jest
    //     .spyOn(service, 'getPicoyplacaInfo')
    //     .mockRejectedValue(new Error('Test error'));

    //   const result = await service.getPicoyplacaInfo();

    //   expect(result).toContain('Pico y Placa');
    // });
  });

  // describe('getScrapedPicoyplacaInfo', () => {
  //   it('should return scraped numbers', async () => {

  //     const mockResponse: AxiosResponse = {
  //       data: 'Mock scraped data',
  //       status: 200,
  //       statusText: 'OK',
  //       headers: {},
  //       config: {
  //         /* create axiosResponse Mock config */
  //         baseURL: 'https://example.com',
  //         method: 'GET',
  //         timeout: 5000,
  //         headers: {} as AxiosHeaders, // Use 'AxiosHeaders' type instead of '{}'
  //         // Add more config properties as needed
  //       },
  //     };
  //     jest.spyOn(httpService, 'get').mockReturnValue(of(mockResponse));

  //     const result = await service.getScrapedPicoyplacaInfo();

  //     expect(result).toEqual([
  //       /* Expected scraped numbers */
  //     ]);
  //   });

  //   it('should handle error and return empty array', async () => {
  //     jest.spyOn(httpService, 'get').mockRejectedValue(new Error('Test error'));

  //     const result = await service.getScrapedPicoyplacaInfo();

  //     expect(result).toEqual([]);
  //   });
  //});

  // Add more test cases as needed
});
