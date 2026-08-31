BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL,
  email varchar(254) NOT NULL,
  phone_e164 varchar(20) NOT NULL,
  password_hash text NOT NULL,
  cpf_ciphertext text NOT NULL,
  cpf_lookup_hash char(64) NOT NULL,
  birth_date date NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'pending_verification'
    CHECK (status IN ('pending_verification','active','self_excluded','fraud_blocked','closed')),
  email_verified_at timestamptz,
  phone_verified_at timestamptz,
  kyc_status varchar(30) NOT NULL DEFAULT 'pending'
    CHECK (kyc_status IN ('pending','in_review','approved','rejected','expired')),
  kyc_provider varchar(40),
  kyc_external_id varchar(120),
  self_excluded_until timestamptz,
  daily_entry_limit_cents bigint NOT NULL CHECK (daily_entry_limit_cents > 0),
  daily_deposit_limit_cents bigint NOT NULL CHECK (daily_deposit_limit_cents > 0),
  terms_version varchar(30) NOT NULL,
  terms_accepted_at timestamptz NOT NULL,
  privacy_version varchar(30) NOT NULL,
  privacy_accepted_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_phone_unique UNIQUE (phone_e164),
  CONSTRAINT users_cpf_unique UNIQUE (cpf_lookup_hash),
  CONSTRAINT users_adult_birth_date CHECK (birth_date <= (CURRENT_DATE - INTERVAL '18 years')::date)
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  token_hash char(64) NOT NULL UNIQUE,
  user_agent_hash char(64),
  ip_hash char(64),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type varchar(20) NOT NULL CHECK (owner_type IN ('user','platform')),
  owner_id uuid,
  bucket varchar(30) NOT NULL CHECK (bucket IN ('available','locked','prize_pending','withdrawal_processing','commission')),
  currency char(3) NOT NULL DEFAULT 'BRL' CHECK (currency = 'BRL'),
  balance_cents bigint NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (owner_type, owner_id, bucket, currency),
  CHECK ((owner_type = 'user' AND owner_id IS NOT NULL AND bucket <> 'commission') OR
         (owner_type = 'platform' AND owner_id IS NULL AND bucket = 'commission'))
);

INSERT INTO wallet_accounts(owner_type,owner_id,bucket,currency)
VALUES ('platform',NULL,'commission','BRL')
ON CONFLICT (owner_type,owner_id,bucket,currency) DO NOTHING;

CREATE TABLE IF NOT EXISTS money_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  kind varchar(30) NOT NULL CHECK (kind IN ('deposit','withdrawal','refund','match_reservation','match_settlement','tournament_reservation','tournament_settlement')),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  fee_cents bigint NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'BRL' CHECK (currency = 'BRL'),
  status varchar(30) NOT NULL CHECK (status IN ('created','pending','confirmed','under_review','sent','completed','failed','cancelled','refunded')),
  provider varchar(40),
  external_id varchar(160),
  idempotency_key varchar(160) NOT NULL,
  match_id uuid,
  tournament_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, idempotency_key),
  UNIQUE NULLS NOT DISTINCT (provider, external_id)
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence bigserial UNIQUE NOT NULL,
  operation_id uuid NOT NULL REFERENCES money_operations(id),
  account_id uuid NOT NULL REFERENCES wallet_accounts(id),
  user_id uuid REFERENCES users(id),
  entry_type varchar(40) NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents <> 0),
  currency char(3) NOT NULL DEFAULT 'BRL' CHECK (currency = 'BRL'),
  balance_before_cents bigint NOT NULL CHECK (balance_before_cents >= 0),
  balance_after_cents bigint NOT NULL CHECK (balance_after_cents >= 0),
  match_id uuid,
  tournament_id uuid,
  provider varchar(40),
  external_id varchar(160),
  previous_hash char(64),
  integrity_hash char(64) NOT NULL UNIQUE,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (balance_after_cents = balance_before_cents + amount_cents)
);

CREATE OR REPLACE FUNCTION prevent_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ledger_entries_no_update ON ledger_entries;
CREATE TRIGGER ledger_entries_no_update BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider varchar(40) NOT NULL,
  external_event_id varchar(180) NOT NULL,
  payload_hash char(64) NOT NULL,
  verified boolean NOT NULL,
  processed_at timestamptz,
  processing_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_event_id)
);

CREATE TABLE IF NOT EXISTS matches (
  id uuid PRIMARY KEY,
  mode varchar(30) NOT NULL,
  match_type varchar(20) NOT NULL DEFAULT 'ranked' CHECK (match_type IN ('casual','ranked','rewarded','tournament')),
  language varchar(10) NOT NULL,
  status varchar(30) NOT NULL,
  financial boolean NOT NULL DEFAULT false,
  entry_cents bigint NOT NULL DEFAULT 0 CHECK (entry_cents >= 0),
  gross_pot_cents bigint NOT NULL DEFAULT 0 CHECK (gross_pot_cents >= 0),
  commission_cents bigint NOT NULL DEFAULT 0 CHECK (commission_cents >= 0),
  prize_cents bigint NOT NULL DEFAULT 0 CHECK (prize_cents >= 0),
  challenge_id varchar(160) NOT NULL,
  challenge_commit_hash char(64) NOT NULL,
  challenge_ciphertext text NOT NULL,
  challenge_reveal jsonb,
  winner_id uuid REFERENCES users(id),
  tie boolean NOT NULL DEFAULT false,
  finish_reason varchar(40),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  ended_at timestamptz,
  settled_at timestamptz
);

CREATE TABLE IF NOT EXISTS match_players (
  match_id uuid NOT NULL REFERENCES matches(id),
  user_id uuid NOT NULL REFERENCES users(id),
  score bigint NOT NULL DEFAULT 0,
  elapsed_ms bigint,
  result varchar(20),
  PRIMARY KEY (match_id, user_id)
);

CREATE TABLE IF NOT EXISTS player_ratings (
  user_id uuid NOT NULL REFERENCES users(id),
  mode varchar(20) NOT NULL CHECK (mode IN ('quarteto','contexto')),
  rating integer NOT NULL DEFAULT 1000 CHECK (rating >= 100),
  games integer NOT NULL DEFAULT 0 CHECK (games >= 0),
  wins integer NOT NULL DEFAULT 0 CHECK (wins >= 0),
  losses integer NOT NULL DEFAULT 0 CHECK (losses >= 0),
  draws integer NOT NULL DEFAULT 0 CHECK (draws >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, mode)
);

CREATE TABLE IF NOT EXISTS match_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id),
  event_index bigint NOT NULL,
  user_id uuid REFERENCES users(id),
  event_type varchar(50) NOT NULL,
  safe_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  focus_state varchar(20),
  previous_hash char(64),
  integrity_hash char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, event_index),
  UNIQUE (match_id, integrity_hash)
);

CREATE TABLE IF NOT EXISTS tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL,
  size integer NOT NULL CHECK (size IN (8,16,32,64,128)),
  mode varchar(30) NOT NULL,
  format varchar(20) NOT NULL DEFAULT 'knockout' CHECK (format IN ('qualifier','knockout','hybrid')),
  entry_cents bigint NOT NULL CHECK (entry_cents > 0),
  status varchar(30) NOT NULL,
  minimum_players integer NOT NULL CHECK (minimum_players BETWEEN 2 AND size),
  commission_percent integer NOT NULL CHECK (commission_percent BETWEEN 0 AND 100),
  prize_distribution jsonb NOT NULL,
  starts_at timestamptz NOT NULL,
  settled_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tournament_entries (
  tournament_id uuid NOT NULL REFERENCES tournaments(id),
  user_id uuid NOT NULL REFERENCES users(id),
  operation_id uuid NOT NULL REFERENCES money_operations(id),
  seed integer,
  status varchar(20) NOT NULL DEFAULT 'confirmed',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, user_id)
);

CREATE TABLE IF NOT EXISTS tournament_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments(id),
  round_index integer NOT NULL CHECK (round_index >= 0),
  match_index integer NOT NULL CHECK (match_index >= 0),
  pvp_match_id uuid REFERENCES matches(id),
  first_user_id uuid REFERENCES users(id),
  second_user_id uuid REFERENCES users(id),
  winner_id uuid REFERENCES users(id),
  loser_id uuid REFERENCES users(id),
  status varchar(20) NOT NULL DEFAULT 'waiting',
  is_third_place boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (tournament_id, round_index, match_index, is_third_place)
);

CREATE TABLE IF NOT EXISTS fraud_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  match_id uuid REFERENCES matches(id),
  risk_score integer NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  reasons jsonb NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','cleared','confirmed','appealed')),
  assigned_admin_id uuid,
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(24) NOT NULL UNIQUE,
  owner_user_id uuid NOT NULL REFERENCES users(id),
  target_user_id uuid REFERENCES users(id),
  mode varchar(20) NOT NULL CHECK (mode IN ('quarteto','contexto')),
  match_type varchar(20) NOT NULL CHECK (match_type IN ('casual','ranked','rewarded')),
  best_of integer NOT NULL DEFAULT 1 CHECK (best_of IN (1,3)),
  entry_cents bigint NOT NULL DEFAULT 0 CHECK (entry_cents >= 0),
  status varchar(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','declined','expired','cancelled')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid,
  action varchar(80) NOT NULL,
  target_type varchar(40) NOT NULL,
  target_id text NOT NULL,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ledger_entries_account_sequence_idx ON ledger_entries(account_id, sequence DESC);
CREATE INDEX IF NOT EXISTS money_operations_user_created_idx ON money_operations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_webhook_unprocessed_idx ON payment_webhook_events(received_at) WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS match_events_match_index_idx ON match_events(match_id, event_index);
CREATE INDEX IF NOT EXISTS auth_sessions_user_active_idx ON auth_sessions(user_id, expires_at) WHERE revoked_at IS NULL;

INSERT INTO schema_migrations(version) VALUES ('001_production_core') ON CONFLICT DO NOTHING;
COMMIT;
