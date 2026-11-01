CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  email TEXT,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plan TEXT NOT NULL DEFAULT 'monthly',
  status TEXT NOT NULL DEFAULT 'active',
  call_limit INTEGER NOT NULL DEFAULT 300,
  current_period_end INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  license_id TEXT NOT NULL,
  device_hash TEXT NOT NULL,
  first_seen INTEGER,
  last_seen INTEGER,
  PRIMARY KEY (license_id, device_hash)
);

CREATE TABLE IF NOT EXISTS usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  license_id TEXT NOT NULL,
  period TEXT NOT NULL,
  route TEXT NOT NULL,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_license_period ON usage (license_id, period);

CREATE TABLE IF NOT EXISTS cache (
  fp TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
