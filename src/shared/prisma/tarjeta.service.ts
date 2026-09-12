import { PrismaService } from './prisma.service';
import { Tarjeta } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { Result } from '../interfaces/result.interface';

@Injectable()
export class TarjetaService {
  constructor(private readonly prisma: PrismaService) {}

  async createTarjeta(card: Tarjeta): Promise<Result> {
    try {
      const result = await this.prisma.tarjeta.create({
        data: card,
      });
      return { success: true, result };
    } catch (err) {
      return { success: false, result: 'Error en Prisma (Dev)' };
    }
  }

  async getInfoTarjetaFromApi(id: string): Promise<Result> {
    try {
      const result: any = await this.prisma
        .$queryRaw`SELECT api_card_call(${id})`;
      if (!result) throw new Error('Tarjeta no encontrada');
      return { success: true, result: result[0].api_card_call };
    } catch (err) {
      console.error(err);
      return { success: false, result: 'Error en Prisma (Dev)' };
    }
  }

  async getTarjetaWhere(data: any): Promise<Result> {
    try {
      const result = await this.prisma.tarjeta.findUnique({
        where: data,
      });
      if (!result) throw new Error('Tarjeta no encontrada');
      return { success: true, result };
    } catch (err) {
      return { success: false, result: err.message || 'Error en Prisma (Dev)' };
    }
  }
}
