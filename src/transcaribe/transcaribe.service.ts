import { Injectable } from '@nestjs/common';
import { TarjetaService } from 'src/shared/prisma/tarjeta.service';
import { HistorialService } from 'src/shared/prisma/historial.service';
import {
  CONSTANTS as Const,
  setUTCDate as dateFormat,
} from './helpers/operations.helper';
import { Tarjeta } from '@prisma/client';
import { Result } from 'src/shared/interfaces/result.interface';

@Injectable()
export class TranscaribeService {
  private readonly TARIFA: number;
  constructor(
    private readonly tarjetaService: TarjetaService,
    private readonly historialService: HistorialService,
  ) {
    this.TARIFA = Const.tarifa;
  }

  // Add or subtract money from card
  async cardOperation(count: number, id: string): Promise<Result> {
    try {
      const total = count * this.TARIFA;
      const cardBalance = await this.getCardBalance(id);
      if (!cardBalance) throw new Error('Tarjeta no encontrada');
      const currentBalance = cardBalance.saldoDisponible + total;
      const result = await this.tarjetaService.updateTarjeta(id, {
        saldoDisponible: currentBalance,
      });
      const truncBalance = Math.trunc(
        result.result.saldoDisponible / this.TARIFA,
      );
      if (!result.success) throw new Error(result.result);
      return { success: true, result: truncBalance };
    } catch (err) {
      return { success: false, result: err };
    }
  }

  async newUserCard(id: string, balance: number = 0): Promise<Result> {
    try {
      const result = await this.tarjetaService.createTarjeta({
        id,
        saldoDisponible: balance,
      });
      if (!result.success) throw new Error(result.result);
      return { success: true, result: result.result };
    } catch (err) {
      return { success: false, result: err };
    }
  }

  async setBalance(id: string, balance: number): Promise<Result> {
    try {
      const result = await this.tarjetaService.updateTarjeta(id, {
        saldoDisponible: balance,
      });
      if (!result.success) throw new Error(result.result);
      return { success: true, result: result.result };
    } catch (err) {
      return { success: false, result: err };
    }
  }

  async deleteCard(id: string): Promise<Result> {
    try {
      const result = await this.tarjetaService.deleteTarjeta(id);
      if (!result.success) throw new Error(result.result);
      return { success: true, result: result.result };
    } catch (err) {
      return { success: false, result: err };
    }
  }

  async registerCardOperation(count: number, id: string): Promise<Result> {
    try {
      const result = await this.historialService.createHistorial({
        tarjetaId: id,
        fecha: dateFormat(new Date()),
        monto: count * this.TARIFA,
      });
      if (!result.success) throw new Error(result.result);
      return { success: true, result: result.result };
    } catch (err) {
      return { success: false, result: err };
    }
  }

  async getCardHistory(id: string): Promise<Result> {
    try {
      const result = await this.historialService.getHistorialWhere({
        tarjetaId: id,
      });
      if (!result.success) throw new Error(result.result);
      return { success: true, result: result.result };
    } catch (err) {
      return { success: false, result: err };
    }
  }

  async deleteCardHistory(id: string): Promise<Result> {
    try {
      const result = await this.historialService.deleteHistorialWhere({
        tarjetaId: id,
      });
      if (!result.success) throw new Error(result.result);
      return { success: true, result: result.result };
    } catch (err) {
      return { success: false, result: err };
    }
  }

  async getCardBalance(id: string): Promise<Tarjeta> {
    try {
      const result = await this.tarjetaService.getTarjetaWhere({ id });
      if (!result.success) throw new Error(result.result);
      return result.result;
    } catch (err) {
      return null;
    }
  }
}
