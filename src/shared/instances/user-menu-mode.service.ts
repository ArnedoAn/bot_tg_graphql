import { Injectable } from '@nestjs/common';
import { UserSettingsService } from '../prisma/user-settings.service';

/**
 * Menú simple vs avanzado según preferencia guardada en BD por usuario.
 * Si aún no hay preferencia, se considera modo simple hasta que elija en el selector.
 */
@Injectable()
export class UserMenuModeService {
  constructor(private readonly userSettings: UserSettingsService) {}

  async isAdvancedUser(chatId: number): Promise<boolean> {
    const mode = await this.userSettings.getMenuMode(String(chatId));
    if (mode === null) {
      return false;
    }
    return mode === 'advanced';
  }

  async hasChosenMenuMode(chatId: number): Promise<boolean> {
    const mode = await this.userSettings.getMenuMode(String(chatId));
    return mode !== null;
  }
}
