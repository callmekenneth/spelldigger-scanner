// Läser in hash.js, core.js och live.js i en vm-kontext (samma kod som sidan kör).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function loadCore() {
  const ctx = { console, Math, Uint32Array, Uint16Array, Uint8Array, Int32Array, Float32Array, Float64Array, Uint8ClampedArray, parseInt, Infinity, performance };
  vm.createContext(ctx);
  const src = ['hash.js', 'core.js', 'live.js'].map(f => fs.readFileSync(path.join(root, 'src', f), 'utf8').replace('if (typeof module', '//')).join('\n');
  vm.runInContext(src + '\nthis.SDH = SDH; this.SDCore = SDCore; this.SDLive = SDLive;', ctx);
  return { SDH: ctx.SDH, SDCore: ctx.SDCore, SDLive: ctx.SDLive, root };
}
