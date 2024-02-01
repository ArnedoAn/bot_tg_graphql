import { Injectable } from '@nestjs/common';
import { PicoyplacaService } from '../picoyplaca.service';
import { BotService } from '../../shared/instances/bot.service';
import TelegramBot from 'node-telegram-bot-api';
import { Vehicle } from '@prisma/client';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class PicoyplacaHandler {
  private readonly bot: TelegramBot;
  constructor(
    private readonly pypService: PicoyplacaService,
    private readonly botInstace: BotService,
  ) {
    this.bot = this.botInstace.getBot();
  }

  @Cron('0 19 * * *') // Ejecuta la tarea a kas 7 pm
  async executeTask() {
    await this.notifyHandler();
    await this.bot.sendMessage(process.env.ADMIN_ID, 'Tarea ejecutada');
  }

  async picoHandler(msg: TelegramBot.Message) {
    try {
      const message = await this.pypService.getPicoyplacaInfo();
      await this.bot.sendMessage(msg.chat.id, message);
    } catch (err) {
      await this.bot.sendMessage(msg.chat.id, 'Error en el servidor.');
    }
  }

  async addVehicleHandler(msg: TelegramBot.Message) {
    try {
      const firtMsg = await this.bot.sendMessage(
        msg.chat.id,
        'Ingresa el nombre del vehículo que deseas trackear',
        {
          reply_markup: {
            force_reply: true,
          },
        },
      );

      const vehicleName = await this.botInstace.getOnReplyMessageResponse(
        msg.chat.id,
        firtMsg.message_id,
      );

      if (
        (await this.pypService.vehicleExist(firtMsg.text, msg.chat.id)) === true
      ) {
        await this.bot.sendMessage(
          msg.chat.id,
          'Ya tienes este vehículo registrado',
        );
        return;
      }

      const secondMsg = await this.bot.sendMessage(
        msg.chat.id,
        `Ingresa el ultimo digito de la placa de ${vehicleName}`,
        {
          reply_markup: {
            force_reply: true,
          },
        },
      );

      const lastDigit = await this.botInstace.getOnReplyMessageResponse(
        msg.chat.id,
        secondMsg.message_id,
      );

      const vehicle: Vehicle = {
        id: 1,
        name: vehicleName,
        lastDigit: Number(lastDigit),
        userId: msg.chat.id.toString(),
      };

      const vehicleCreated = await this.pypService.addVehicle(vehicle);

      await this.bot.sendMessage(msg.chat.id, vehicleCreated);
    } catch (err) {
      console.error(err);
      await this.bot.sendMessage(msg.chat.id, 'Error en el servidor.');
    }
  }

  async getVehiclesHandler(msg: TelegramBot.Message) {
    try {
      const vehicles = await this.pypService.getVehiclesByUser(msg.chat.id);

      if (vehicles === null) {
        await this.bot.sendMessage(
          msg.chat.id,
          'No tienes vehículos registrados.',
        );
        return;
      }

      await this.bot.sendMessage(
        msg.chat.id,
        'Estos son tus vehículos registrados 🚙',
      );

      vehicles.forEach(async (vehicle) => {
        await this.bot.sendMessage(msg.chat.id, vehicle);
      });
    } catch (err) {
      console.error(err);
      await this.bot.sendMessage(msg.chat.id, 'Error en el servidor.');
    }
  }

  async notifyHandler() {
    try {
      const vehicles = await this.pypService.getVehiclesToNotify();
      if (vehicles === null) {
        return;
      }
      vehicles.forEach(async (vehicle) => {
        await this.bot.sendMessage(
          process.env.ADMIN_ID,
          `¡Prepárate! 🚗 Mañana es día de Pico y Placa para tu vehículo: ${vehicle.name}. ¡No olvides ajustar tu ruta!🚦`,
        );
      });
    } catch (err) {
      console.error(err);
      await this.bot.sendMessage(process.env.ADMIN_ID, 'Error en el Cron.');
    }
  }
}
