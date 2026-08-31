const bool = (name, fallback = false) => {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return value === 'true';
};

const integer = (name, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const parsed = Number.parseInt(process.env[name] ?? String(fallback), 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} deve ser um inteiro entre ${min} e ${max}.`);
  }
  return parsed;
};

const nonEmpty = name => Boolean(String(process.env[name] || '').trim());

export const MONEY_CONFIG = Object.freeze({
  requested: bool('ENABLE_REAL_MONEY', bool('REAL_MONEY_ENABLED')),
  legalReviewStatus: process.env.LEGAL_REVIEW_STATUS || 'pending',
  paymentProvider: process.env.PAYMENT_PROVIDER || 'disabled',
  paymentProviderConfigured: bool('PAYMENT_PROVIDER_CONFIGURED'),
  webhookSecretConfigured: bool('WEBHOOK_SECRET_CONFIGURED'),
  kycProvider: process.env.KYC_PROVIDER || 'disabled',
  kycProviderConfigured: bool('KYC_PROVIDER_CONFIGURED'),
  kycProviderAdapterReady: bool('KYC_PROVIDER_ADAPTER_READY'),
  platformCommissionPercent: integer('PLATFORM_COMMISSION_PERCENT', 15, { min: 0, max: 100 }),
  tournamentCommissionPercent: integer('TOURNAMENT_COMMISSION_PERCENT', 15, { min: 0, max: 100 }),
  firstPlacePercent: integer('FIRST_PLACE_PERCENT', 50, { min: 0, max: 100 }),
  secondPlacePercent: integer('SECOND_PLACE_PERCENT', 30, { min: 0, max: 100 }),
  thirdPlacePercent: integer('THIRD_PLACE_PERCENT', 20, { min: 0, max: 100 }),
  minWithdrawalCents: integer('MIN_WITHDRAWAL_AMOUNT_CENTS', 1_000, { min: 1 }),
  withdrawalFeeCents: integer('WITHDRAWAL_FEE_CENTS', 0, { min: 0 }),
  dailyEntryLimitCents: integer('DEFAULT_DAILY_ENTRY_LIMIT_CENTS', 10_000, { min: 1 }),
  dailyDepositLimitCents: integer('DEFAULT_DAILY_DEPOSIT_LIMIT_CENTS', 50_000, { min: 1 }),
  databaseUrlConfigured: nonEmpty('DATABASE_URL'),
  redisUrlConfigured: nonEmpty('REDIS_URL'),
  sessionSecretConfigured: String(process.env.SESSION_SECRET || '').length >= 32,
  encryptionKeyConfigured: String(process.env.DATA_ENCRYPTION_KEY || '').length >= 32,
  providerCredentialsConfigured: ['EFI_CLIENT_ID', 'EFI_CLIENT_SECRET', 'EFI_CERTIFICATE_BASE64', 'EFI_PIX_KEY'].every(nonEmpty),
  webhookVerificationConfigured: nonEmpty('WEBHOOK_SECRET') && nonEmpty('WEBHOOK_TRUSTED_PROXY_SECRET'),
  adminCredentialsConfigured: String(process.env.ADMIN_API_TOKEN || '').length >= 32
});

export function getMoneyReadiness(config = MONEY_CONFIG) {
  const checks = {
    realMoneyRequested: config.requested,
    legalReviewApproved: config.legalReviewStatus === 'approved',
    supportedPaymentProvider: config.paymentProvider === 'efi',
    paymentProviderFlag: config.paymentProviderConfigured,
    webhookSecretFlag: config.webhookSecretConfigured,
    kycProviderSelected: config.kycProvider !== 'disabled',
    kycProviderFlag: config.kycProviderConfigured,
    kycProviderAdapter: config.kycProviderAdapterReady,
    database: config.databaseUrlConfigured,
    redis: config.redisUrlConfigured,
    sessionSecret: config.sessionSecretConfigured,
    encryptionKey: config.encryptionKeyConfigured,
    providerCredentials: config.providerCredentialsConfigured,
    webhookVerification: config.webhookVerificationConfigured,
    adminCredentials: config.adminCredentialsConfigured
  };
  const blockers = Object.entries(checks).filter(([, ready]) => !ready).map(([name]) => name);
  return Object.freeze({ enabled: blockers.length === 0, requested: config.requested, checks: Object.freeze(checks), blockers: Object.freeze(blockers) });
}

export const MONEY_READINESS = getMoneyReadiness();
export const REAL_MONEY_ENABLED = MONEY_READINESS.enabled;

export function assertRealMoneyReady(operation = 'Operação financeira') {
  if (!MONEY_READINESS.enabled) {
    const error = new Error(`${operation} bloqueada: o ambiente de dinheiro real não está integralmente configurado.`);
    error.code = 'REAL_MONEY_NOT_READY';
    error.statusCode = 503;
    error.blockers = MONEY_READINESS.blockers;
    throw error;
  }
}

export const CONFIG = Object.freeze({
  REAL_MONEY_ENABLED,
  INITIAL_DEMO_CREDITS: 100,
  DUEL_ENTRY_CREDITS: 2,
  COUNTDOWN_MS: 3_000,
  RECONNECT_GRACE_MS: 15_000,
  MESSAGE_LIMIT_BYTES: 2_048,
  ACTIONS_PER_10_SECONDS: 30,
  MATCH_DURATIONS_MS: Object.freeze({ quarteto: integer('QUARTETO_MATCH_DURATION_MS', 120_000, { min: 30_000, max: 600_000 }), contexto: integer('CONTEXTO_MATCH_DURATION_MS', 120_000, { min: 30_000, max: 600_000 }) }),
  MATCHMAKING_WINDOWS: Object.freeze([
    Object.freeze({ afterMs: 0, ratingRange: 100 }),
    Object.freeze({ afterMs: 10_000, ratingRange: 200 }),
    Object.freeze({ afterMs: 20_000, ratingRange: 300 })
  ]),
  ALLOWED_ENTRY_CENTS: Object.freeze([0, 200, 500, 1_000]),
  PLATFORM_FEE_PERCENT: 15,
  RATING_INITIAL: 1_000,
  RATING_K_FACTOR: 32,
  PROVISIONAL_MATCHES: 5,
  DIVISIONS: Object.freeze([
    Object.freeze({ name: 'Bronze III', min: 0 }),
    Object.freeze({ name: 'Bronze II', min: 800 }),
    Object.freeze({ name: 'Bronze I', min: 900 }),
    Object.freeze({ name: 'Prata III', min: 1_000 }),
    Object.freeze({ name: 'Prata II', min: 1_100 }),
    Object.freeze({ name: 'Prata I', min: 1_200 }),
    Object.freeze({ name: 'Ouro III', min: 1_300 }),
    Object.freeze({ name: 'Ouro II', min: 1_400 }),
    Object.freeze({ name: 'Ouro I', min: 1_500 }),
    Object.freeze({ name: 'Platina', min: 1_650 }),
    Object.freeze({ name: 'Diamante', min: 1_800 }),
    Object.freeze({ name: 'Mestre', min: 2_000 }),
    Object.freeze({ name: 'Elite', min: 2_250 })
  ]),
  FEATURES: Object.freeze({
    realMoney: REAL_MONEY_ENABLED,
    tournaments: bool('ENABLE_TOURNAMENTS', true),
    asyncPvp: bool('ENABLE_ASYNC_PVP', false),
    dailyChallenges: bool('ENABLE_DAILY_CHALLENGES', true)
  })
});

if (MONEY_CONFIG.requested && !REAL_MONEY_ENABLED) {
  console.error(`DINHEIRO REAL BLOQUEADO. Requisitos ausentes: ${MONEY_READINESS.blockers.join(', ')}.`);
}
