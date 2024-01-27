import { PrismaService } from './prisma.service';
import { Vehicle } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { Result } from '../interfaces/result.interface';

@Injectable()
export class VehicleService {
  constructor(private readonly prisma: PrismaService) {}

  async createVehicle(vehicle: Vehicle): Promise<Result> {
    try {
      const result = await this.prisma.vehicle.create({
        data: {
          lastDigit: vehicle.lastDigit,
          name: vehicle.name,
          userId: vehicle.userId,
        },
      });
      return { success: true, result };
    } catch (err) {
      console.error(err);
      return { success: false, result: err.message || 'Error en Prisma (Dev)' };
    }
  }

  async getAllVehicles(): Promise<Result> {
    try {
      const result = await this.prisma.vehicle.findMany();
      if (!result) throw new Error('No hay vehiculos registrados');
      return { success: true, result };
    } catch (err) {
      console.error(err);
      return { success: false, result: err.message || 'Error en Prisma (Dev)' };
    }
  }

  async getVehicleWhere(data: any): Promise<Result> {
    try {
      const result = await this.prisma.vehicle.findUnique({
        where: data,
      });
      if (!result) throw new Error('Vehiculo no encontrado');
      return { success: true, result };
    } catch (err) {
      return { success: false, result: err.message || 'Error en Prisma (Dev)' };
    }
  }

  async getVehiclesWhere(data: any): Promise<Result> {
    try {
      const result = await this.prisma.vehicle.findMany({
        where: data,
      });
      if (!result) throw new Error('Vehiculos no encontrados');
      return { success: true, result };
    } catch (err) {
      return { success: false, result: err.message || 'Error en Prisma (Dev)' };
    }
  }

  async updateVehicle(id: number, data: any): Promise<Result> {
    try {
      const result = await this.prisma.vehicle.update({
        where: {
          id,
        },
        data,
      });
      if (!result) throw new Error('Vehiculo no encontrado');
      return { success: true, result };
    } catch (err) {
      return { success: false, result: err.message || 'Error en Prisma (Dev)' };
    }
  }

  async deleteVehicle(id: number): Promise<Result> {
    try {
      const result = await this.prisma.vehicle.delete({
        where: {
          id,
        },
      });
      if (!result) throw new Error('Vehiculo no encontrado');
      return { success: true, result };
    } catch (err) {
      return { success: false, result: 'Error en Prisma (Dev)' };
    }
  }
}
