// Sätter ihop dist/index.html (en enda fil) från src/ och data/.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const strip = (s, name) => s.replace(`if (typeof module !== 'undefined') module.exports = ${name};`, '');
let html = read('src/page.template.html');
html = html.replace('/*__SDH__*/', () => read('src/hash.js'))
  .replace('/*__CORE__*/', () => strip(read('src/core.js'), 'SDCore'))
  .replace('/*__LIVE__*/', () => strip(read('src/live.js'), 'SDLive'))
  .replace('/*__DB__*/', () => read('data/db.json').trim())
  .replace('/*__SETS__*/', () => JSON.stringify(JSON.parse(read('data/sets.json'))));
const doc = '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n' + html + '\n</html>\n';
const script = doc.match(/<script>([\s\S]*?)<\/script>/g).pop().replace(/^<script>|<\/script>$/g, '');
try { new vm.Script(script); } catch (e) { console.error('Syntaxfel i sidans script:', e.message); process.exit(1); }
if (process.argv.includes('--check')) { console.log('Syntax OK,', doc.length, 'tecken'); process.exit(0); }
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/index.html'), doc);
fs.writeFileSync(path.join(root, 'dist/.nojekyll'), '');
console.log('dist/index.html skriven,', (doc.length / 1024).toFixed(0), 'kB');
