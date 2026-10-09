// Bygger data/db.json: hämtar alla tryckningar i seten i data/sets.json från Scryfall, hashar "small"-bilden.
// OBS: hash.js får inte ändras utan att databasen byggs om (samma kod används på telefonen).
// Scryfalls regler: 50-100 ms mellan anrop, User-Agent och Accept satta. Bilderna på *.scryfall.io har ingen gräns.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = { Math, Float64Array, Uint8Array, parseInt };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'src/hash.js'), 'utf8') + '\nthis.SDH = SDH;', ctx);
const { SDH } = ctx;
const H = { 'User-Agent': 'SpelldiggerScanner/0.1 (+https://github.com/callmekenneth)', Accept: 'application/json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sets = JSON.parse(fs.readFileSync(path.join(root, 'data/sets.json'), 'utf8')).map(s => s[0]);
const rows = [];
for (const code of sets) {
  let url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent('e:' + code)}&unique=prints&order=set`;
  while (url) {
    const j = await (await fetch(url, { headers: H })).json();
    for (const c of j.data || []) {
      const img = c.image_uris?.small || c.card_faces?.[0]?.image_uris?.small;
      if (!img) { console.warn('ingen bild:', c.id); continue; }
      rows.push({ id: c.id, n: c.name, s: c.set, c: c.collector_number, f: (c.finishes || []).map(x => x[0]).join(''), img });
    }
    url = j.has_more ? j.next_page : null; await sleep(120);
  }
  console.log(code, rows.length);
}
const out = new Array(rows.length); let next = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (next < rows.length) {
    const i = next++, r = rows[i];
    const buf = Buffer.from(await (await fetch(r.img)).arrayBuffer());
    const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    out[i] = [r.id, r.n, r.s, r.c, r.f, SDH.hash({ width: info.width, height: info.height, data })];
  }
}));
fs.writeFileSync(path.join(root, 'data/db.json'), JSON.stringify(out));
console.log('data/db.json skriven:', out.length, 'tryckningar');
