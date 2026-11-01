-- server/migrations/0004_stripe.sql — Stripe checkout session id 연동
ALTER TABLE licenses ADD COLUMN stripe_session_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_licenses_session ON licenses (stripe_session_id);
