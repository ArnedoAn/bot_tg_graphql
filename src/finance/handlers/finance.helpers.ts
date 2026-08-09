import { ConfigService } from '@nestjs/config';
import TelegramBot, { InlineKeyboardButton } from 'node-telegram-bot-api';
import { FeatureFlagsService } from '../../shared/prisma/feature-flags.service';
import { FinanceWizardStep } from '../../shared/prisma/finance-onboarding.service';
import {
  FEATURE_FLAGS,
  FeatureFlagKey,
} from '../../shared/constants/feature-flag-keys';

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

/**
 * Menú usuario común: tutorial primero, operaciones aparte.
 */
export async function buildSimpleMenuOptions(
  featureFlags: FeatureFlagsService,
): Promise<InlineKeyboardButton[][]> {
  const rows: InlineKeyboardButton[][] = [];
  if (await sectionOn(featureFlags, FEATURE_FLAGS.FINANCE_SECTION_TUTORIAL)) {
    rows.push([
      { text: '🎓 Configurar finanzas (tutorial)', callback_data: 'finance:wizard' },
    ]);
  }
  if (await sectionOn(featureFlags, FEATURE_FLAGS.FINANCE_SECTION_REVIEW)) {
    rows.push([{ text: '📋 Revisar configuración', callback_data: 'finance:review_setup' }]);
  }
  rows.push([
    { text: '⚙️ Operaciones (correo, Gmail, token…)', callback_data: 'finance:ops_menu' },
  ]);
  if (await sectionOn(featureFlags, FEATURE_FLAGS.FINANCE_SECTION_APK)) {
    rows.push([{ text: '📥 Obtener APK', callback_data: 'finance:get_apk' }]);
  }
  rows.push([{ text: '⬅️ Volver al menú', callback_data: 'menu:main' }]);
  return rows;
}

/**
 * Menú avanzado: tutorial + operaciones técnicas filtradas por flags.
 */
export async function buildAdvancedMenuOptions(
  featureFlags: FeatureFlagsService,
): Promise<InlineKeyboardButton[][]> {
  const rows: InlineKeyboardButton[][] = [];
  if (await sectionOn(featureFlags, FEATURE_FLAGS.FINANCE_SECTION_TUTORIAL)) {
    rows.push([
      { text: '🎓 Tutorial / asistente', callback_data: 'finance:wizard' },
    ]);
  }
  if (await sectionOn(featureFlags, FEATURE_FLAGS.FINANCE_SECTION_REVIEW)) {
    rows.push([{ text: '📋 Revisar configuración', callback_data: 'finance:review_setup' }]);
  }

  const batchRow: InlineKeyboardButton[] = [];
  if (await sectionOn(featureFlags, FEATURE_FLAGS.FINANCE_SECTION_BATCH)) {
    batchRow.push({ text: '🚀 Procesar Transacciones', callback_data: 'finance:batch' });
  }
  if (await sectionOn(featureFlags, FEATURE_FLAGS.FINANCE_SECTION_DRYRUN)) {
    batchRow.push({ text: '🔍 Modo Prueba', callback_data: 'finance:dryrun' });
  }
  if (batchRow.length) rows.push(batchRow);

  const statsRow: InlineKeyboardButton[] = [];
  if (await sectionOn(featureFlags, FEATURE_FLAGS.FINANCE_SECTION_STATS)) {
    statsRow.push({ text: '📊 Estadísticas', callback_data: 'finance:stats' });
  }
  if (await sectionOn(featureFlags, FEATURE_FLAGS.FINANCE_SECTION_AUDIT)) {
    statsRow.push({ text: '📜 Auditoría', callback_data: 'finance:audit' });
  }
  if (statsRow.length) rows.push(statsRow);

  const gmailRow: InlineKeyboardButton[] = [];
  if (await sectionOn(featureFlags, FEATURE_FLAGS.FINANCE_SECTION_GMAIL)) {
    gmailRow.push(
      { text: '🔐 Estado Gmail', callback_data: 'finance:gmail_status' },
      { text: '🔗 Reconectar Gmail', callback_data: 'finance:gmail_reconnect' },
    );
  }
  if (gmailRow.length) rows.push(gmailRow);

  if (await sectionOn(featureFlags, FEATURE_FLAGS.FINANCE_SECTION_FIREFLY_TOKEN)) {
    rows.push([{ text: '🔑 Configurar Firefly Token', callback_data: 'finance:firefly_token' }]);
  }
  if (await sectionOn(featureFlags, FEATURE_FLAGS.FINANCE_SECTION_USER_ID)) {
    rows.push([{ text: '🆔 Ver User ID (API)', callback_data: 'finance:show_user_id' }]);
  }
  if (await sectionOn(featureFlags, FEATURE_FLAGS.FINANCE_SECTION_HEALTH)) {
    rows.push([{ text: '🏥 Health Check', callback_data: 'finance:health' }]);
  }

  const schedRow: InlineKeyboardButton[] = [];
  if (await sectionOn(featureFlags, FEATURE_FLAGS.FINANCE_SECTION_SCHEDULER)) {
    schedRow.push({ text: '⏰ Scheduler', callback_data: 'finance:scheduler' });
  }
  if (await sectionOn(featureFlags, FEATURE_FLAGS.FINANCE_SECTION_RETRY)) {
    schedRow.push({ text: '🔄 Reintentar Fallidos', callback_data: 'finance:retry' });
  }
  if (schedRow.length) rows.push(schedRow);

  const sendersRow: InlineKeyboardButton[] = [];
  if (await sectionOn(featureFlags, FEATURE_FLAGS.FINANCE_SECTION_SENDERS)) {
    sendersRow.push({ text: '📧 Ver Senders', callback_data: 'finance:senders' });
  }
  if (await sectionOn(featureFlags, FEATURE_FLAGS.FINANCE_SECTION_LEARN)) {
    sendersRow.push({ text: '🧠 Aprender Senders', callback_data: 'finance:learn' });
  }
  if (sendersRow.length) rows.push(sendersRow);

  if (await sectionOn(featureFlags, FEATURE_FLAGS.FINANCE_SECTION_SYNC)) {
    rows.push([{ text: '🔄 Sincronizar Firefly', callback_data: 'finance:sync' }]);
  }

  if (await sectionOn(featureFlags, FEATURE_FLAGS.FINANCE_SECTION_APK)) {
    rows.push([{ text: '📥 Obtener APK', callback_data: 'finance:get_apk' }]);
  }

  rows.push([{ text: '⬅️ Volver al menú', callback_data: 'menu:main' }]);
  return rows;
}

/** Submenú de operaciones para menú simple (mismas acciones que antes, filtradas). */
export async function buildSimpleOperationsMenu(
  featureFlags: FeatureFlagsService,
): Promise<InlineKeyboardButton[][]> {
  const rows: InlineKeyboardButton[][] = [];
  if (await sectionOn(featureFlags, FEATURE_FLAGS.FINANCE_SECTION_BATCH)) {
    rows.push([
      { text: '📥 Procesar movimientos desde el correo', callback_data: 'finance:batch' },
    ]);
  }
  const gmailRow: InlineKeyboardButton[] = [];
  if (await sectionOn(featureFlags, FEATURE_FLAGS.FINANCE_SECTION_GMAIL)) {
    gmailRow.push(
      { text: '✉️ ¿Gmail conectado?', callback_data: 'finance:gmail_status' },
      { text: '🔗 Conectar o renovar Gmail', callback_data: 'finance:gmail_reconnect' },
    );
  }
  if (gmailRow.length) rows.push(gmailRow);
  if (await sectionOn(featureFlags, FEATURE_FLAGS.FINANCE_SECTION_FIREFLY_TOKEN)) {
    rows.push([{ text: '🔑 Token de Firefly', callback_data: 'finance:firefly_token' }]);
  }
  if (await sectionOn(featureFlags, FEATURE_FLAGS.FINANCE_SECTION_SYNC)) {
    rows.push([{ text: '🔄 Sincronizar con Firefly', callback_data: 'finance:sync' }]);
  }
  if (await sectionOn(featureFlags, FEATURE_FLAGS.FINANCE_SECTION_HEALTH)) {
    rows.push([{ text: '✅ Estado del servicio', callback_data: 'finance:health' }]);
  }
  if (await sectionOn(featureFlags, FEATURE_FLAGS.FINANCE_SECTION_USER_ID)) {
    rows.push([{ text: '🆔 Mi código de usuario', callback_data: 'finance:show_user_id' }]);
  }
  if (await sectionOn(featureFlags, FEATURE_FLAGS.FINANCE_SECTION_APK)) {
    rows.push([{ text: '📥 Obtener APK', callback_data: 'finance:get_apk' }]);
  }
  rows.push([{ text: '🔙 Volver a Finanzas', callback_data: 'finance:menu' }]);
  return rows;
}
