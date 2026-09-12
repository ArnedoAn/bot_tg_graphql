import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BotService } from './shared/instances/bot.service';

@Controller()
export class AppController {
  constructor(
    private readonly botService: BotService,
    private readonly configService: ConfigService,
  ) {}

  @Get('health')
  health(): { status: string; timestamp: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('notify')
  async notify(
    @Headers('x-api-key') key: string,
    @Body() body: { message: string },
  ): Promise<{ ok: boolean }> {
    if (key !== this.configService.get('NOTIFY_API_KEY')) {
      throw new UnauthorizedException();
    }
    const userId = Number(this.configService.get('ADMIN_ID'));
    await this.botService.sendMessageToUser(userId, body.message);
    return { ok: true };
  }
}
