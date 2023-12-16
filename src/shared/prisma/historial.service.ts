import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { Result } from '../interfaces/result.interface';

@Injectable()
export class HistorialService {
  constructor(private readonly prisma: PrismaService) {}

  async createHistorial(data: any): Promise<Result> {
    try {
      const result = await this.prisma.historial.create({ data });
      return { success: true, result };
    } catch (err) {
      return { success: false, result: 'Error en Prisma (Dev)' };
    }
  }

  async deleteHistorialWhere(data: any): Promise<Result> {
    try {
      const result = await this.prisma.historial.deleteMany({
        where: data,
      });
      return { success: true, result };
    } catch (err) {
      console.error(err);
      return { success: false, result: 'Error en Prisma (Dev)' };
    }
  }

  async getHistorialWhere(data: any): Promise<Result> {
    try {
      const result = await this.prisma.historial.findMany({
        where: data,
      });
      if (result.length === 0) throw new Error('No se encontraron registros');
      return { success: true, result };
    } catch (err) {
      return { success: false, result: err || 'Error en Prisma (Dev)' };
    }
  }
}
