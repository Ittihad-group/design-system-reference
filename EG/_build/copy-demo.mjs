// Builds the public demo bundle into EG/dist — ONLY what the interactive demo needs.
// Internal material (docs/, *.md, sample PDFs, handoff, scripts, screens) is never copied, so it can never be served,
// no matter how Vercel is triggered (Git push or CLI).
import { cpSync, rmSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const SKIP_ASSETS = new Set(['samples', 'previews', 'ASSETS.md']);
const copy = (rel, filter) => { const from = join(root, rel); if (existsSync(from)) cpSync(from, join(out, rel), { recursive: true, filter }); };

copy('prototype');                       // the ERP demo (launcher + super-admin app)
copy('css'); copy('js');                 // shared design-system css/js loaded via ../../
copy('assets', (src) => !SKIP_ASSETS.has(src.split(/[\\/]/).pop()) || src === join(root, 'assets'));
for (const f of readdirSync(root)) {      // HTML spec pages the demo links to (hr-*.html, reports.html, ...)
  if (extname(f) === '.html' && statSync(join(root, f)).isFile()) cpSync(join(root, f), join(out, f));
}
copy('robots.txt');

const count = (d) => readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(join(d, e.name)) : 1), 0);
const leaked = ['docs', 'handoff', 'scripts', 'screens', 'PRODUCT.md', 'README.md', 'DESIGN.md'].filter((p) => existsSync(join(out, p)));
if (leaked.length) { console.error('Refusing to build: internal paths in bundle:', leaked.join(', ')); process.exit(1); }
console.log('demo bundle ready: ' + count(out) + ' files in dist/');
