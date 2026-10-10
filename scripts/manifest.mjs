// Manifest för data/db.json: format, hash-algoritm, antal, set och innehållsbaserad version.
//   node scripts/manifest.mjs           skriver data/manifest.json
//   node scripts/manifest.mjs --check   kontrollerar att manifestet stämmer med db.json (används av bygget)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const FORMAT = 2;
export const ROW_FIELDS = ['scryfall_id', 'name', 'set', 'collector_number', 'finishes', 'hash', 'oracle_id'];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function makeManifest(dbText, sets) {
  const rows = JSON.parse(dbText), sha = crypto.createHash('sha256').update(dbText).digest('hex');
  for (const [i, r] of rows.entries()) {
    if (r.length !== ROW_FIELDS.length) throw new Error(`rad ${i}: ${r.length} fält, förväntade ${ROW_FIELDS.length}`);
    if (!/^[0-9a-f]{64}$/.test(r[5])) throw new Error(`rad ${i}: ogiltig hash`);
    if (!/^[0-9a-f-]{36}$/.test(r[6])) throw new Error(`rad ${i}: ogiltigt oracle_id`);
  }
  if (new Set(rows.map(r => r[0])).size !== rows.length) throw new Error('dubbletter av scryfall_id');
  return {
    format: FORMAT,
    hash_algorithm: 'sdh1',
    hash_bits: 256,
    hash_encoding: 'hex, 64 tecken, se docs/data-format.md',
    row_fields: ROW_FIELDS,
    finishes_encoding: 'bokstäver: n = nonfoil, f = foil, e = etched',
    source: 'Scryfall API, bild "small" (JPG) per tryckning',
    count: rows.length,
    oracle_cards: new Set(rows.map(r => r[6])).size,
    sets,
    sha256: sha,
    version: 'sdh1-' + sha.slice(0, 12),
  };
}

export function readManifestInputs() {
  const dbText = fs.readFileSync(path.join(root, 'data/db.json'), 'utf8');
  const sets = JSON.parse(fs.readFileSync(path.join(root, 'data/sets.json'), 'utf8')).map(s => s[0]);
  return { dbText, sets, file: path.join(root, 'data/manifest.json') };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { dbText, sets, file } = readManifestInputs(), m = makeManifest(dbText, sets), text = JSON.stringify(m, null, 2) + '\n';
  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (cur !== text) { console.error('data/manifest.json stämmer inte med data/db.json. Kör: node scripts/manifest.mjs'); process.exit(1); }
    console.log('Manifest OK:', m.version, m.count, 'tryckningar');
  } else { fs.writeFileSync(file, text); console.log('data/manifest.json skriven:', m.version, m.count, 'tryckningar,', m.oracle_cards, 'Oracle-kort'); }
}
