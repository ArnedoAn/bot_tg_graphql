import { Injectable } from '@nestjs/common';
import { PicoyplacaService } from '../picoyplaca.service';
import { BotInstance } from 'src/shared/instances/bot.instance';
import TelegramBot from 'node-telegram-bot-api';

@Injectable()
export class PicoyplacaHandler {
  private readonly bot: TelegramBot;
  constructor(
    private readonly pypService: PicoyplacaService,
    private readonly botInstace: BotInstance,
  ) {
    this.bot = this.botInstace.getBot();
  }

  async picoHandler(msg: TelegramBot.Message) {
    const message = await this.pypService.getPicoyplacaInfo();
    await this.bot.sendMessage(msg.chat.id, message);
  }
}
