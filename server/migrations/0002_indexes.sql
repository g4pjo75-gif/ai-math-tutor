CREATE INDEX IF NOT EXISTS idx_usage_license_created ON usage (license_id, created_at);
CREATE INDEX IF NOT EXISTS idx_cache_created ON cache (created_at);
