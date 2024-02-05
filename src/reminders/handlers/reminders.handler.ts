import { Injectable } from '@nestjs/common';
import { BotService } from '../../shared/instances/bot.service';
import TelegramBot from 'node-telegram-bot-api';
import { RemindersService } from '../reminders.service';
import { Reminder } from '@prisma/client';

@Injectable()
export class ReminderHandler {
  private readonly bot: TelegramBot;
  constructor(
    private readonly remindersService: RemindersService,
    private readonly botInstace: BotService,
  ) {
    this.bot = this.botInstace.getBot();
  }

  async remindToUser(reminder: Reminder): Promise<boolean> {
    try {
      await this.botInstace.sendMessageToUser(
        Number(reminder.userId),
        reminder.description,
      );
      return true;
    } catch (e) {
      console.error(e);
      await this.botInstace.sendMessageToUser(
        Number(reminder.userId),
        'Oops...',
      );
      return false;
    }
  }

  async createRemindHandler(msg: TelegramBot.Message) {
    try {
      const firtMsg = await this.botInstace.sendMessageToUser(
        msg.chat.id,
        'Ingresa el titulo del recordatorio',
        {
          reply_markup: {
            force_reply: true,
          },
        },
      );

      const title = await this.botInstace.getOnReplyMessageResponse(
        msg.chat.id,
        firtMsg.message_id,
      );

      const secondMsg = await this.botInstace.sendMessageToUser(
        msg.chat.id,
        'Ingresa la descripción del recordatorio',
        {
          reply_markup: {
            force_reply: true,
          },
        },
      );

      const description = await this.botInstace.getOnReplyMessageResponse(
        msg.chat.id,
        secondMsg.message_id,
      );

      const thirdMsg = await this.botInstace.sendMessageToUser(
        msg.chat.id,
        'Ingresa la fecha del recordatorio <DD/MM/YYYY HH:MM ~24H~>',
        {
          reply_markup: {
            force_reply: true,
          },
        },
      );

      const reminderDate = await this.botInstace.getOnReplyMessageResponse(
        msg.chat.id,
        thirdMsg.message_id,
      ); //FORMATEAR FECHA DE ACUERDO A NODE SCHEDULER

      const reminder: Reminder = {
        date: new Date(reminderDate),
        description,
        title,
        userId: msg.chat.id.toString(),
        id: 0,
      };

      const reminderCreated =
        await this.remindersService.createReminder(reminder);

      if (!reminderCreated) throw new Error('Error al crear recordatorio');

      await this.botInstace.sendMessageToUser(
        msg.chat.id,
        'Recordatorio creado.',
      );

      return;
    } catch (e) {
      await this.botInstace.sendMessageToUser(
        msg.chat.id,
        'Ocurrió un error al crear el recordatorio',
      );
      return;
    }
  }
}
