// server/scripts/unlink-device.mjs — 기기 등록 해제 CLI
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashKey, sha256Hex } from '../src/license.js';

const serverDir = join(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, fallback = null) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const local = process.argv.includes('--local');
const staging = process.argv.includes('--staging');
const all = process.argv.includes('--all');
const email = arg('email');
const licenseKey = arg('license-key');
const deviceId = arg('device-id');
const config = arg('config', staging ? 'wrangler.staging.jsonc' : null);
const dbName = arg('db', staging ? 'ai-math-tutor-db-staging' : 'ai-math-tutor-db');

if (!email && !licenseKey) {
  console.error('Error: --email <email> or --license-key <key> is required.');
  process.exit(1);
}

if (!all && !deviceId) {
  console.error('Error: specify --all or --device-id <id>.');
  process.exit(1);
}

const esc = (v) => String(v).replace(/'/g, "''");

let whereLicense = '';
if (email) {
  whereLicense = `license_id IN (SELECT id FROM licenses WHERE LOWER(email) = '${esc(email.trim().toLowerCase())}')`;
} else {
  const keyHash = await hashKey(licenseKey);
  whereLicense = `license_id IN (SELECT id FROM licenses WHERE key_hash = '${esc(keyHash)}')`;
}

let whereDevice = '';
if (deviceId) {
  const deviceHash = await sha256Hex(deviceId);
  whereDevice = ` AND device_hash = '${esc(deviceHash)}'`;
}

const sql = `DELETE FROM devices WHERE ${whereLicense}${whereDevice};`;

const dir = mkdtempSync(join(tmpdir(), 'unlink-'));
const file = join(dir, 'unlink.sql');
writeFileSync(file, sql, 'utf8');

const args = ['wrangler', 'd1', 'execute', dbName, '--file', file];
if (config) {
  args.push('--config', config);
}
args.push(local ? '--local' : '--remote');
if (!local) args.push('-y');
args.push('--json');

try {
  const out = execFileSync('npx', args, { cwd: serverDir, encoding: 'utf8' });
  let changes = 0;
  try {
    const jsonStart = out.indexOf('[');
    const jsonEnd = out.lastIndexOf(']');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const parsed = JSON.parse(out.slice(jsonStart, jsonEnd + 1));
      const first = Array.isArray(parsed) ? parsed[0] : parsed;
      changes = first?.meta?.rows_written ?? first?.results?.[0]?.['Rows written'] ?? first?.meta?.changes ?? 0;
    }
  } catch (e) {
    changes = 0;
  }
  console.log(`Unlinked ${changes} device(s).`);
} catch (err) {
  console.error('Failed to unlink devices.');
  process.exit(1);
}
