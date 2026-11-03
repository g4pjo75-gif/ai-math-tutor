// server/test/preflight.test.js — D1 마이그레이션 상태 분류 테스트
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyMigrations } from '../scripts/migration-status.mjs';

test('classifyMigrations: "✅ No migrations to apply!" -> none-pending', () => {
  const output = ' ⛅️ wrangler 4.156.0\nResource location: remote\n\n✅ No migrations to apply!\n';
  assert.equal(classifyMigrations(output), 'none-pending');
});

test('classifyMigrations: "Migrations to be applied:\\n│ 0005_email_recovery.sql │" -> pending', () => {
  const output = 'Migrations to be applied:\n│ 0005_email_recovery.sql │';
  assert.equal(classifyMigrations(output), 'pending');
});

test('classifyMigrations: 알 수 없는 문자열 -> unknown', () => {
  assert.equal(classifyMigrations('Some random output from tool'), 'unknown');
  assert.equal(classifyMigrations(''), 'unknown');
  assert.equal(classifyMigrations(null), 'unknown');
});
