import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import * as cheerio from 'cheerio';

@Injectable()
export class PicoyplacaService {
  constructor(private readonly httpService: HttpService) {}

  async getPicoyplacaInfo(): Promise<string> {
    try {
      // const url: string =
      //   'https://www.pyphoy.com/_next/data/x4EcV0xhXDbd6AZNc4I42/cartagena.json?city=cartagena';

      // const response: any = await this.httpService.get(url).toPromise();
      // const data = response.data;
      // const numbers = data.pageProps.categories[0].data[0].numbers;

      const numbers = await this.getScrapedPicoyplacaInfo();

      const responseMessage = this.getPyPMessage(numbers);

      return responseMessage;
    } catch (e) {
      console.log(e.message);
      await this.getScrapedPicoyplacaInfo();
      return 'Error al obtener información de Pico y Placa';
    }
  }

  private async getScrapedPicoyplacaInfo(): Promise<Number[]> {
    try {
      const url: string = 'https://www.pyphoy.com/cartagena/particulares';
      const response = await this.httpService.get(url).toPromise();
      const $ = cheerio.load(response.data);
      const numbersText = $(
        '.sc-4e15c505-0.juuwzm.sc-9e56e907-2.jGMtpa',
      ).text();
      const numbers = numbersText.split('-').map((num) => parseInt(num));
      return numbers;
    } catch (e) {
      console.log(e);
      return [];
    }
  }

  private getEmojiNumber(num: number): string {
    const numbersEmojis = [
      '0️⃣',
      '1️⃣',
      '2️⃣',
      '3️⃣',
      '4️⃣',
      '5️⃣',
      '6️⃣',
      '7️⃣',
      '8️⃣',
      '9️⃣',
    ];

    if (num >= 0 && num <= 9) {
      return numbersEmojis[num];
    } else {
      return '❓'; // Emoji de pregunta si el número no está en el rango esperado
    }
  }

  private getPyPMessage(pYpNumbers: Number[]): string {
    const emojisNumPicoYPlaca = pYpNumbers.map(this.getEmojiNumber);

    return pYpNumbers.length === 0
      ? '¡Hoy sin Pico y Placa! 🚗'
      : `⚠️ Pico y Placa: ${emojisNumPicoYPlaca.join(', ')} hoy.`;
  }
}
