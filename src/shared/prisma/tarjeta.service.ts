import { PrismaService } from './prisma.service';
import { Tarjeta } from '@prisma/client';
import { Injectable } from '@nestjs/common';

@Injectable()
export class TarjetaService {
  constructor(private readonly prisma: PrismaService) {}

  async createTajerta(card: Tarjeta) {
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
      return { success: true, result };
    } catch (err) {
      return { success: false, result: err.message };
    }
  }

  async getTarjetaWhere(data: any) {
    try {
      const result = await this.prisma.tarjeta.findMany({
        where: data,
      });
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
