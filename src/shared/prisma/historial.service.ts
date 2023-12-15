import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class HistorialService {
  constructor(private readonly prisma: PrismaService) {}

  async createHistorial(data: any) {
    try {
      const result = await this.prisma.historial.create({ data });
      return { success: true, result };
    } catch (err) {
      return { success: false, result: err };
    }
  }

  async deleteHistorialWhere(data: any) {
    try {
      const result = await this.prisma.historial.delete({
        where: data,
      });
      return { success: true, result };
    } catch (err) {
      return { success: false, result: err };
    }
  }

  async getHistorialWhere(data: any) {
    try {
      const result = await this.prisma.historial.findMany({
        where: data,
      });
      return { success: true, result };
    } catch (err) {
      return { success: false, result: err };
    }
  }
}
