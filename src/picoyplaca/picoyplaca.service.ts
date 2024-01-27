import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { VehicleService } from 'src/shared/prisma/vehicle.service';

import * as cheerio from 'cheerio';
import { Vehicle } from '@prisma/client';

@Injectable()
export class PicoyplacaService {
  constructor(
    private readonly httpService: HttpService,
    private readonly vehicleService: VehicleService,
  ) {}

  async getPicoyplacaInfo(): Promise<string> {
    try {
      const numbers = await this.getScrapedPicoyplacaInfo();

      const responseMessage = this.getPyPMessage(numbers);

      return responseMessage;
    } catch (e) {
      console.error(e.message);
      await this.getScrapedPicoyplacaInfo();
      return 'Error al obtener información de Pico y Placa';
    }
  }

  private async getScrapedPicoyplacaInfo(): Promise<number[]> {
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

  private getPyPMessage(pYpNumbers: number[]): string {
    const emojisNumPicoYPlaca = pYpNumbers.map(this.getEmojiNumber);

    return pYpNumbers.length === 0 || pYpNumbers.includes(NaN)
      ? '¡Hoy sin Pico y Placa! 🚗'
      : `⚠️ Pico y Placa: ${emojisNumPicoYPlaca.join(', ')} hoy.`;
  }

  async addVehicle(vehicle: any): Promise<string> {
    try {
      const response = await this.vehicleService.createVehicle({
        id: 1,
        lastDigit: vehicle.lastDigit,
        name: vehicle.name,
        userId: vehicle.userId,
      });
      if (response.success) {
        return `Vehículo ${vehicle.name} agregado correctamente.`;
      } else {
        console.error(response.result);
        return 'No se ha podido agregar el vehículo.';
      }
    } catch (e) {
      console.error(e);
      return 'Error al agregar el vehículo.';
    }
  }

  async vehicleExist(vehicleName: string, userId: number): Promise<boolean> {
    try {
      const response = await this.vehicleService.getVehicleWhere({
        name: vehicleName,
        userId,
      });

      if (!response.success || response.result === null) {
        return true;
      }
      return true;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  async getVehiclesByUser(userId: number): Promise<string[]> {
    try {
      const response = await this.vehicleService.getVehiclesWhere({
        userId: userId.toString(),
      });

      if (
        !response.success ||
        response.result === null ||
        response.result.length === 0
      ) {
        return null;
      }

      const vehicles = response.result.map((vehicle: Vehicle) => vehicle.name);
      return vehicles;
    } catch (e) {
      console.error(e);
      return null;
    }
  }
}
