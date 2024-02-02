import { PrismaService } from './prisma.service';
import { Tarjeta } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { Result } from '../interfaces/result.interface';
import { ApiRequest } from '../../transcaribe/interfaces/apiCall.interface';

@Injectable()
export class TarjetaService {
  constructor(private readonly prisma: PrismaService) {}

  async createTarjeta(card: Tarjeta): Promise<Result<Tarjeta | string>> {
    try {
      const result = await this.prisma.tarjeta.create({
        data: card,
      });
      return { success: true, result };
    } catch (err) {
      return { success: false, result: 'Error en Prisma (Dev)' };
    }
  }

  async getInfoTarjetaFromApi(
    id: string,
  ): Promise<Result<ApiRequest | string>> {
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

  async getAllTarjetas(): Promise<Result<Tarjeta[] | string>> {
    try {
      const result = await this.prisma.tarjeta.findMany();
      if (!result) throw new Error('No hay tarjetas registradas');
      return { success: true, result };
    } catch (err) {
      return { success: false, result: err.message || 'Error en Prisma (Dev)' };
    }
  }

  async getTarjetaWhere(data: any): Promise<Result<Tarjeta | string>> {
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

  async getTarjetasWhere(data: any): Promise<Result<Tarjeta[] | string>> {
    try {
      const result = await this.prisma.tarjeta.findMany({
        where: data,
      });
      if (!result) throw new Error('Tarjetas no encontradas');
      return { success: true, result };
    } catch (err) {
      return { success: false, result: err.message || 'Error en Prisma (Dev)' };
    }
  }

  async updateTarjeta(
    id: string,
    data: any,
  ): Promise<Result<Tarjeta | string>> {
    try {
      const result = await this.prisma.tarjeta.update({
        where: {
          id,
        },
        data,
      });
      return { success: true, result };
    } catch (err) {
      return { success: false, result: 'Error en Prisma (Dev)' };
    }
  }

  async deleteTarjeta(id: string): Promise<Result<Tarjeta | string>> {
    try {
      const result = await this.prisma.tarjeta.delete({
        where: {
          id,
        },
      });
      return { success: true, result };
    } catch (err) {
      return { success: false, result: 'Error en Prisma (Dev)' };
    }
  }
}
