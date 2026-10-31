// tests/check-actions.js — Phase 4-A gate
const fs = require('fs');
const path = require('path');

const APPS = ['math', 'english'];
const partial = process.argv.includes('--partial');
let failed = false;

for (const app of APPS) {
  const dir = path.join(__dirname, '..', app);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => path.join(dir, f));
  files.push(path.join(dir, 'index.html'));

  const used = new Set();
  let inline = 0;
  let escapeCalls = 0;

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    inline += (src.match(/\son(click|change|input|keydown)\s*=/g) || []).length;
    escapeCalls += (src.match(/escapeJsString\s*\(/g) || []).length;
    const NAME = /data-(?:action|change|input|enter)\s*=\s*"([^"]+)"/g;
    let m;
    while ((m = NAME.exec(src))) used.add(m[1]);
  }

  const mapSrc = fs.readFileSync(path.join(dir, 'actions-map.js'), 'utf8');
  const defined = new Set();
  const KEY = /^\s*'([a-z0-9-]+)':/gm;
  let k;
  while ((k = KEY.exec(mapSrc))) defined.add(k[1]);

  const missing = [...used].filter((n) => !defined.has(n));
  const unused = [...defined].filter((n) => !used.has(n));

  console.log(`[${app}] used=${used.size} defined=${defined.size} inline=${inline} escapeJsString=${escapeCalls}`);
  if (missing.length) { console.log(`  FAIL undefined actions: ${missing.join(', ')}`); failed = true; }
  if (unused.length) console.log(`  WARN unused actions: ${unused.join(', ')}`);
  if (!partial && inline) { console.log(`  FAIL inline handlers remain: ${inline}`); failed = true; }
}

if (failed) process.exit(1);
console.log(partial ? 'PARTIAL OK' : 'ALL PASSED');
