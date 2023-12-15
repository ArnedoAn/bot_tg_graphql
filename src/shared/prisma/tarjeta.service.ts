import { PrismaService } from './prisma.service';
import { Tarjeta } from '@prisma/client';
import { Injectable } from '@nestjs/common';

@Injectable()
export class TarjetaService {
  constructor(private readonly prisma: PrismaService) {}

  async createTarjeta(card: Tarjeta) {
    try {
      const result = await this.prisma.tarjeta.create({
        data: card,
      });
      return { success: true, result };
    } catch (err) {
      return { success: false, result: err.message };
    }
  }

  async getAllTarjetas() {
    try {
      const result = await this.prisma.tarjeta.findMany();
      if (!result) throw new Error('No hay tarjetas registradas');
      return { success: true, result };
    } catch (err) {
      return { success: false, result: err.message };
    }
  }

  async getTarjetaWhere(data: any) {
    try {
      const result = await this.prisma.tarjeta.findUnique({
        where: data,
      });
      if (!result) throw new Error('Tarjeta no encontrada');
      return { success: true, result };
    } catch (err) {
      return { success: false, result: err.message };
    }
  }

  async getTarjetasWhere(data: any) {
    try {
      const result = await this.prisma.tarjeta.findMany({
        where: data,
      });
      if (!result) throw new Error('Tarjetas no encontradas');
      return { success: true, result };
    } catch (err) {
      return { success: false, result: err.message };
    }
  }

  async updateTarjeta(id: string, data: any) {
    try {
      const result = await this.prisma.tarjeta.update({
        where: {
          id,
        },
        data,
      });
      return { success: true, result };
    } catch (err) {
      return { success: false, result: err.message };
    }
  }

  async deleteTarjeta(id: string) {
    try {
      const result = await this.prisma.tarjeta.delete({
        where: {
          id,
        },
      });
      return { success: true, result };
    } catch (err) {
      return { success: false, result: err.message };
    }
  }
}
