CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  symbol TEXT NOT NULL UNIQUE,
  icon_url TEXT,
  decimals INTEGER NOT NULL DEFAULT 8 CHECK (decimals BETWEEN 0 AND 30),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  deposit_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  withdrawal_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  investment_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  conversion_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES assets(id),
  amount NUMERIC(30, 12) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  invested_amount NUMERIC(30, 12) NOT NULL DEFAULT 0 CHECK (invested_amount >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(wallet_id, asset_id)
);

CREATE TABLE IF NOT EXISTS investment_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets(id),
  name TEXT NOT NULL,
  minimum_amount NUMERIC(30, 12) NOT NULL CHECK (minimum_amount >= 0),
  maximum_amount NUMERIC(30, 12),
  reward_rate NUMERIC(20, 12) NOT NULL CHECK (reward_rate >= 0),
  rate_unit TEXT NOT NULL CHECK (rate_unit IN ('DAILY', 'WEEKLY', 'MONTHLY', 'FIXED')),
  reward_frequency TEXT NOT NULL DEFAULT 'DAILY' CHECK (reward_frequency IN ('DAILY', 'WEEKLY', 'MONTHLY', 'FIXED')),
  duration_days INTEGER CHECK (duration_days IS NULL OR duration_days > 0),
  duration_terms TEXT NOT NULL,
  fee_rate NUMERIC(20, 12) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'CLOSED')),
  risk_terms TEXT NOT NULL,
  available_from TIMESTAMPTZ,
  available_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS investments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  product_id UUID NOT NULL REFERENCES investment_products(id),
  principal NUMERIC(30, 12) NOT NULL CHECK (principal > 0),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'CANCELLED')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS g_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  investment_id UUID NOT NULL REFERENCES investments(id),
  amount NUMERIC(30, 12) NOT NULL CHECK (amount >= 0),
  reward_value NUMERIC(30, 12) NOT NULL DEFAULT 0 CHECK (reward_value >= 0),
  reference_rate NUMERIC(20, 12) NOT NULL,
  g_price_used NUMERIC(30, 12) NOT NULL CHECK (g_price_used > 0),
  period_key TEXT NOT NULL,
  calculation_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  calculation_end TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'ELAPSED_TIME',
  status TEXT NOT NULL DEFAULT 'ACCOUNTED' CHECK (status IN ('ACCOUNTED', 'REVERSED')),
  accrued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  transaction_id UUID,
  UNIQUE(investment_id, period_key)
);

CREATE TABLE IF NOT EXISTS g_generation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  investment_id UUID NOT NULL REFERENCES investments(id),
  amount NUMERIC(30, 12) NOT NULL CHECK (amount >= 0),
  calculation_start TIMESTAMPTZ NOT NULL,
  calculation_end TIMESTAMPTZ NOT NULL,
  reward_id UUID REFERENCES g_rewards(id),
  period_key TEXT NOT NULL,
  calculation_version TEXT NOT NULL DEFAULT 'v1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(investment_id, period_key)
);

CREATE TABLE IF NOT EXISTS conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  from_asset_id UUID NOT NULL REFERENCES assets(id),
  to_asset_id UUID NOT NULL REFERENCES assets(id),
  from_amount NUMERIC(30, 12) NOT NULL CHECK (from_amount > 0),
  rate NUMERIC(30, 12) NOT NULL,
  fee NUMERIC(30, 12) NOT NULL DEFAULT 0,
  to_amount NUMERIC(30, 12) NOT NULL CHECK (to_amount >= 0),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  asset_id UUID NOT NULL REFERENCES assets(id),
  network TEXT,
  amount NUMERIC(30, 12),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  provider_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  asset_id UUID NOT NULL REFERENCES assets(id),
  network TEXT,
  destination_address TEXT NOT NULL,
  amount NUMERIC(30, 12) NOT NULL CHECK (amount > 0),
  fee NUMERIC(30, 12) NOT NULL DEFAULT 0,
  net_amount NUMERIC(30, 12) NOT NULL CHECK (net_amount >= 0),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  blockchain_tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processing_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  asset_id UUID REFERENCES assets(id),
  type TEXT NOT NULL CHECK (type IN ('DEPOSIT', 'WITHDRAWAL', 'INVESTMENT', 'G_REWARD', 'CONVERSION')),
  amount NUMERIC(30, 12) NOT NULL,
  reference_id UUID,
  status TEXT NOT NULL DEFAULT 'PENDING',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets(id),
  price NUMERIC(30, 12) NOT NULL CHECK (price >= 0),
  change_24h NUMERIC(20, 12),
  source TEXT NOT NULL,
  is_live BOOLEAN NOT NULL DEFAULT FALSE,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_users (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO assets (name, symbol, icon_url, decimals, enabled, deposit_enabled, withdrawal_enabled, investment_enabled, conversion_enabled)
VALUES
  ('Genesis', 'G', NULL, 8, TRUE, FALSE, FALSE, FALSE, TRUE),
  ('Tether', 'USDT', 'https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@master/128/color/usdt.png', 6, TRUE, FALSE, FALSE, TRUE, TRUE),
  ('BNB', 'BNB', 'https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@master/128/color/bnb.png', 18, TRUE, FALSE, FALSE, TRUE, TRUE),
  ('Bitcoin', 'BTC', 'https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@master/128/color/btc.png', 8, TRUE, FALSE, FALSE, FALSE, TRUE),
  ('Ethereum', 'ETH', 'https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@master/128/color/eth.png', 18, TRUE, FALSE, FALSE, FALSE, TRUE),
  ('Solana', 'SOL', 'https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@master/128/color/sol.png', 9, TRUE, FALSE, FALSE, FALSE, TRUE)
ON CONFLICT (symbol) DO UPDATE SET
  name = EXCLUDED.name,
  icon_url = EXCLUDED.icon_url,
  decimals = EXCLUDED.decimals;

INSERT INTO platform_settings (key, value)
VALUES
  ('genesis_token', '{"name":"Genesis","symbol":"G","status":"PRE-LAUNCH","referencePrice":"0.10","description":"Genesis G has not launched yet. The displayed value is a configured reference price, not a live market price."}'::jsonb),
  ('conversion_pairs', '{"pairs":[{"from":"G","to":"USDT","rate":"0.10","fee":"0"},{"from":"G","to":"BNB","rate":"0.0001633","fee":"0"},{"from":"G","to":"BTC","rate":"0.00000146","fee":"0"}]}'::jsonb),
  ('reward_model', '{"method":"PERCENT_OF_PRINCIPAL","gPriceSource":"REFERENCE_PRICE","calculation":"elapsed_periods"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO investment_products (asset_id, name, minimum_amount, reward_rate, rate_unit, duration_terms, fee_rate, risk_terms)
SELECT id, 'USDT → Genesis G', 50, 1.5, 'DAILY', 'Flexible terms; subject to platform availability.', 0, 'Configured reward terms are not guaranteed returns. Review applicable platform terms and risks.'
FROM assets WHERE symbol = 'USDT'
AND NOT EXISTS (SELECT 1 FROM investment_products p WHERE p.name = 'USDT → Genesis G');

INSERT INTO investment_products (asset_id, name, minimum_amount, reward_rate, rate_unit, duration_terms, fee_rate, risk_terms)
SELECT id, 'BNB → Genesis G', 0.05, 1.2, 'DAILY', 'Flexible terms; subject to platform availability.', 0, 'Configured reward terms are not guaranteed returns. Review applicable platform terms and risks.'
FROM assets WHERE symbol = 'BNB'
AND NOT EXISTS (SELECT 1 FROM investment_products p WHERE p.name = 'BNB → Genesis G');

-- Compatibility additions for databases created before Phase 2.
ALTER TABLE wallet_balances ADD COLUMN IF NOT EXISTS invested_amount NUMERIC(30, 12) NOT NULL DEFAULT 0;
ALTER TABLE investment_products ADD COLUMN IF NOT EXISTS reward_frequency TEXT NOT NULL DEFAULT 'DAILY';
ALTER TABLE investment_products ADD COLUMN IF NOT EXISTS duration_days INTEGER;
ALTER TABLE investment_products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE investments ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ;
ALTER TABLE g_rewards ADD COLUMN IF NOT EXISTS reward_value NUMERIC(30, 12) NOT NULL DEFAULT 0;
ALTER TABLE g_rewards ADD COLUMN IF NOT EXISTS g_price_used NUMERIC(30, 12);
ALTER TABLE g_rewards ADD COLUMN IF NOT EXISTS period_key TEXT;
ALTER TABLE g_rewards ADD COLUMN IF NOT EXISTS calculation_start TIMESTAMPTZ;
ALTER TABLE g_rewards ADD COLUMN IF NOT EXISTS calculation_end TIMESTAMPTZ;
ALTER TABLE g_rewards ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'ELAPSED_TIME';
ALTER TABLE g_rewards ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACCOUNTED';
ALTER TABLE g_generation_events ADD COLUMN IF NOT EXISTS reward_id UUID REFERENCES g_rewards(id);
ALTER TABLE g_generation_events ADD COLUMN IF NOT EXISTS period_key TEXT;

UPDATE investment_products
SET reward_frequency = rate_unit
WHERE reward_frequency IS NULL OR reward_frequency = '';

UPDATE g_rewards
SET g_price_used = NULLIF(reference_rate, 0),
    period_key = COALESCE(period_key, to_char(accrued_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    calculation_start = COALESCE(calculation_start, accrued_at),
    calculation_end = COALESCE(calculation_end, accrued_at),
    reward_value = CASE WHEN reward_value = 0 THEN amount * NULLIF(reference_rate, 0) ELSE reward_value END
WHERE g_price_used IS NULL OR period_key IS NULL OR calculation_start IS NULL OR calculation_end IS NULL;

ALTER TABLE g_rewards ALTER COLUMN g_price_used SET NOT NULL;
ALTER TABLE g_rewards ALTER COLUMN period_key SET NOT NULL;
ALTER TABLE g_rewards ALTER COLUMN calculation_start SET NOT NULL;
ALTER TABLE g_rewards ALTER COLUMN calculation_end SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS g_rewards_investment_period_idx
  ON g_rewards (investment_id, period_key);
CREATE UNIQUE INDEX IF NOT EXISTS g_generation_events_investment_period_idx
  ON g_generation_events (investment_id, period_key);
CREATE INDEX IF NOT EXISTS investments_user_status_idx ON investments (user_id, status);
CREATE INDEX IF NOT EXISTS g_rewards_user_accrued_idx ON g_rewards (user_id, accrued_at DESC);