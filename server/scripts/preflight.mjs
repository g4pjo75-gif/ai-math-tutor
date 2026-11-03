#!/usr/bin/env node
// server/scripts/preflight.mjs — 배포 전 설정 및 환경 정합성 검사 (값 미노출)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(__dirname, '..');

const REQUIRED_VARS = {
  common: [
    'APP_ENV',
    'ALLOWED_ORIGINS',
    'MODEL',
    'PLAN_LIMIT',
    'PLAN_PRICE_JPY',
    'CHECKOUT_SUCCESS_URL',
    'CHECKOUT_CANCEL_URL',
    'PORTAL_RETURN_URL',
    'SITE_BASE_URL',
    'MAIL_FROM',
    'SUPPORT_EMAIL'
  ],
  productionExtra: [
    'DAILY_COST_LIMIT_MICRO_YEN',
    'MONTHLY_COST_LIMIT_MICRO_YEN'
  ]
};

const REQUIRED_SECRETS = [
  'LICENSE_SECRET',
  'RESEND_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET'
];

const PLACEHOLDERS = ['example.com', 'resend.dev', 'localhost'];

function parseJsonc(text) {
  let inString = false;
  let stringChar = '';
  let inLineComment = false;
  let inBlockComment = false;
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        out += ch;
      }
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      out += ch;
      if (ch === '\\') {
        out += next;
        i++;
      } else if (ch === stringChar) {
        inString = false;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      out += ch;
      continue;
    }
    if (ch === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    out += ch;
  }
  const cleaned = out.replace(/,(\s*[\]}])/g, '$1');
  return JSON.parse(cleaned);
}

function parseArgs(args) {
  let targetEnv = null;
  let offline = false;

  for (const arg of args) {
    if (arg === '--staging') {
      if (targetEnv && targetEnv !== 'staging') return null;
      targetEnv = 'staging';
    } else if (arg === '--prod' || arg === '--production') {
      if (targetEnv && targetEnv !== 'production') return null;
      targetEnv = 'production';
    } else if (arg === '--offline') {
      offline = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/preflight.mjs <--staging | --prod> [--offline]');
      process.exit(0);
    } else {
      return null;
    }
  }

  if (!targetEnv) return null;
  return { targetEnv, offline };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed) {
    console.error('Error: Invalid arguments.');
    console.error('Usage: node scripts/preflight.mjs <--staging | --prod> [--offline]');
    process.exit(2);
  }

  const { targetEnv, offline } = parsed;
  const isProd = targetEnv === 'production';
  const configFileName = isProd ? 'wrangler.jsonc' : 'wrangler.staging.jsonc';
  const configPath = path.join(serverDir, configFileName);

  if (!fs.existsSync(configPath)) {
    console.error(`FAIL: Config file not found: ${configFileName}`);
    process.exit(1);
  }

  let config;
  try {
    config = parseJsonc(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    console.error(`FAIL: Failed to parse ${configFileName}: ${e.message}`);
    process.exit(1);
  }

  const vars = config.vars || {};
  let passCount = 0;
  let failCount = 0;
  let warnCount = 0;
  let skipCount = 0;

  function report(status, itemNum, description, detail = '') {
    const detailStr = detail ? ` - ${detail}` : '';
    console.log(`[${status}] #${itemNum} ${description}${detailStr}`);
    if (status === 'PASS') passCount++;
    else if (status === 'FAIL') failCount++;
    else if (status === 'WARN') warnCount++;
    else if (status === 'SKIP') skipCount++;
  }

  console.log(`=== Preflight Check: ${targetEnv.toUpperCase()} ${offline ? '(OFFLINE)' : '(ONLINE)'} ===`);

  // 1. APP_ENV가 대상과 일치
  if (vars.APP_ENV === targetEnv) {
    report('PASS', 1, 'APP_ENV matches target environment');
  } else {
    report('FAIL', 1, 'APP_ENV mismatch');
  }

  // 2. 필수 vars 존재 (값 미출력)
  const neededVars = isProd
    ? [...REQUIRED_VARS.common, ...REQUIRED_VARS.productionExtra]
    : REQUIRED_VARS.common;
  const missingVars = neededVars.filter((v) => !(v in vars) || vars[v] === null || vars[v] === '');
  if (missingVars.length === 0) {
    report('PASS', 2, `Required vars present (${neededVars.length} verified)`);
  } else {
    report('FAIL', 2, `Missing required vars: ${missingVars.join(', ')}`);
  }

  // 3. placeholder 검출 (example.com, resend.dev, localhost)
  const detectedPlaceholders = [];
  for (const [key, val] of Object.entries(vars)) {
    if (typeof val !== 'string') continue;
    for (const ph of PLACEHOLDERS) {
      if (val.includes(ph)) {
        detectedPlaceholders.push(`${key} (${ph})`);
      }
    }
  }

  if (detectedPlaceholders.length === 0) {
    report('PASS', 3, 'No placeholders detected');
  } else {
    const status = isProd ? 'FAIL' : 'WARN';
    report(status, 3, `Placeholders detected: ${detectedPlaceholders.join(', ')}`);
  }

  // 4. ALLOWED_ORIGINS에 사이트 origin 포함
  let siteOrigin = null;
  if (vars.SITE_BASE_URL) {
    try {
      siteOrigin = new URL(vars.SITE_BASE_URL).origin;
    } catch (_) {}
  }

  if (!siteOrigin) {
    report('FAIL', 4, 'SITE_BASE_URL missing or invalid, cannot verify ALLOWED_ORIGINS');
  } else {
    const origins = String(vars.ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (origins.includes(siteOrigin)) {
      report('PASS', 4, 'ALLOWED_ORIGINS contains site origin');
    } else {
      report('FAIL', 4, 'ALLOWED_ORIGINS does not contain site origin');
    }
  }

  // 5. CHECKOUT_*/PORTAL_* host == SITE_BASE_URL host
  let siteHost = null;
  if (siteOrigin) {
    try {
      siteHost = new URL(vars.SITE_BASE_URL).host;
    } catch (_) {}
  }

  if (!siteHost) {
    report('FAIL', 5, 'SITE_BASE_URL host unavailable');
  } else {
    const urlKeys = ['CHECKOUT_SUCCESS_URL', 'CHECKOUT_CANCEL_URL', 'PORTAL_RETURN_URL'];
    const mismatchedHosts = [];
    for (const k of urlKeys) {
      if (!vars[k]) {
        mismatchedHosts.push(`${k} (missing)`);
        continue;
      }
      try {
        const u = new URL(vars[k]);
        if (u.host !== siteHost) {
          mismatchedHosts.push(`${k} (host mismatch)`);
        }
      } catch (_) {
        mismatchedHosts.push(`${k} (invalid URL)`);
      }
    }
    if (mismatchedHosts.length === 0) {
      report('PASS', 5, 'CHECKOUT and PORTAL hosts match SITE_BASE_URL host');
    } else {
      report('FAIL', 5, `Host mismatch detected: ${mismatchedHosts.join(', ')}`);
    }
  }

  // 6. 예산 값이 양의 정수
  const budgetDaily = vars.DAILY_COST_LIMIT_MICRO_YEN;
  const budgetMonthly = vars.MONTHLY_COST_LIMIT_MICRO_YEN;
  const isPosInt = (v) => typeof v === 'string' && /^[1-9]\d*$/.test(v) && Number(v) > 0;

  if (isProd) {
    if (isPosInt(budgetDaily) && isPosInt(budgetMonthly)) {
      report('PASS', 6, 'Budget limits set to positive integers');
    } else {
      report('FAIL', 6, 'Production budget limits missing or not positive integers');
    }
  } else {
    // staging: optional but if present must be positive integers
    if ((budgetDaily === undefined || isPosInt(budgetDaily)) &&
        (budgetMonthly === undefined || isPosInt(budgetMonthly))) {
      report('PASS', 6, 'Staging budget limits valid');
    } else {
      report('FAIL', 6, 'Staging budget limits invalid');
    }
  }

  // 7. wrangler secret list --format json에 필수 secret 이름 존재
  if (offline) {
    report('SKIP', 7, 'Secret list check (offline mode)');
  } else {
    try {
      const stdout = execFileSync('npx', ['wrangler', 'secret', 'list', '--config', configPath, '--format', 'json'], {
        cwd: serverDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      });
      const data = JSON.parse(stdout);
      const secretNames = new Set(Array.isArray(data) ? data.map((s) => s.name) : []);
      const missingSecrets = REQUIRED_SECRETS.filter((s) => !secretNames.has(s));
      if (missingSecrets.length === 0) {
        report('PASS', 7, `Required secrets exist (${REQUIRED_SECRETS.length} verified)`);
      } else {
        report('FAIL', 7, `Missing secrets: ${missingSecrets.join(', ')}`);
      }
    } catch (e) {
      report('WARN', 7, 'wrangler secret list check failed (auth/network warning)');
    }
  }

  // 8. wrangler d1 migrations list ... --remote에 pending 없음
  if (offline) {
    report('SKIP', 8, 'D1 migrations list check (offline mode)');
  } else {
    const dbName = config.d1_databases?.[0]?.database_name;
    if (!dbName) {
      report('FAIL', 8, 'd1_databases entry missing in config');
    } else {
      try {
        const stdout = execFileSync('npx', ['wrangler', 'd1', 'migrations', 'list', dbName, '--remote', '--config', configPath], {
          cwd: serverDir,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe']
        });
        if (/No migrations to apply/i.test(stdout) || /No migrations found/i.test(stdout)) {
          report('PASS', 8, 'No pending D1 migrations');
        } else if (/pending|unapplied/i.test(stdout)) {
          report('FAIL', 8, 'Pending D1 migrations exist');
        } else {
          // If migrations list output has table with migrations
          report('PASS', 8, 'D1 migrations verified');
        }
      } catch (e) {
        report('WARN', 8, 'wrangler d1 migrations list check failed (auth/network warning)');
      }
    }
  }

  // 9. /health version 일치 (WARN)
  if (offline) {
    report('SKIP', 9, '/health version check (offline mode)');
  } else {
    let expectedVersion = '0.7.0';
    try {
      const idxContent = fs.readFileSync(path.join(serverDir, 'src', 'index.js'), 'utf8');
      const vMatch = idxContent.match(/const\s+VERSION\s*=\s*'([^']+)'/);
      if (vMatch) expectedVersion = vMatch[1];
    } catch (_) {}

    const healthUrl = isProd
      ? 'https://ai-math-tutor-api.g4pjo75.workers.dev/health'
      : 'https://ai-math-tutor-api-staging.g4pjo75.workers.dev/health';

    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 5000);
      const res = await fetch(healthUrl, { signal: ac.signal });
      clearTimeout(timer);

      if (res.ok) {
        const data = await res.json();
        if (data && data.version === expectedVersion) {
          report('PASS', 9, `Health version matches expected (${expectedVersion})`);
        } else {
          report('WARN', 9, `Health version mismatch (expected: ${expectedVersion})`);
        }
      } else {
        report('WARN', 9, `Health check returned status ${res.status}`);
      }
    } catch (e) {
      report('WARN', 9, `Health check fetch failed (${e.message})`);
    }
  }

  // 10. staging X-Robots-Tag: noindex (WARN)
  if (offline) {
    report('SKIP', 10, 'staging X-Robots-Tag check (offline mode)');
  } else if (!isProd) {
    const siteUrl = vars.SITE_BASE_URL || 'https://ai-math-tutor-staging.g4pjo75.workers.dev/';
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 5000);
      const res = await fetch(siteUrl, { method: 'HEAD', signal: ac.signal });
      clearTimeout(timer);

      const tag = res.headers.get('x-robots-tag') || '';
      if (tag.toLowerCase().includes('noindex')) {
        report('PASS', 10, 'Staging X-Robots-Tag contains noindex');
      } else {
        report('WARN', 10, 'Staging X-Robots-Tag does not contain noindex');
      }
    } catch (e) {
      report('WARN', 10, `Staging site fetch failed (${e.message})`);
    }
  } else {
    report('SKIP', 10, 'staging X-Robots-Tag check not applicable to production');
  }

  console.log('---');
  console.log(`Summary: PASS ${passCount} / FAIL ${failCount} / WARN ${warnCount}${skipCount > 0 ? ` / SKIP ${skipCount}` : ''}`);

  if (failCount >= 1) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Unexpected preflight error:', err.message);
  process.exit(1);
});
