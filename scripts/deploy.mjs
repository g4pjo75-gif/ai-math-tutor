#!/usr/bin/env node
// scripts/deploy.mjs — 安全なデプロイラッパー
// - working tree が dirty なら拒否
// - production は main / push 済みを要求
// - デプロイ後に commit / Version ID を docs/DEPLOY_LOG.md へ自動追記
//
// Usage:
//   node scripts/deploy.mjs staging-site
//   node scripts/deploy.mjs prod-site
//   node scripts/deploy.mjs staging-api
//   node scripts/deploy.mjs prod-api
//   node scripts/deploy.mjs prod-site --dry-run

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = path.join(root, 'server');
const logPath = path.join(root, 'docs', 'DEPLOY_LOG.md');

const TARGETS = {
  'staging-site': {
    env: 'staging',
    target: 'site',
    label: 'Staging Site',
    cwd: root,
    cmd: ['npm', 'run', 'deploy:site:staging'],
    config: 'wrangler.jsonc',
    url: 'https://ai-math-tutor-staging.g4pjo75.workers.dev/'
  },
  'prod-site': {
    env: 'production',
    target: 'site',
    label: 'Production Site',
    cwd: root,
    cmd: ['npm', 'run', 'deploy:site:prod'],
    config: 'wrangler.site.jsonc',
    url: 'https://gakushulab.com/'
  },
  'staging-api': {
    env: 'staging',
    target: 'api',
    label: 'Staging API',
    cwd: serverDir,
    cmd: ['npm', 'run', 'deploy:staging'],
    config: 'wrangler.staging.jsonc',
    url: 'https://ai-math-tutor-api-staging.g4pjo75.workers.dev/health'
  },
  'prod-api': {
    env: 'production',
    target: 'api',
    label: 'Production API',
    cwd: serverDir,
    cmd: ['npx', 'wrangler', 'deploy'],
    config: 'wrangler.jsonc',
    url: 'https://ai-math-tutor-api.g4pjo75.workers.dev/health'
  }
};

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts
  }).trim();
}

function fail(message, code = 1) {
  console.error(`\n❌ ${message}\n`);
  process.exit(code);
}

function printHelp() {
  console.log(`
Usage:
  node scripts/deploy.mjs <target> [--dry-run] [--allow-dirty]

Targets:
  staging-site   Staging site  (ai-math-tutor-staging)
  prod-site      Production site (ai-math-tutor-site / gakushulab.com)
  staging-api    Staging API   (ai-math-tutor-api-staging)
  prod-api       Production API (ai-math-tutor-api)

Options:
  --dry-run      Run checks only, do not deploy
  --allow-dirty  Skip the clean-tree check (not recommended)
`);
}

const args = process.argv.slice(2);
if (args.includes('-h') || args.includes('--help')) {
  printHelp();
  process.exit(0);
}

const targetKey = args.find((a) => !a.startsWith('-'));
const flags = new Set(args.filter((a) => a.startsWith('-')));
const dryRun = flags.has('--dry-run');
const allowDirty = flags.has('--allow-dirty');

if (!targetKey || !TARGETS[targetKey]) {
  printHelp();
  fail('Unknown or missing target.', 2);
}

const target = TARGETS[targetKey];
const configPath = path.join(target.cwd, target.config);

console.log(`\n=== Deploy: ${target.label} (${target.env} / ${target.target}) ===`);

if (!fs.existsSync(configPath)) {
  fail(`Config not found: ${path.relative(root, configPath)}`);
}
if (!fs.existsSync(logPath)) {
  fail('docs/DEPLOY_LOG.md not found. Create it before deploying.');
}

// --- Git checks -----------------------------------------------------------
const branch = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
const commit = sh('git', ['rev-parse', '--short', 'HEAD']);

const statusLines = sh('git', ['status', '--porcelain', '--untracked-files=all'])
  .split('\n')
  .filter(Boolean)
  .filter((line) => !line.includes('docs/DEPLOY_LOG.md'));

if (statusLines.length > 0) {
  if (!allowDirty) {
    console.error('Working tree is not clean:');
    console.error(statusLines.map((l) => `  ${l}`).join('\n'));
    console.error('\nCommit or stash first. (Use --allow-dirty only for emergencies.)');
    process.exit(1);
  }
  console.warn('⚠️  Working tree is dirty (--allow-dirty). Deploying uncommitted changes.');
}

let upstreamOk = false;
let ahead = 0;
try {
  sh('git', ['rev-parse', '--verify', '@{u}']);
  upstreamOk = true;
  ahead = Number(sh('git', ['rev-list', '--count', '@{u}..HEAD'])) || 0;
} catch {
  upstreamOk = false;
}

if (target.env === 'production') {
  if (branch !== 'main') {
    fail(`Production deploys must run from main (current: ${branch}).`);
  }
  if (!upstreamOk) {
    fail('Production deploy requires an upstream branch. Push main first.');
  }
  if (ahead > 0) {
    fail(`Local main is ${ahead} commit(s) ahead of origin. Push first.`);
  }
} else {
  if (branch !== 'main') {
    console.warn(`⚠️  Staging deploy from branch "${branch}" (not main).`);
  }
  if (upstreamOk && ahead > 0) {
    console.warn(`⚠️  ${ahead} unpushed commit(s) on ${branch}.`);
  }
}

let operator = '';
try {
  operator = sh('git', ['config', 'user.name']);
} catch {
  operator = '';
}
operator = (operator || process.env.USER || 'local').replace(/\|/g, '/').slice(0, 40);

console.log(`  branch : ${branch}`);
console.log(`  commit : ${commit}`);
console.log(`  config : ${path.relative(root, configPath)}`);
console.log(`  cmd    : ${target.cmd.join(' ')}`);

if (dryRun) {
  console.log('\n(dry-run) All checks passed. No deploy performed.');
  process.exit(0);
}

// --- Deploy ---------------------------------------------------------------
const res = spawnSync(target.cmd[0], target.cmd.slice(1), {
  cwd: target.cwd,
  encoding: 'utf8',
  stdio: ['inherit', 'pipe', 'pipe'],
  env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }
});

if (res.stdout) process.stdout.write(res.stdout);
if (res.stderr) process.stderr.write(res.stderr);

const combined = `${res.stdout || ''}\n${res.stderr || ''}`.replace(/\x1b\[[0-9;]*m/g, '');
const versionMatch = combined.match(/Current Version ID:\s*([0-9a-f-]{36})/i);
let versionId = versionMatch ? versionMatch[1] : 'unknown';

// Fallback: read the newest deployment version from wrangler
if (versionId === 'unknown' && res.status === 0) {
  try {
    const listOut = execFileSync(
      'npx',
      ['wrangler', 'deployments', 'list', '--config', target.config, '--json'],
      {
        cwd: target.cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }
      }
    );
    const list = JSON.parse(listOut);
    const newest = Array.isArray(list)
      ? list.slice().sort((a, b) => new Date(b.created_on) - new Date(a.created_on))[0]
      : null;
    const fallback = newest && newest.versions && newest.versions[0] && newest.versions[0].version_id;
    if (fallback) versionId = fallback;
  } catch {
    // keep 'unknown'
  }
}

const ok = res.status === 0;

// --- Append to deploy log -------------------------------------------------
const now = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
}).format(new Date());

const noteParts = [branch, operator];
if (statusLines.length > 0) noteParts.push('dirty');
if (!ok) {
  const errLine = combined.split('\n').map((l) => l.trim()).find(Boolean) || 'deploy failed';
  noteParts.push(errLine.replace(/\|/g, '/').slice(0, 100));
}

const row = `| ${now} | ${target.env} | ${target.target} | \`${commit}\` | \`${versionId}\` | ${ok ? 'OK' : 'FAIL'} | ${noteParts.join(' / ')} |\n`;

let logContent = fs.readFileSync(logPath, 'utf8');
if (!logContent.endsWith('\n')) {
  fs.appendFileSync(logPath, '\n');
}
fs.appendFileSync(logPath, row);

if (!ok) {
  fail(`Deploy failed. Log updated: docs/DEPLOY_LOG.md`, 1);
}

console.log('\n=== Deploy complete ===');
console.log(`  env      : ${target.env}`);
console.log(`  target   : ${target.target}`);
console.log(`  commit   : ${commit}`);
console.log(`  version  : ${versionId}`);
console.log(`  url      : ${target.url}`);
console.log(`  log      : docs/DEPLOY_LOG.md`);
console.log('\nCommit the log:');
console.log('  git add docs/DEPLOY_LOG.md');
console.log(`  git commit -m "chore(deploy): record ${target.env} ${target.target} ${commit}"`);
