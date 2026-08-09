import { ConfigService } from '@nestjs/config';
import TelegramBot, { InlineKeyboardButton } from 'node-telegram-bot-api';
import { FeatureFlagsService } from '../../shared/prisma/feature-flags.service';
import { FinanceWizardStep } from '../../shared/prisma/finance-onboarding.service';
import { FeatureFlagKey } from '../../shared/constants/feature-flag-keys';

export const onboardingUrls = {
  fireflyHome: 'https://finance-fly.toothless.codes/',
  fireflyProfile: 'https://finance-fly.toothless.codes/profile',
  financeWeb: 'https://finance.toothless.codes/',
  financeSetup: 'https://finance.toothless.codes/settings/setup',
} as const;

/** Título de sección según perfil */
export function financeTitle(advanced: boolean): string {
  return advanced ? '💰 *Finance Analyzer*' : '💰 *Finanzas*';
}

export function getUserId(chatId: number): string {
  return chatId.toString();
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sectionOn(
  featureFlags: FeatureFlagsService,
  key: FeatureFlagKey,
): Promise<boolean> {
  return featureFlags.isEnabled(key);
}

export function isGoogleTestingMode(configService: ConfigService): boolean {
  return (
    configService
      .get<string>('GOOGLE_TESTING_MODE', 'false')
      .toLowerCase() === 'true'
  );
}

export function buildProgressBar(
  step: FinanceWizardStep,
  prog: {
    fireflyTokenDone: boolean;
    gmailDone: boolean;
    webUiDone: boolean;
    apkManualDone: boolean;
  },
): string {
  const items: { key: FinanceWizardStep; done: boolean }[] = [
    { key: 'firefly_signup', done: prog.fireflyTokenDone },
    { key: 'firefly_token', done: prog.fireflyTokenDone },
    { key: 'gmail', done: prog.gmailDone },
    { key: 'web_ui', done: prog.webUiDone },
    { key: 'apk', done: prog.apkManualDone },
  ];
  let activeIndex = items.findIndex((x) => x.key === step);
  if (step === 'start') activeIndex = 0;
  if (step === 'complete') activeIndex = items.length;
  const icons = items.map((x, i) => {
    if (x.done) return '✅';
    if (step !== 'complete' && i === activeIndex) return '🔵';
    return '⚪';
  });
  const label =
    step === 'complete' ? items.length : Math.min(activeIndex + 1, items.length);
  return `${icons.join(' ')}  _(${label}/${items.length})_\n\n`;
}

export function wizardNavKeyboard(
  step: FinanceWizardStep,
  opts?: { showNext?: boolean; showBack?: boolean },
): InlineKeyboardButton[][] {
  const rows: InlineKeyboardButton[][] = [];
  const showNext = opts?.showNext !== false;
  const showBack = opts?.showBack !== false;
  const nav: InlineKeyboardButton[] = [];
  if (showBack) {
    nav.push({ text: '⬅️ Paso anterior', callback_data: 'finance:wiz_back' });
  }
  if (showNext) {
    nav.push({ text: 'Siguiente paso ➡️', callback_data: 'finance:wiz_next' });
  }
  if (nav.length) rows.push(nav);
  rows.push([
    { text: '🔙 Volver al menú Finanzas', callback_data: 'menu:finance' },
  ]);
  return rows;
}

export function isValidEmail(raw: string): boolean {
  const s = raw.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/**
 * Helper to edit message or send new one
 */
export async function editOrSend(
  bot: TelegramBot,
  chatId: number,
  messageId: number | undefined,
  text: string,
  keyboard: InlineKeyboardButton[][],
): Promise<void> {
  const options = {
    parse_mode: 'Markdown' as const,
    reply_markup: { inline_keyboard: keyboard },
  };

  if (messageId) {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      ...options,
    });
  } else {
    await bot.sendMessage(chatId, text, options);
  }
}
