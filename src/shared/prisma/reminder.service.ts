import { PrismaService } from './prisma.service';
import { Reminder } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { Result } from '../interfaces/result.interface';

@Injectable()
export class ReminderService {
  constructor(private readonly prisma: PrismaService) {}

  async createReminder(reminder: Reminder): Promise<Result> {
    try {
      const result = await this.prisma.reminder.create({
        data: reminder,
      });
      return { success: true, result };
    } catch (err) {
      return { success: false, result: 'Error en Prisma (Dev)' };
    }
  }

  async getAllReminders(): Promise<Result> {
    try {
      const result = await this.prisma.reminder.findMany();
      if (!result) throw new Error('No hay recordatorios registrados');
      return { success: true, result };
    } catch (err) {
      return { success: false, result: err.message || 'Error en Prisma (Dev)' };
    }
  }

  async getReminderWhere(data: any): Promise<Result> {
    try {
      const result = await this.prisma.reminder.findUnique({
        where: data,
      });
      if (!result) throw new Error('Recordatorio no encontrado');
      return { success: true, result };
    } catch (err) {
      return { success: false, result: err.message || 'Error en Prisma (Dev)' };
    }
  }

  async getRemindersWhere(data: any): Promise<Result> {
    try {
      const result = await this.prisma.reminder.findMany({
        where: data,
      });
      if (!result) throw new Error('Recordatorios no encontrados');
      return { success: true, result };
    } catch (err) {
      return { success: false, result: err.message || 'Error en Prisma (Dev)' };
    }
  }

  async updateReminder(id: number, data: any): Promise<Result> {
    try {
      const result = await this.prisma.reminder.update({
        where: {
          id,
        },
        data,
      });
      if (!result) throw new Error('Recordatorio no encontrado');
      return { success: true, result };
    } catch (err) {
      return { success: false, result: err.message || 'Error en Prisma (Dev)' };
    }
  }
}
