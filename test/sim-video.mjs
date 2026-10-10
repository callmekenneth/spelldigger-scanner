// Gör en simulerad "live"-film (MJPEG) av ett kortfoto för test av live-läget utan riktig kamera.
//   node test/sim-video.mjs bench/IMG_5786.jpg /tmp/hold.mjpeg [--defocus | --sway]
//   node test/sim-video.mjs a.jpg,b.jpg,a.jpg /tmp/batch.mjpeg     (flera kort efter varandra, som i en matarlåda)
// OBS: 4:2:0 (yuvj420p) krävs, annars avkodar Chromiums falska kamera ingenting (grön bild).
// Normal: tomt bord -> kortet glider in -> hålls stilla med handdarr -> glider ut -> tomt. --defocus: oskarp hållning.
// --sway: kortet svajar hela tiden och blir aldrig stilla. Kräver ffmpeg i PATH.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
let seed = 11; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296, gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) * 1.7;
const BG = [150, 105, 60];
export function render(card, W, H, o) {
  const out = new Uint8ClampedArray(W * H * 4), d = card.data, PW = card.width, PH = card.height, cx = W / 2 + o.dx * W, cy = H / 2 + o.dy * H, sc = o.s * W / PW, c = Math.cos(o.rot), sn = Math.sin(o.rot);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let R = 0, G = 0, B = 0;
    for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
      const X = x + ox, Y = y + oy, px = ((X - cx) * c + (Y - cy) * sn) / sc + PW / 2, py = (-(X - cx) * sn + (Y - cy) * c) / sc + PH / 2;
      if (o.show && px >= 1 && py >= 1 && px < PW - 2 && py < PH - 2) { const x0 = px | 0, y0 = py | 0, fx = px - x0, fy = py - y0, i = (y0 * PW + x0) * 4, j = i + PW * 4;
        const v = ch => (d[i + ch] * (1 - fx) + d[i + 4 + ch] * fx) * (1 - fy) + (d[j + ch] * (1 - fx) + d[j + 4 + ch] * fx) * fy; R += v(0); G += v(1); B += v(2); }
      else { const t = 1 + 0.12 * Math.sin(X * 0.7 + Math.sin(Y * 0.11) * 3) + 0.08 * Math.sin(Y * 0.35); R += BG[0] * t; G += BG[1] * t; B += BG[2] * t; } }
    const i = (y * W + x) * 4, n = gauss() * o.noise, br = o.bright; out[i] = R / 4 * br + n; out[i + 1] = G / 4 * br + n; out[i + 2] = B / 4 * br + n; out[i + 3] = 255; }
  return { width: W, height: H, data: out };
}
export function blur(img, r) {
  if (!r) return img; const { width: W, height: H, data: d } = img, o = new Uint8ClampedArray(d.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s0 = 0, s1 = 0, s2 = 0, n = 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const xx = Math.min(W - 1, Math.max(0, x + dx)), yy = Math.min(H - 1, Math.max(0, y + dy)), i = (yy * W + xx) * 4; s0 += d[i]; s1 += d[i + 1]; s2 += d[i + 2]; n++; } const j = (y * W + x) * 4; o[j] = s0 / n; o[j + 1] = s1 / n; o[j + 2] = s2 / n; o[j + 3] = 255; }
  return { width: W, height: H, data: o };
}
export function sequence(mode) {
  const f = [], S = 0.7, empty = { show: false, s: S, dx: 0, dy: 0, rot: 0, bright: 1 };
  for (let i = 0; i < 12; i++) f.push({ o: empty, blur: 0 });
  for (let i = 0; i < 24; i++) { const t = i / 23; f.push({ o: { show: true, s: 0.45 + 0.25 * t, dx: 0.5 * (1 - t), dy: -0.1 * (1 - t), rot: 0.12 * (1 - t), bright: 1 }, blur: i < 18 ? 2 : 1 }); }
  for (let i = 0; i < 45; i++) {
    if (mode === 'sway') f.push({ o: { show: true, s: S, dx: 0.09 * Math.sin(i * 0.6), dy: 0.05 * Math.cos(i * 0.45), rot: 0.05 * Math.sin(i * 0.5), bright: 1 }, blur: 1 });
    else f.push({ o: { show: true, s: S * (1 + 0.004 * gauss()), dx: 0.004 * gauss(), dy: 0.004 * gauss(), rot: 0.003 * gauss(), bright: 1 + 0.02 * gauss() }, blur: mode === 'defocus' ? 1 : 0 });
  }
  for (let i = 0; i < 16; i++) { const t = i / 15; f.push({ o: { show: true, s: S - 0.2 * t, dx: -0.6 * t, dy: 0.1 * t, rot: -0.1 * t, bright: 1 }, blur: 2 }); }
  for (let i = 0; i < 10; i++) f.push({ o: empty, blur: 0 });
  return f.map(x => ({ ...x, o: { noise: 4, ...x.o } }));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [src, dst] = process.argv.slice(2), mode = process.argv.includes('--defocus') ? 'defocus' : process.argv.includes('--sway') ? 'sway' : 'hold';
  const W = 360, H = 640, cards = [];
  for (const f of src.split(',')) { const { data, info } = await sharp(f).resize(Math.round(W * 0.7 * 2), null).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); cards.push({ width: info.width, height: info.height, data }); }
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '15', '-c:v', 'ppm', '-i', '-', '-c:v', 'mjpeg', '-pix_fmt', 'yuvj420p', '-q:v', '3', dst], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (const card of cards) for (const s of sequence(mode)) {
    const img = blur(render(card, W, H, s.o), s.blur), ppm = Buffer.alloc(W * H * 3);
    for (let p = 0; p < W * H; p++) { ppm[p * 3] = img.data[p * 4]; ppm[p * 3 + 1] = img.data[p * 4 + 1]; ppm[p * 3 + 2] = img.data[p * 4 + 2]; }
    ff.stdin.write(Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`), ppm]));
  }
  const tail = process.argv.find(a => a.startsWith('--tail=')); // tom bild sist så att filmen inte börjar om medan det sista kortet identifieras
  if (tail) { const img = render(cards[0], W, H, { show: false, s: 0.7, dx: 0, dy: 0, rot: 0, bright: 1, noise: 4 }), ppm = Buffer.alloc(W * H * 3);
    for (let p = 0; p < W * H; p++) { ppm[p * 3] = img.data[p * 4]; ppm[p * 3 + 1] = img.data[p * 4 + 1]; ppm[p * 3 + 2] = img.data[p * 4 + 2]; }
    const fr = Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`), ppm]); for (let i = 0; i < +tail.slice(7); i++) ff.stdin.write(fr); }
  ff.stdin.end(); await new Promise(r => ff.on('close', r)); console.log('Skrev', dst, '(' + mode + ')');
}
