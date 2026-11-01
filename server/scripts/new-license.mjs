// server/scripts/new-license.mjs — 수동 라이선스 발급 (7-4에서 Stripe webhook으로 대체)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateLicenseKey, hashKey } from '../src/license.js';

function arg(name, fallback = null) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const local = process.argv.includes('--local');
const email = arg('email');
const plan = arg('plan', 'monthly');
const limit = Number(arg('limit', '300'));
const days = Number(arg('days', '30'));

const key = generateLicenseKey();
const keyHash = await hashKey(key);
const id = 'lic_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
const now = Date.now();
const periodEnd = now + days * 86400000;

const esc = (v) => String(v).replace(/'/g, "''");
const sql = `INSERT INTO licenses (id, key_hash, email, plan, status, call_limit, current_period_end, created_at)
VALUES ('${esc(id)}', '${esc(keyHash)}', ${email ? `'${esc(email)}'` : 'NULL'}, '${esc(plan)}', 'active', ${limit}, ${periodEnd}, ${now});`;

const dir = mkdtempSync(join(tmpdir(), 'license-'));
const file = join(dir, 'insert.sql');
writeFileSync(file, sql, 'utf8');

const args = ['wrangler', 'd1', 'execute', 'ai-math-tutor-db', '--file', file];
args.push(local ? '--local' : '--remote');
execFileSync('npx', args, { stdio: 'inherit' });

console.log('\n==============================');
console.log('LICENSE KEY (1회만 표시):', key);
console.log('==============================');
console.log({ id, plan, limit, email, periodEnd: new Date(periodEnd).toISOString() });
