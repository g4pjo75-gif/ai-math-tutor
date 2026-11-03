// server/scripts/new-license.mjs — 수동 라이선스 발급 (7-4에서 Stripe webhook으로 대체, 7-6-0 staging 옵션 추가)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateLicenseKey, hashKey } from '../src/license.js';

const serverDir = join(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, fallback = null) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const local = process.argv.includes('--local');
const staging = process.argv.includes('--staging');
const email = arg('email');
const plan = arg('plan', 'monthly');
const limit = Number(arg('limit', '300'));
const days = Number(arg('days', '30'));
const config = arg('config', staging ? 'wrangler.staging.jsonc' : null);
const dbName = arg('db', staging ? 'ai-math-tutor-db-staging' : 'ai-math-tutor-db');

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

const args = ['wrangler', 'd1', 'execute', dbName, '--file', file];
if (config) {
  args.push('--config', config);
}
args.push(local ? '--local' : '--remote');
if (!local) args.push('-y');

console.log(`[Target DB] ${dbName} (${local ? 'local' : 'remote'}${config ? `, config: ${config}` : ''})`);
execFileSync('npx', args, { cwd: serverDir, stdio: 'inherit' });

console.log('\n==============================');
console.log('LICENSE KEY (1회만 표시):', key);
console.log('==============================');
console.log({ id, plan, limit, email, db: dbName, periodEnd: new Date(periodEnd).toISOString() });
