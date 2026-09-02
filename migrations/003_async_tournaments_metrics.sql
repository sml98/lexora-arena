BEGIN;

ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_size_check;
ALTER TABLE tournaments ADD CONSTRAINT tournaments_size_check CHECK (size BETWEEN 8 AND 128);
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS kind varchar(20) NOT NULL DEFAULT 'custom'
  CHECK (kind IN ('custom','sprint','master'));
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS maximum_players integer;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS ideal_players integer;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS countdown_started_at timestamptz;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS sequence_number integer;

UPDATE tournaments SET maximum_players=size WHERE maximum_players IS NULL;
UPDATE tournaments SET ideal_players=minimum_players WHERE ideal_players IS NULL;
ALTER TABLE tournaments ALTER COLUMN maximum_players SET NOT NULL;
ALTER TABLE tournaments ALTER COLUMN ideal_players SET NOT NULL;
ALTER TABLE tournaments ALTER COLUMN maximum_players SET DEFAULT 8;
ALTER TABLE tournaments ALTER COLUMN ideal_players SET DEFAULT 8;
ALTER TABLE tournaments ADD CONSTRAINT tournaments_capacity_check
  CHECK (minimum_players BETWEEN 2 AND maximum_players AND ideal_players BETWEEN minimum_players AND maximum_players);

CREATE TABLE IF NOT EXISTS async_challenges (
  id uuid PRIMARY KEY,
  code varchar(24) NOT NULL UNIQUE,
  owner_user_id uuid NOT NULL REFERENCES users(id),
  opponent_user_id uuid REFERENCES users(id),
  mode varchar(20) NOT NULL CHECK (mode IN ('quarteto','contexto')),
  language varchar(10) NOT NULL CHECK (language IN ('pt','en','mixed')),
  match_type varchar(20) NOT NULL CHECK (match_type IN ('casual','ranked','rewarded')),
  engine_version varchar(40) NOT NULL,
  entry_cents bigint NOT NULL DEFAULT 0 CHECK (entry_cents >= 0),
  status varchar(30) NOT NULL CHECK (status IN ('owner_playing','awaiting_opponent','opponent_playing','completed','expired','cancelled','under_review')),
  challenge_commit_hash char(64) NOT NULL,
  challenge_ciphertext text NOT NULL,
  owner_result_ciphertext text,
  opponent_result_ciphertext text,
  winner_user_id uuid REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS async_challenges_open_idx
  ON async_challenges(mode,language,match_type,created_at)
  WHERE status='awaiting_opponent';
CREATE INDEX IF NOT EXISTS async_challenges_expiration_idx
  ON async_challenges(expires_at)
  WHERE status IN ('owner_playing','awaiting_opponent');
CREATE INDEX IF NOT EXISTS matches_business_metrics_idx
  ON matches(ended_at,financial,status) WHERE status='ended';

INSERT INTO schema_migrations(version) VALUES ('003_async_tournaments_metrics') ON CONFLICT DO NOTHING;
COMMIT;
