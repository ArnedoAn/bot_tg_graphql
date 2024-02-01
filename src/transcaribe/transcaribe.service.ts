import { Injectable } from '@nestjs/common';
import { TarjetaService } from '../shared/prisma/tarjeta.service';
import { CONSTANTS as Const } from './helpers/operations.helper';
import { Result } from '../shared/interfaces/result.interface';
import { HttpService } from '@nestjs/axios';
import { CardData, Transaction } from './interfaces/api.interfaces';
import { ApiRequest } from './interfaces/apiCall.interface';

@Injectable()
export class TranscaribeService {
  private readonly TARIFA: number;
  constructor(
    private readonly tarjetaService: TarjetaService,
    private readonly httpService: HttpService,
  ) {
    this.TARIFA = Const.tarifa;
  }

  private convertNumbersToEmojis(number: number): string {
    const numberEmojis = [
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
    return number
      .toString()
      .split('')
      .map((digit) => numberEmojis[parseInt(digit, 10)])
      .join('');
  }

  private createBalanceMessage(balance: string): string {
    const balanceEmojis = this.convertNumbersToEmojis(parseInt(balance, 10));
    return `🌟 Saldo actual: $${balanceEmojis} 💰 ¡Listo para seguir viajando! 🚌`;
  }

  async userExists(chatId: string): Promise<boolean> {
    try {
      const result = await this.tarjetaService.getTarjetaWhere({ id: chatId });
      if (!result.success) throw new Error('Tarjeta no encontrada');
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  async getBalance(id: string): Promise<Result> {
    try {
      const apiData = await this.getCardInfo(id);
      if (!apiData) throw new Error('Tarjeta no encontrada');
      const message = this.createBalanceMessage(apiData.saldo);
      return { success: true, result: message };
    } catch (e) {
      console.error(e);
      return { success: false, result: e.message };
    }
  }

  private generateTransactionMessages(transaction: Transaction): string {
    const isAbono = transaction.MONTO_ABONO > 0;
    const action = isAbono ? '💰 Agregado' : '💸 Gastado';
    const amount = isAbono
      ? transaction.MONTO_ABONO
      : transaction.MONTO_DESCUENTO;

    return `
    📅 Fecha: ${transaction.fecha_trx}
    🚉 Estación: ${transaction.estacion}
    💳 Tipo de Transacción: ${transaction.nombreTRX}
    ${action}: ${amount}`;
  }

  async getHistory(id: string): Promise<Result> {
    try {
      const apiData = await this.getCardInfo(id);
      if (!apiData) throw new Error('Tarjeta no encontrada');
      const messages = apiData.listaTransacciones.map((transaction) =>
        this.generateTransactionMessages(transaction),
      );
      return { success: true, result: messages };
    } catch (e) {
      console.error(e);
      return { success: false, result: e.message };
    }
  }

  async createCard(
    id: string,
    cardId: string,
    apiKey: string,
  ): Promise<Result> {
    try {
      const result = await this.tarjetaService.createTarjeta({
        id,
        cardId,
        apiCardId: apiKey,
      });
      if (!result) throw new Error('Tarjeta no encontrada');
      return { success: true, result };
    } catch (e) {
      console.error(e);
      return { success: false, result: e.message };
    }
  }

  async getCardInfo(id: string): Promise<CardData> {
    try {
      const result = await this.getCardApiInfo(id);
      if (!result) throw new Error('Tarjeta no encontrada');
      const url =
        'http://recaudo.sondapay.com/recaudowsrest/producto/consultaTrx';
      const data = result;
      data.numeroDias = 10;
      const apiResponse = await this.httpService.post(url, data).toPromise();
      return apiResponse.data;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  private async getCardApiInfo(id: string): Promise<ApiRequest> {
    try {
      const result = await this.tarjetaService.getInfoTarjetaFromApi(id);
      if (!result.success) throw new Error('Tarjeta no encontrada');
      return result.result;
    } catch (e) {
      console.warn(e);
      return null;
    }
  }
}
