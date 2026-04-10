/** Claves de feature flags globales (BD). */
export const FEATURE_FLAGS = {
  MODULE_FINANCE: 'module.finance',
  MODULE_TRANSCARIBE: 'module.transcaribe',
  MODULE_PICOYPLACA: 'module.picoyplaca',
  MODULE_DEVOPS: 'module.devops',
  /** Si está activo, usuarios no admin solo ven Finanzas en el menú principal. */
  FINANCE_LAUNCH_SOLO: 'finance.launch_solo',
  FINANCE_SECTION_TUTORIAL: 'finance.section.tutorial',
  FINANCE_SECTION_REVIEW: 'finance.section.review',
  FINANCE_SECTION_BATCH: 'finance.section.batch',
  FINANCE_SECTION_DRYRUN: 'finance.section.dryrun',
  FINANCE_SECTION_HEALTH: 'finance.section.health',
  FINANCE_SECTION_GMAIL: 'finance.section.gmail',
  FINANCE_SECTION_FIREFLY_TOKEN: 'finance.section.firefly_token',
  FINANCE_SECTION_SYNC: 'finance.section.sync',
  FINANCE_SECTION_SENDERS: 'finance.section.senders',
  FINANCE_SECTION_AUDIT: 'finance.section.audit',
  FINANCE_SECTION_SCHEDULER: 'finance.section.scheduler',
  FINANCE_SECTION_USER_ID: 'finance.section.user_id',
  FINANCE_SECTION_APK: 'finance.section.apk',
  FINANCE_SECTION_STATS: 'finance.section.stats',
  FINANCE_SECTION_RETRY: 'finance.section.retry',
  FINANCE_SECTION_LEARN: 'finance.section.learn',
} as const;

export type FeatureFlagKey = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

export const ALL_FEATURE_FLAG_KEYS: FeatureFlagKey[] = Object.values(FEATURE_FLAGS);

/** ID fijo del registro de APK en bot_assets */
export const BOT_ASSET_FINANCE_APK = 'finance_apk';
