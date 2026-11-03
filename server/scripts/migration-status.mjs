// server/scripts/migration-status.mjs — D1 마이그레이션 상태 분류
export function classifyMigrations(stdout) {
  const text = String(stdout || '');
  if (/No migrations to apply/i.test(text) || /No migrations found/i.test(text)) {
    return 'none-pending';
  }
  if (/Migrations to be applied/i.test(text) || /\b\d{4}_[A-Za-z0-9_-]+\.sql\b/.test(text)) {
    return 'pending';
  }
  return 'unknown';
}
