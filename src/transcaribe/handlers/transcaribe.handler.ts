import { Injectable } from '@nestjs/common';
import { TarjetaService } from 'src/shared/prisma/tarjeta.service';
import {
  CONSTANTS as Const,
  setUTCDate as dateFormat,
} from '../helpers/operations.helper';
import { Result } from 'src/shared/interfaces/result.interface';
import { BotInstance } from 'src/shared/instances/bot.instance';
import TelegramBot from 'node-telegram-bot-api';
import { TranscaribeService } from '../transcaribe.service';

@Injectable()
export class TranscaribeHandler {
  private readonly bot: TelegramBot;
  private readonly TARIFA: number;
  private readonly errorMessage = 'Ha ocurrido un error inesperado';
  constructor(
    private readonly transcaribeService: TranscaribeService,
    private readonly botInstace: BotInstance,
  ) {
    this.bot = this.botInstace.getBot();
    this.TARIFA = Const.tarifa;
  }

  private async sendMessageToUser(
    chatId: number,
    message: string,
    options: TelegramBot.SendMessageOptions = {},
  ): Promise<TelegramBot.Message> {
    return await this.bot.sendMessage(chatId, message, options);
  }

  private async getNumberOnReplyMessageResponse(
    chatId: number,
    message_id: number,
  ): Promise<string> {
    return new Promise((resolve) => {
      this.bot.onReplyToMessage(chatId, message_id, (msgToReply) => {
        resolve(msgToReply.text);
      });
    });
  }

  private async verifyUser(chatId: string) {
    const result = await this.transcaribeService.userExists(chatId);
    if (!result) {
      return false;
    }
    return true;
  }

  async initHandler(msg: TelegramBot.Message) {
    try {
      if (await this.verifyUser(msg.chat.id.toString()))
        throw new Error('Ya tienes una tarjeta registrada');

      const firtMsg = await this.sendMessageToUser(
        msg.chat.id,
        'Ingresa el número de la tarjeta que deseas registrar',
        {
          reply_markup: {
            force_reply: true,
          },
        },
      );

      const cardApi = await this.getNumberOnReplyMessageResponse(
        msg.chat.id,
        firtMsg.message_id,
      );

      const secondMsg = await this.sendMessageToUser(
        msg.chat.id,
        'Ingresa el Api Key de la tarjeta',
        {
          reply_markup: {
            force_reply: true,
          },
        },
      );

      const apiKey = await this.getNumberOnReplyMessageResponse(
        msg.chat.id,
        secondMsg.message_id,
      );

      const cardCreated = await this.transcaribeService.createCard(
        msg.chat.id.toString(),
        cardApi,
        apiKey,
      );

      if (!cardCreated.success) throw new Error(cardCreated.result);
      await this.bot.sendMessage(
        msg.chat.id,
        'Tarjeta registrada exitosamente',
      );
    } catch (err) {
      await this.sendMessageToUser(
        msg.chat.id,
        err.message.replace('Error:', '') || this.errorMessage,
      );
      return;
    }
  }

  async balanceHandler(msg: TelegramBot.Message) {
    try {
      if (!(await this.verifyUser(msg.chat.id.toString())))
        throw new Error('No tienes una tarjeta registrada');

      const balance = await this.transcaribeService.getBalance(
        msg.chat.id.toString(),
      );
      if (!balance.success) throw new Error(balance.result);
      await this.sendMessageToUser(msg.chat.id, balance.result);
    } catch (err) {
      await this.sendMessageToUser(
        msg.chat.id,
        err.message || this.errorMessage,
      );
      return;
    }
  }

  async cardHistoryHandler(msg: TelegramBot.Message) {
    try {
      if (!(await this.verifyUser(msg.chat.id.toString())))
        throw new Error('No tienes una tarjeta registrada');

      const history = await this.transcaribeService.getHistory(
        msg.chat.id.toString(),
      );
      if (!history.success) throw new Error(history.result);
      for (const message of history.result) {
        await this.sendMessageToUser(msg.chat.id, message);
      }
    } catch (err) {
      await this.sendMessageToUser(
        msg.chat.id,
        err.message || this.errorMessage,
      );
      return;
    }
  }

  async getInfoHandler(msg: TelegramBot.Message) {
    try {
      const cardInfo = await this.transcaribeService.getCardInfo(
        msg.chat.id.toString(),
      );
      if (!cardInfo) throw new Error("cardInfo.result doesn't exist");
      await this.sendMessageToUser(msg.chat.id, 'Funcionando');
    } catch (err) {
      console.error(err.message);
      await this.sendMessageToUser(msg.chat.id, this.errorMessage);
      return;
    }
  }
}
