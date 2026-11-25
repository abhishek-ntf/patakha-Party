// Static check: every relative import resolves and every named import is exported.
import fs from 'node:fs';
import path from 'node:path';
const root = 'src';
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); f.isDirectory() ? walk(p) : p.endsWith('.js') && files.push(p); } })(root);
let bad = 0;
const exportsOf = (src) => {
  const s = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:class|function|const|let)\s+([A-Za-z0-9_$]+)/g)) s.add(m[1]);
  return s;
};
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/import\s+(?:\*\s+as\s+\w+|\{([^}]*)\}|\w+)\s+from\s+['"]([^'"]+)['"]/g)) {
    const spec = m[2];
    if (!spec.startsWith('.')) continue;
    const target = path.resolve(path.dirname(f), spec);
    if (!fs.existsSync(target)) { console.log('MISSING FILE', f, '->', spec); bad++; continue; }
    if (m[1]) {
      const ex = exportsOf(fs.readFileSync(target, 'utf8'));
      for (const name of m[1].split(',').map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean)) {
        if (!ex.has(name)) { console.log('MISSING EXPORT', name, 'in', spec, 'imported by', f); bad++; }
      }
    }
  }
  const imp = src.match(/import\s+['"](\.[^'"]+)['"]/);
  if (imp && !fs.existsSync(path.resolve(path.dirname(f), imp[1]))) { console.log('MISSING', imp[1], f); bad++; }
}
console.log(bad ? `${bad} problem(s)` : `OK: ${files.length} modules, imports/exports consistent`);
