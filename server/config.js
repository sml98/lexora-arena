export const REAL_MONEY_ENABLED = false;

export const CONFIG = Object.freeze({
  REAL_MONEY_ENABLED,
  INITIAL_DEMO_CREDITS: 100,
  DUEL_ENTRY_CREDITS: 2,
  COUNTDOWN_MS: 3_000,
  RECONNECT_GRACE_MS: 10_000,
  MESSAGE_LIMIT_BYTES: 2_048,
  ACTIONS_PER_10_SECONDS: 30,
  MATCH_DURATIONS_MS: Object.freeze({ termo: 60_000, anagrama: 60_000, quarteto: 90_000 }),
  RATING_INITIAL: 1_000,
  RATING_K_FACTOR: 32,
  PROVISIONAL_MATCHES: 5
});

if (process.env.REAL_MONEY_ENABLED === 'true') {
  console.warn('REAL_MONEY_ENABLED permanece false: este MVP aceita somente créditos virtuais de demonstração.');
}

