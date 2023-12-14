import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';

@Injectable()
export class PicoyplacaService {
  constructor(private readonly httpService: HttpService) {}

  async getPicoyplacaInfo(): Promise<string> {
    const url: string =
      'https://www.pyphoy.com/_next/data/x4EcV0xhXDbd6AZNc4I42/cartagena.json?city=cartagena';

    const response: any = await this.httpService.get(url).toPromise();
    const data = response.data;
    const numbers = data.pageProps.categories[0].data[0].numbers;

    const responseMessage = this.getPyPMessage(numbers);

    return responseMessage;
  }

  private getEmojiNumber(number: number): string {
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

    if (number >= 0 && number <= 9) {
      return numbersEmojis[number];
    } else {
      return '❓'; // Emoji de pregunta si el número no está en el rango esperado
    }
  }

  private getPyPMessage(pYpNumbers: number[]): string {
    const emojisNumPicoYPlaca = pYpNumbers.map(this.getEmojiNumber);

    return pYpNumbers.length === 0
      ? '¡Hoy sin Pico y Placa! 🚗✨'
      : `⚠️ Pico y Placa: ${emojisNumPicoYPlaca.join(
          ', ',
        )} hoy. ¡Planifica tu ruta! 🚗🚦`;
  }
}
