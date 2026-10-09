// Kör igenkänningen på riktiga foton i bench/ (ingår inte i repot). Se README, avsnittet Test.
// bench/labels.json: { "bild.jpg": "Kortnamn" | null }  (null = kortet finns inte i databasen)
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { loadCore } from './load.mjs';
const { SDCore, root } = loadCore();
const DB = JSON.parse(fs.readFileSync(path.join(root, 'data/db.json'), 'utf8')), flat = SDCore.makeIndex(DB);
const dir = path.join(root, 'bench'), labels = JSON.parse(fs.readFileSync(path.join(dir, 'labels.json'), 'utf8'));
let ok = 0, n = 0;
for (const [file, name] of Object.entries(labels)) {
  const { data, info } = await sharp(path.join(dir, file)).rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const img = { width: info.width, height: info.height, data: new Uint8ClampedArray(data) };
  const starts = [SDCore.detect(img), SDCore.detect(img, true), SDCore.framePrior(img, 0.95), SDCore.framePrior(img, 0.85), SDCore.framePrior(img, 0.75)].filter(Boolean);
  const t0 = Date.now(), r = SDCore.identify(img, flat, starts);
  const order = Array.from(r.dists.keys()).sort((a, b) => r.dists[a] - r.dists[b]), top = DB[order[0]], other = order.find(i => DB[i][1] !== top[1]);
  if (name) { n++; if (top[1] === name) ok++; }
  console.log(file.padEnd(14), (name ?? '(ej i db)').slice(0, 26).padEnd(27), '→', top[1].slice(0, 26).padEnd(27), 'd=' + r.dists[order[0]], 'gap=' + (r.dists[other] - r.dists[order[0]]), (Date.now() - t0) + ' ms');
}
console.log(`${ok}/${n} rätt`);
