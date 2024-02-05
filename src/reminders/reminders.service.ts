import { Injectable } from '@nestjs/common';
import { ReminderService } from '../shared/prisma/reminder.service';
import * as schedule from 'node-schedule';
import moment from 'moment';
import { Reminder } from '@prisma/client';
import { ReminderHandler } from './handlers/reminders.handler';

@Injectable()
export class RemindersService {
  constructor(
    private readonly reminderService: ReminderService,
    private readonly reminderHandler: ReminderHandler,
  ) {}

  async createReminder(reminder: Reminder): Promise<boolean> {
    try {
      const result = await this.reminderService.createReminder(reminder);
      if (result.success && typeof result.result !== 'string') {
        const { id, date } = result.result;
        this.scheduleNotification(id, date);
      }
      return result.success;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  private scheduleNotification(reminderId: number, reminderDate: Date) {
    schedule.scheduleJob(
      moment(reminderDate).tz('America/Bogota').toDate(),
      async () => {
        try {
          // Consultar la información del reminder desde la base de datos usando el ID
          const reminder = await this.reminderService.getReminderWhere({
            where: { id: reminderId },
          });

          if (reminder.success && typeof reminder.result !== 'string') {
            // Enviar la notificación al usuario utilizando el servicio de Telegram
            console.log(`Notificando al usuario: ${reminder.result}`);

            const result = await this.reminderHandler.remindToUser(
              reminder.result,
            );

            if (!result) throw new Error('Error al enviar notificación');

            // Puedes agregar lógica adicional, como marcar el reminder como notificado en la base de datos
            await this.reminderService.updateReminder(reminderId, {
              notified: true,
            });
          }
        } catch (e) {
          console.error(e);
        }
      },
    );
  }
}
