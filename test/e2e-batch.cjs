// Batch scan: fem kort efter varandra (A, B, A igen, ett som inte finns i databasen, C) utan att användaren rör något.
//   node test/sim-video.mjs bench/IMG_5772.jpg,bench/IMG_5786.jpg,bench/IMG_5772.jpg,bench/IMG_5776.jpg,bench/IMG_5797.jpg /tmp/batch.mjpeg --tail=900
//   CLIP=/tmp/batch.mjpeg NODE_PATH=... node test/e2e-batch.cjs
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FEL  ') + m); if (!c) fails++; };
(async () => {
  const srv = http.createServer((q, r) => fs.readFile(path.join(__dirname, '..', 'dist', 'index.html'), (e, d) => { r.setHeader('Content-Type', 'text/html; charset=utf-8'); r.end(d); })).listen(0);
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${process.env.CLIP || '/tmp/batch.mjpeg'}`] });
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'] })).newPage();
  p.on('pageerror', e => { console.log('PAGEERR', e.message); fails++; });
  if (process.env.NOWORKER) await p.addInitScript(() => { delete window.Worker; }); // provar reservvägen utan bakgrundstråd
  await p.goto('http://localhost:' + srv.address().port + '/');
  await p.evaluate(() => { window.__ev = []; for (const t of ['sd:candidates', 'sd:confirm', 'sd:cancel', 'sd:retract']) window.addEventListener(t, e => window.__ev.push([t, JSON.parse(JSON.stringify(e.detail))])); });
  const evs = t => p.evaluate(t => window.__ev.filter(e => e[0] === t).map(e => e[1]), t);
  await p.click('#batchbtn');
  if (process.env.NOWORKER) { // reservväg: identifiering i sidans tråd blockerar och missar snabbt matade kort, så bara grundfunktionen kontrolleras
    await p.waitForFunction(() => /^[1-9]/.test(document.getElementById('bcount').textContent), null, { timeout: 60000 });
    ok(true, 'reservväg utan Worker: ett kort identifieras och läggs till (' + (await p.textContent('#bcount')) + ')'); await b.close(); srv.close(); process.exit(fails ? 1 : 0);
  }
  const t0 = Date.now(); let txt = '', n = 0;
  while (Date.now() - t0 < 100000) { txt = await p.textContent('#bcount'); const m = txt.match(/^(\d+) added · (\d+) to check/); n = m ? +m[1] + +m[2] : 0; if (n >= 5 && !/identifying/.test(txt)) break; await p.waitForTimeout(100); }
  const m5 = txt.match(/^(\d+) added · (\d+) to check/), added = +m5[1], queued = +m5[2];
  ok(added + queued === 5, 'fem kort matas in utan handpåläggning och varje kort skannas exakt en gång (' + txt + ', ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
  const cand = await evs('sd:candidates'), conf = await evs('sd:confirm');
  ok(cand.length === 5 && new Set(cand.map(c => c.scan_id)).size === 5 && cand.every(c => c.source === 'batch'), '5 candidates med unika scan_id, source batch');
  ok(conf.length === added && conf.every(c => c.auto_confirmed === true && c.changed_by_user === false && c.confidence === 'confident'), 'bara säkra kort bekräftas automatiskt (auto_confirmed, confidence confident)');
  ok(!conf.some(c => /Turtles/.test(c.candidate.name)) && queued >= 1, 'kortet som inte finns i databasen (matchar "Turtles in Time") läggs aldrig till automatiskt, utan under "To check"');
  const sess = await p.evaluate(() => JSON.parse(localStorage.getItem('sd-session')));
  ok(sess.reduce((a, s) => a + s.qty, 0) === added && new Set(sess.map(s => s.id + s.finish)).size === sess.length, 'sessionen har rätt antal kort och inga dubbla rader: ' + sess.map(s => s.name + ' ×' + s.qty).join(', '));
  ok(!(await p.isVisible('#adjust')) && !(await p.isVisible('#result')) && (await p.isVisible('#live')), 'hörn- och resultatvyn öppnas aldrig i batch-läget');
  ok(await p.isVisible('#review') && (await p.$$('#rvlist li')).length === queued, 'osäkra kort ligger under "To check" (' + queued + ')');
  // Ångra senaste
  if (added) { await p.click('#bundo'); await p.waitForTimeout(200);
    const sess2 = await p.evaluate(() => JSON.parse(localStorage.getItem('sd-session'))), ret = await evs('sd:retract');
    ok(sess2.reduce((a, s) => a + s.qty, 0) === added - 1 && ret.length === 1 && ret[0].scan_id === conf[conf.length - 1].scan_id, 'Undo last tar bort senaste kortet och skickar sd:retract'); }
  await p.click('#lvstop');
  // Granska: välj första alternativet för första kortet i listan
  const confIds = new Set(conf.map(c => c.scan_id)), waiting = cand.filter(c => !confIds.has(c.scan_id));
  await p.click('#rvlist li:first-child .opts button >> nth=0'); await p.waitForTimeout(200);
  const conf2 = await evs('sd:confirm'), last = conf2[conf2.length - 1];
  ok(conf2.length === added + 1 && last.auto_confirmed === false && last.selected_rank === 0 && waiting.some(c => c.scan_id === last.scan_id), 'val i "To check" ger confirm (auto_confirmed false) på ett scan_id som väntade');
  ok((await p.$$('#rvlist li')).length === queued - 1, 'kortet försvinner ur granskningslistan');
  console.log(fails ? `\n${fails} FEL` : '\nAlla kontroller OK'); await b.close(); srv.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
