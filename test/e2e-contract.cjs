// Webbläsartest av händelsekontraktet (docs/integration.md) med falsk kamera. Kräver Playwright + Chromium:
//   npm i -g playwright   (eller använd en befintlig installation; sätt NODE_PATH)
//   ffmpeg -loop 1 -i bench/IMG_5786.jpg -vf scale=540:720 -t 6 -r 15 -q:v 3 /tmp/sharp.mjpeg
//   FAKE_VIDEO=/tmp/sharp.mjpeg CHROMIUM=/sökväg/till/chromium node test/e2e-contract.cjs
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const dist = path.join(__dirname, '..', 'dist'), manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data/manifest.json'), 'utf8'));
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FEL  ') + msg); if (!cond) fails++; };
(async () => {
  const srv = http.createServer((q, r) => { const f = path.join(dist, q.url === '/' ? 'index.html' : q.url); fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); } else { r.setHeader('Content-Type', 'text/html; charset=utf-8'); r.end(d); } }); }).listen(0);
  const url = 'http://localhost:' + srv.address().port + '/';
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${process.env.FAKE_VIDEO}`] });
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'] })).newPage();
  p.on('pageerror', e => { console.log('PAGEERR', e.message); fails++; });
  await p.goto(url);
  await p.evaluate(() => { window.__ev = []; for (const t of ['sd:candidates', 'sd:confirm', 'sd:cancel']) window.addEventListener(t, e => window.__ev.push([t, JSON.parse(JSON.stringify(e.detail))])); });
  const evs = (t) => p.evaluate(t => window.__ev.filter(e => e[0] === t).map(e => e[1]), t);
  const waitFor = (fn, arg, ms = 90000) => p.waitForFunction(fn, arg, { timeout: ms });
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  // 1. Live-fångst ger candidates med kontrakt 2
  await p.click('#livebtn'); await waitFor(() => window.__ev.some(e => e[0] === 'sd:candidates'));
  let c = (await evs('sd:candidates'))[0];
  ok(c.contract === 2 && UUID.test(c.scan_id) && c.revision === 1 && c.source === 'live', 'candidates: contract 2, scan_id (uuid), revision 1, source live');
  ok(c.db.version === manifest.version && c.db.count === manifest.count && c.db.hash_algorithm === 'sdh1' && c.db.format === 2, 'candidates: db-version matchar data/manifest.json (' + c.db.version + ')');
  ok(c.match.gap_basis === 'oracle_id' && typeof c.match.distance === 'number' && ['distinct', 'ambiguous'].includes(c.match.printing), 'candidates: match.gap_basis = oracle_id, printing = ' + c.match.printing);
  ok(c.candidates.length > 0 && UUID.test(c.candidates[0].oracle_id) && UUID.test(c.candidates[0].scryfall_id), 'candidates: scryfall_id och oracle_id finns');
  const scan1 = c.scan_id, conf1 = c.confidence;

  // 2. Ny revision av samma skanning (hörn justeras / identifiera igen)
  await p.click('#identify'); await waitFor(() => window.__ev.filter(e => e[0] === 'sd:candidates').length >= 2);
  c = (await evs('sd:candidates'))[1];
  ok(c.scan_id === scan1 && c.revision === 2, 'identifiera igen: samma scan_id, revision 2');

  // 3. Bekräfta ett alternativ: säkerhetsnivån ändras inte av användarens val
  await p.click('#alts li:nth-child(2) button'); await p.click('#add'); await p.waitForTimeout(300);
  let confirms = await evs('sd:confirm'), k = confirms[0];
  ok(confirms.length === 1 && k.scan_id === scan1 && k.revision === 2, 'confirm: ett event, samma scan_id och revision som senaste candidates');
  ok(k.selected_rank === 1 && k.changed_by_user === true && k.confidence === c.confidence && k.confidence === conf1, 'confirm: valt alternativ, confidence oförändrad (' + k.confidence + ')');
  ok(k.candidate.scryfall_id === c.candidates[1].scryfall_id, 'confirm: candidate = det valda alternativet');

  // 4. Ingen dubbel bekräftelse, inget nytt skanningsförsök av kvarhållet kort
  await p.evaluate(() => document.getElementById('add').click()); await p.waitForTimeout(6000);
  ok((await evs('sd:confirm')).length === 1, 'dubbelklick/extra Add ger ingen andra confirm');
  ok((await evs('sd:candidates')).length === 2, 'kvarhållet kort skannas inte om automatiskt');

  // 5. Avsiktlig ny skanning av samma kort ger nytt scan_id
  await p.click('#lvnow'); await waitFor(() => window.__ev.filter(e => e[0] === 'sd:candidates').length >= 3);
  c = (await evs('sd:candidates'))[2]; const scan2 = c.scan_id;
  ok(scan2 !== scan1 && c.revision === 1, 'ny skanning: nytt scan_id (' + (scan2 !== scan1) + '), revision 1');

  // 6. Återupptagning avbryter obekräftad skanning; ingen confirm kan ske
  await p.click('#backlive'); await p.waitForTimeout(200);
  let cancels = await evs('sd:cancel');
  ok(cancels.some(x => x.scan_id === scan2 && x.reason === 'resumed'), 'sd:cancel reason=resumed för obekräftad skanning');
  await p.evaluate(() => document.getElementById('add').click()); await p.waitForTimeout(200);
  ok((await evs('sd:confirm')).length === 1, 'Add efter cancel ger ingen confirm');

  // 7. Sent resultat: avbryt innan identifieringen hunnit klart -> inga candidates för den skanningen
  await p.evaluate(() => { document.getElementById('lvnow').click(); document.getElementById('backlive').click(); });
  await p.waitForTimeout(4000);
  cancels = await evs('sd:cancel'); const cs = (await evs('sd:candidates')).length;
  const late = cancels.filter(x => x.reason === 'resumed' && x.scan_id !== scan2);
  ok(late.length === 1 && cs === 3, 'avbruten under identifiering: sd:cancel och inga candidates för den skanningen (candidates totalt ' + cs + ')');

  // 8. Stopp avbryter pågående skanning
  await p.click('#lvnow'); await waitFor(() => window.__ev.filter(e => e[0] === 'sd:candidates').length >= 4);
  const scan4 = (await evs('sd:candidates'))[3].scan_id;
  await p.evaluate(() => document.getElementById('lvstop').click()); await p.waitForTimeout(200);
  ok((await evs('sd:cancel')).some(x => x.scan_id === scan4 && x.reason === 'stopped'), 'sd:cancel reason=stopped vid stopp');
  ok((await evs('sd:confirm')).length === 1, 'totalt exakt en confirm under hela testet');

  await b.close(); srv.close();
  console.log(fails ? `\n${fails} FEL` : '\nAlla kontroller OK'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
