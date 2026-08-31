BEGIN;

ALTER TABLE matches ADD COLUMN IF NOT EXISTS match_type varchar(20) NOT NULL DEFAULT 'ranked';

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

ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_size_check;
ALTER TABLE tournaments ADD CONSTRAINT tournaments_size_check CHECK (size IN (8,16,32,64,128));
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS format varchar(20) NOT NULL DEFAULT 'knockout';

CREATE TABLE IF NOT EXISTS challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(24) NOT NULL UNIQUE,
  owner_user_id uuid NOT NULL REFERENCES users(id),
  target_user_id uuid REFERENCES users(id),
  mode varchar(20) NOT NULL CHECK (mode IN ('quarteto','contexto')),
  match_type varchar(20) NOT NULL CHECK (match_type IN ('casual','ranked','rewarded')),
  best_of integer NOT NULL DEFAULT 1 CHECK (best_of IN (1,3)),
  entry_cents bigint NOT NULL DEFAULT 0 CHECK (entry_cents >= 0),
  status varchar(20) NOT NULL DEFAULT 'open',
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

CREATE TABLE IF NOT EXISTS daily_challenges (
  id text PRIMARY KEY,
  day_id date NOT NULL,
  mode varchar(20) NOT NULL CHECK (mode IN ('quarteto','contexto')),
  language varchar(10) NOT NULL CHECK (language IN ('pt','en','mixed')),
  challenge_commit_hash char(64) NOT NULL,
  challenge_ciphertext text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day_id, mode, language)
);

CREATE TABLE IF NOT EXISTS daily_challenge_results (
  daily_id text NOT NULL REFERENCES daily_challenges(id),
  user_id uuid NOT NULL REFERENCES users(id),
  mode varchar(20) NOT NULL CHECK (mode IN ('quarteto','contexto')),
  solved integer NOT NULL DEFAULT 0 CHECK (solved >= 0),
  best_rank integer NOT NULL DEFAULT 9999 CHECK (best_rank >= 1),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  elapsed_ms bigint NOT NULL CHECK (elapsed_ms >= 0),
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (daily_id, user_id)
);

CREATE INDEX IF NOT EXISTS player_ratings_mode_rating_idx ON player_ratings(mode,rating DESC);
CREATE INDEX IF NOT EXISTS challenges_open_idx ON challenges(status,expires_at) WHERE status='open';
CREATE INDEX IF NOT EXISTS daily_challenge_results_rank_idx ON daily_challenge_results(daily_id,solved DESC,best_rank,elapsed_ms,attempts);
INSERT INTO schema_migrations(version) VALUES ('002_competitive_arena') ON CONFLICT DO NOTHING;
COMMIT;
