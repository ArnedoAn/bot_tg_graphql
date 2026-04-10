import { Injectable } from '@nestjs/common';
import { PicoyplacaService } from '../picoyplaca.service';
import { BotService } from '../../shared/instances/bot.service';
import TelegramBot from 'node-telegram-bot-api';
import { Vehicle } from '@prisma/client';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class PicoyplacaHandler {
  private readonly bot: TelegramBot;
  private readonly errorMessage = 'Ha ocurrido un error inesperado';

  constructor(
    private readonly pypService: PicoyplacaService,
    private readonly botInstace: BotService,
  ) {
    this.bot = this.botInstace.getBot();
  }

  getMenuOptions(): TelegramBot.InlineKeyboardButton[][] {
    return [
      [{ text: '🚦 Consultar Pico y Placa', callback_data: 'picoyplaca:consultar' }],
      [{ text: '🚗 Agregar Vehículo', callback_data: 'picoyplaca:add_car' }],
      [{ text: '📋 Mis Vehículos', callback_data: 'picoyplaca:all_cars' }],
      [{ text: '⬅️ Volver al menú', callback_data: 'menu:main' }],
    ];
  }

  async showMenu(chatId: number) {
    await this.botInstace.sendMessageToUser(
      chatId,
      '🚗 *Pico y Placa Menu*\n\nSelecciona una opción:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: this.getMenuOptions(),
        },
      },
    );
  }

  async handleCallback(chatId: number, action: string) {
    switch (action) {
      case 'consultar':
        await this.picoAction(chatId);
        break;
      case 'add_car':
        await this.addVehicleAction(chatId);
        break;
      case 'all_cars':
        await this.getVehiclesAction(chatId);
        break;
    }
  }

  @Cron('0 19 * * *') // Ejecuta la tarea a las 7 pm
  async executeTask() {
    await this.notifyHandler();
    await this.bot.sendMessage(process.env.ADMIN_ID, 'Tarea ejecutada');
  }

  private async picoAction(chatId: number) {
    try {
      const message = await this.pypService.getPicoyplacaInfo();
      await this.bot.sendMessage(chatId, message);
    } catch (err) {
      await this.bot.sendMessage(chatId, this.errorMessage);
    }
  }

  private async addVehicleAction(chatId: number) {
    try {
      const firtMsg = await this.bot.sendMessage(
        chatId,
        'Ingresa el nombre del vehículo que deseas trackear',
        {
          reply_markup: {
            force_reply: true,
          },
        },
      );

      const { text: vehicleName } = await this.botInstace.getOnReplyMessageResponse(
        chatId,
        firtMsg.message_id,
      );

      if ((await this.pypService.vehicleExist(vehicleName, chatId)) === true) {
        await this.bot.sendMessage(
          chatId,
          'Ya tienes este vehículo registrado',
        );
        return;
      }

      const secondMsg = await this.bot.sendMessage(
        chatId,
        `Ingresa el ultimo digito de la placa de ${vehicleName}`,
        {
          reply_markup: {
            force_reply: true,
          },
        },
      );

      const { text: lastDigit } = await this.botInstace.getOnReplyMessageResponse(
        chatId,
        secondMsg.message_id,
      );

      const vehicle: Vehicle = {
        id: 1,
        name: vehicleName,
        lastDigit: Number(lastDigit),
        userId: chatId.toString(),
      };

      const vehicleCreated = await this.pypService.addVehicle(vehicle);

      await this.bot.sendMessage(chatId, vehicleCreated);
    } catch (err) {
      console.error(err);
      await this.bot.sendMessage(chatId, this.errorMessage);
    }
  }

  private async getVehiclesAction(chatId: number) {
    try {
      const vehicles = await this.pypService.getVehiclesByUser(chatId);

      if (vehicles === null) {
        await this.bot.sendMessage(
          chatId,
          'No tienes vehículos registrados.',
        );
        return;
      }

      await this.bot.sendMessage(
        chatId,
        'Estos son tus vehículos registrados 🚙',
      );

      for (const vehicle of vehicles) {
        await this.bot.sendMessage(chatId, vehicle);
      }
    } catch (err) {
      console.error(err);
      await this.bot.sendMessage(chatId, this.errorMessage);
    }
  }

  // Legacy handlers for direct commands
  async picoHandler(msg: TelegramBot.Message) {
    await this.picoAction(msg.chat.id);
  }

  async addVehicleHandler(msg: TelegramBot.Message) {
    await this.addVehicleAction(msg.chat.id);
  }

  async getVehiclesHandler(msg: TelegramBot.Message) {
    await this.getVehiclesAction(msg.chat.id);
  }

  async notifyHandler() {
    try {
      const vehicles = await this.pypService.getVehiclesToNotify();
      if (vehicles === null) {
        return;
      }
      for (const vehicle of vehicles) {
        await this.bot.sendMessage(
          process.env.ADMIN_ID,
          `¡Prepárate! 🚗 Mañana es día de Pico y Placa para tu vehículo: ${vehicle.name}. ¡No olvides ajustar tu ruta!🚦`,
        );
      }
    } catch (err) {
      console.error(err);
      await this.bot.sendMessage(process.env.ADMIN_ID, 'Error en el Cron.');
    }
  }
}
