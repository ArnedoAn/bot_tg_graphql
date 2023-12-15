import { Injectable } from '@nestjs/common';
import { TranscaribeService } from '../transcaribe.service';
import { BotInstance } from 'src/shared/instances/bot.instance';
import TelegramBot from 'node-telegram-bot-api';
import { CONSTANTS } from '../helpers/operations.helper';

@Injectable()
export class TranscaribeHandler {
  private readonly bot: TelegramBot;
  private readonly errorMessage = `Ha ocurrido un error, intenta de nuevo.`;
  private readonly options = {
    reply_markup: {
      keyboard: [[{ text: '+' }, { text: '-' }]],
      resize_keyboard: true,
    },
  };
  private readonly TARIFA: number;
  private readonly responseMessages = {
    GOOD: {
      init: {
        first: `Ingresa el saldo inicial de tu tarjeta ($COP):`,
        second: `Tarjeta creada con éxito.`,
      },
      addOrSubstract: (balance: number) => `Saldo actual (Pasajes): ${balance}`,
      cardBalance: (balance: number) =>
        `Tu saldo es: $${balance} \n${Math.trunc(
          balance / this.TARIFA,
        )} pasajes disponibles.`,
    },
    BAD: {
      init: {
        first: `Ya tienes una tarjeta registrada.`,
        second: (amount: number) =>
          `Cantidad no válida: $${amount}. Debe ser mayor o igual a 0 . `,
      },
      add: `Ha ocurrido un error, intenta de nuevo.`,
      subtract: `Ha ocurrido un error, intenta de nuevo.`,
      verifyBalance: `No tienes saldo suficiente.`,
      verifyUser: `No tienes una tarjeta registrada, usa el comando /init para crear una.`,
      cardBalance: `No tienes una tarjeta registrada, usa el comando /init para crear una.`,
    },
  };
  constructor(
    private readonly transcaribeService: TranscaribeService,
    private readonly botInstace: BotInstance,
  ) {
    this.bot = this.botInstace.getBot();
    this.TARIFA = CONSTANTS.tarifa;
  }

  private async verifyUser(chatId: string) {
    const result = await this.transcaribeService.getCardBalance(chatId);
    if (!result) {
      return false;
    }
    return true;
  }

  private verifyBalance(balance: number, amount: number) {
    if (balance - amount < 0) {
      return false;
    }
    return true;
  }

  private async verifyBalanceHandler(
    msg: TelegramBot.Message,
    count: number = 1,
  ) {
    const balance = await this.transcaribeService.getCardBalance(
      msg.chat.id.toString(),
    );
    if (
      this.verifyBalance(
        balance.saldoDisponible,
        Math.abs(count) * this.TARIFA,
      ) == false
    ) {
      throw new Error(this.responseMessages.BAD.verifyBalance);
    }
  }

  private async verifyUserHandler(msg: TelegramBot.Message) {
    if ((await this.verifyUser(msg.chat.id.toString())) == false) {
      throw new Error(this.responseMessages.BAD.verifyUser);
    }
  }

  private async verifyAmountHandler(amount: number) {
    if (amount < 0 || amount / this.TARIFA < 1) {
      throw new Error(this.responseMessages.BAD.init.second(amount));
    }
  }

  async initHandler(msg: TelegramBot.Message) {
    try {
      if (await this.verifyUser(msg.chat.id.toString()))
        throw new Error(this.responseMessages.BAD.init.first);

      const count = await this.bot.sendMessage(
        msg.chat.id,
        this.responseMessages.GOOD.init.first,
        {
          reply_markup: {
            force_reply: true,
          },
        },
      );

      this.bot.onReplyToMessage(
        msg.chat.id,
        count.message_id,
        async (msgToReply) => {
          const newCardBalance = parseInt(msgToReply.text || '0');
          await this.verifyAmountHandler(newCardBalance);
          const cardCreated = await this.transcaribeService.newUserCard(
            msg.chat.id.toString(),
            newCardBalance,
          );
          if (!cardCreated.success) throw new Error(cardCreated.result);
          this.bot.sendMessage(
            msg.chat.id,
            this.responseMessages.GOOD.init.second,
          );
        },
      );
    } catch (err) {
      this.bot.sendMessage(
        msg.chat.id,
        err.message ? err.message : this.errorMessage,
        this.options,
      );
      return;
    }
  }

  async addMoneyToCardHandler(msg: TelegramBot.Message, count: number = 1) {
    try {
      await this.verifyUserHandler(msg);
      const result = await this.transcaribeService.cardOperation(
        count,
        msg.chat.id.toString(),
      );
      if (!result.success) throw new Error(result.result);
      await this.transcaribeService.registerCardOperation(
        count,
        msg.chat.id.toString(),
      );
      this.bot.sendMessage(
        msg.chat.id,
        this.responseMessages.GOOD.addOrSubstract(result.result),
        this.options,
      );
      return;
    } catch (err) {
      this.bot.sendMessage(
        msg.chat.id,
        err.message || this.responseMessages.BAD.add,
        this.options,
      );
      return;
    }
  }

  async subtractMoneyFromCardHandler(
    msg: TelegramBot.Message,
    count: number = -1,
  ) {
    try {
      await this.verifyUserHandler(msg);
      await this.verifyBalanceHandler(msg);
      const result = await this.transcaribeService.cardOperation(
        count,
        msg.chat.id.toString(),
      );
      if (!result.success) throw new Error(result.result);
      await this.transcaribeService.registerCardOperation(
        count,
        msg.chat.id.toString(),
      );
      this.bot.sendMessage(
        msg.chat.id,
        this.responseMessages.GOOD.addOrSubstract(result.result),
        this.options,
      );
      return;
    } catch (err) {
      this.bot.sendMessage(
        msg.chat.id,
        err.message || this.responseMessages.BAD.subtract,
        this.options,
      );
      return;
    }
  }

  async getCardBalanceHandler(msg: TelegramBot.Message) {
    try {
      await this.verifyUserHandler(msg);
      const getCardBalance = await this.transcaribeService.getCardBalance(
        msg.chat.id.toString(),
      );
      if (!getCardBalance)
        throw new Error(this.responseMessages.BAD.cardBalance);
      this.bot.sendMessage(
        msg.chat.id,
        this.responseMessages.GOOD.cardBalance(getCardBalance.saldoDisponible),
        this.options,
      );
    } catch (err) {
      this.bot.sendMessage(
        msg.chat.id,
        err.message || this.responseMessages.BAD.cardBalance,
        this.options,
      );
      return;
    }
  }

  async setBalanceHandler(msg: TelegramBot.Message) {}
  async deleteCardHistoryHandler(msg: TelegramBot.Message) {}
  async deleteCardHandler(msg: TelegramBot.Message) {}
  async getCardHistoryHandler(msg: TelegramBot.Message) {}
  async newCardHandler(msg: TelegramBot.Message) {}
}
