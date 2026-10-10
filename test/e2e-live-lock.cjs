// Låser live-läget på ett stilla, skarpt kort men inte på oskarpa eller rörliga kort? Simulerade filmer, falsk kamera.
//   for m in "" --defocus --sway; do node test/sim-video.mjs bench/IMG_5786.jpg /tmp/clip$m.mjpeg $m; done
//   CLIPS=/tmp NODE_PATH=... node test/e2e-live-lock.cjs
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const dist = path.join(__dirname, '..', 'dist'); let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FEL  ') + m); if (!c) fails++; };
async function run(clip, waitMs) {
  const srv = http.createServer((q, r) => fs.readFile(path.join(dist, 'index.html'), (e, d) => { r.setHeader('Content-Type', 'text/html; charset=utf-8'); r.end(d); })).listen(0);
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${clip}`] });
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'] })).newPage();
  p.on('pageerror', e => { console.log('PAGEERR', e.message); fails++; });
  await p.goto('http://localhost:' + srv.address().port + '/');
  await p.evaluate(() => { window.__ev = []; window.addEventListener('sd:candidates', e => window.__ev.push(performance.now())); });
  const t0 = Date.now(); await p.click('#livebtn'); const msgs = new Set(); let fired = null;
  while (Date.now() - t0 < waitMs) { msgs.add(await p.textContent('#lvmsg')); if (await p.evaluate(() => window.__ev.length)) { fired = Date.now() - t0; break; } await p.waitForTimeout(200); }
  await b.close(); srv.close(); return { fired, msgs: [...msgs] };
}
(async () => {
  const dir = process.env.CLIPS || '/tmp';
  let r = await run(path.join(dir, 'clip.mjpeg'), 60000);
  ok(r.fired !== null, 'stilla, skarpt kort: låser och fångar automatiskt (' + (r.fired !== null ? (r.fired / 1000).toFixed(1) + ' s' : 'aldrig') + ')');
  r = await run(path.join(dir, 'clip--defocus.mjpeg'), 30000);
  ok(r.fired === null, 'oskarpt kort: fångas inte (meddelanden: ' + r.msgs.join(' / ') + ')');
  r = await run(path.join(dir, 'clip--sway.mjpeg'), 30000);
  ok(r.fired === null, 'kort som hela tiden rör sig: fångas inte');
  console.log(fails ? `\n${fails} FEL` : '\nAlla kontroller OK'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
