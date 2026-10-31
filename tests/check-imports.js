// tests/check-imports.js — Phase 4-B gate (ESM export/import consistency)
const fs = require('fs');
const path = require('path');

const APPS = ['math', 'english'];
let failed = false;

for (const app of APPS) {
  const dir = path.join(__dirname, '..', app);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  const exportsOf = new Map();
  const importsOf = [];

  for (const file of files) {
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    const names = new Set();
    const EXP = /^[ \t]*export\s+(?:async\s+)?(?:function|let|const|var|class)\s+([A-Za-z_$][\w$]*)/gm;
    let m;
    while ((m = EXP.exec(src))) names.add(m[1]);
    exportsOf.set(file, names);

    const IMP = /import\s*\{([^}]*)\}\s*from\s*'\.\/([^']+)'/g;
    while ((m = IMP.exec(src))) {
      const list = m[1].split(',').map((s) => s.trim()).filter(Boolean);
      importsOf.push({ from: file, target: m[2], list });
    }
  }

  let missing = 0;
  let total = 0;
  for (const imp of importsOf) {
    if (!exportsOf.has(imp.target)) {
      console.log(`  [${app}] ${imp.from}: missing module './${imp.target}'`);
      failed = true;
      continue;
    }
    for (const name of imp.list) {
      total++;
      if (!exportsOf.get(imp.target).has(name)) {
        console.log(`  [${app}] ${imp.from}: '${name}' is not exported by './${imp.target}'`);
        missing++;
        failed = true;
      }
    }
  }
  console.log(`[${app}] files=${files.length} import-bindings=${total} missing=${missing}`);
}
if (failed) process.exit(1);
console.log('ALL PASSED');
