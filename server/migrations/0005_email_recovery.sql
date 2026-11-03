-- server/migrations/0005_email_recovery.sql — 이메일 발송 기록 및 라이선스 복구 로그
ALTER TABLE licenses ADD COLUMN email_sent_at INTEGER;

CREATE TABLE IF NOT EXISTS recovery_log (
  id TEXT PRIMARY KEY,
  email_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recovery_email_time ON recovery_log (email_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_recovery_ip_time ON recovery_log (ip_hash, created_at);
