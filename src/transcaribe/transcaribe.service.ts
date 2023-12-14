import { Injectable } from '@nestjs/common';
import { TarjetaService } from 'src/shared/prisma/tarjeta.service';
import {
  CONSTANTS as Const,
  setUTCDate as dateFormat,
} from './helpers/operations.helper';
import { Tarjeta } from '@prisma/client';

@Injectable()
export class TranscaribeService {
  private readonly TARIFA: number;
  constructor(private readonly tarjetaService: TarjetaService) {
    this.TARIFA = Const.tarifa;
  }

  async operation(count: number, id: string): Promise<object> {
    try {
      const total = count * this.TARIFA;
      const cardBalance = await this.getCardBalance(id);
      const currentBalance = cardBalance.saldoDisponible + total;
      const result = await this.tarjetaService.updateTarjeta(id, {
        saldoDisponible: currentBalance,
      });
      if (!result.success) throw new Error(result.result);
      return { success: true, result: result.result };
    } catch (err) {
      return { success: false, result: err };
    }
  }

  private async getCardBalance(id: string): Promise<Tarjeta> {
    try {
      const result = await this.tarjetaService.getTarjetaWhere({ id });
      if (!result.success) throw new Error(result.result);
      return result.result;
    } catch (err) {
      console.log(err);
      return null;
    }
  }

  async getTarifa(): Promise<number> {
    return Const.tarifa;
  }

  async getFecha(): Promise<Date> {
    return dateFormat(new Date());
  }
}
