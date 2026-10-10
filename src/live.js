// Live-scan gating: ligger ett helt kort i bild, är det skarpt och har det legat stilla?
// Allt här är oberoende av databasen och använder bara bilden. Dokumenterat i docs/live-scan.md.
const SDLive = (() => {
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const median = a => { const s = Array.from(a).sort((x, y) => x - y), n = s.length; return n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2; };

  // Geometri: ligger ett kortformat, helt synligt fyrhörn i bilden? img: ImageData, quad: [tl,tr,br,bl] eller null.
  function geometry(img, quad) {
    const W = img.width, H = img.height;
    if (!quad) return { ok: false, why: 'Show a card to the camera…' };
    const [tl, tr, br, bl] = quad, a = dist(tl, tr), b = dist(tr, br), c = dist(br, bl), d = dist(bl, tl);
    const w = (a + c) / 2, h = (b + d) / 2, ratio = Math.min(w, h) / Math.max(w, h), mx = W * 0.015, my = H * 0.015;
    const inside = quad.every(p => p[0] >= mx && p[0] <= W - mx && p[1] >= my && p[1] <= H - my);
    const sideOk = a / c > 0.78 && a / c < 1.28 && b / d > 0.78 && b / d < 1.28;
    const area = Math.abs((tl[0] * tr[1] - tr[0] * tl[1]) + (tr[0] * br[1] - br[0] * tr[1]) + (br[0] * bl[1] - bl[0] * br[1]) + (bl[0] * tl[1] - tl[0] * bl[1])) / 2 / (W * H);
    let why = '';
    if (!inside) why = 'Move so the whole card is in view';
    else if (area < 0.12) why = 'Move closer';
    else if (ratio < 0.62 || ratio > 0.83 || !sideOk) why = 'Looking for the card edges…';
    return { ok: !why, why, ratio, area };
  }

  // Skärpa på det rätade kortet (warp(img, quad, w, h) skickas in): kvot mellan Laplace-varians i full och halv upplösning.
  // Oskarp bild saknar fin detalj, så kvoten faller; den beror knappt på kortets motiv eller avstånd.
  function lapvar(w, h, g) {
    let s = 0, s2 = 0, n = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const p = y * w + x, l = 4 * g[p] - g[p - 1] - g[p + 1] - g[p - w] - g[p + w]; s += l; s2 += l * l; n++; }
    const m = s / n; return s2 / n - m * m;
  }
  function gray(img) { const d = img.data, g = new Float32Array(img.width * img.height); for (let i = 0, p = 0; p < g.length; p++, i += 4) g[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; return g; }
  function sharpness(img, quad, warp) {
    const w = warp(img, quad, 146, 204), W = w.width, H = w.height, g = gray(w), W2 = W >> 1, H2 = H >> 1, g2 = new Float32Array(W2 * H2);
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) { const i = 2 * y * W + 2 * x; g2[y * W2 + x] = (g[i] + g[i + 1] + g[i + W] + g[i + W + 1]) / 4; }
    const full = lapvar(W, H, g), half = lapvar(W2, H2, g2);
    return { ratio: half > 1e-6 ? full / half : 0, energy: full };
  }

  // Grov gråtumnagel (hela bilden) för stillhetsmätning. Brusar mycket mindre än detektorns hörn.
  const TW = 36, TH = 64;
  function thumb(img) {
    const W = img.width, H = img.height, d = img.data, t = new Float32Array(TW * TH);
    for (let y = 0; y < TH; y++) { const y0 = Math.floor(y * H / TH), y1 = Math.max(y0 + 1, Math.floor((y + 1) * H / TH));
      for (let x = 0; x < TW; x++) { const x0 = Math.floor(x * W / TW), x1 = Math.max(x0 + 1, Math.floor((x + 1) * W / TW)); let s = 0, n = 0;
        for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * W + xx) * 4; s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; n++; }
        t[y * TW + x] = s / n; } }
    return t;
  }
  // Rörelse mellan två tumnaglar som skattad förskjutning i tumnagelpixlar: medelskillnad (efter att ljusstyrkeskillnad tagits bort)
  // delat med bildens egen gradient. Då spelar kortets kontrast ingen roll. ~0.1 = handskakning, >0.5 = verklig rörelse.
  function motion(a, b) {
    if (!a || !b) return Infinity;
    let ma = 0, mb = 0; for (let i = 0; i < a.length; i++) { ma += a[i]; mb += b[i]; } ma /= a.length; mb /= b.length;
    let num = 0, den = 0, n = 0;
    for (let y = 1; y < TH - 1; y++) for (let x = 1; x < TW - 1; x++) { const p = y * TW + x;
      num += Math.abs((a[p] - ma) - (b[p] - mb)); den += (Math.abs(b[p + 1] - b[p - 1]) + Math.abs(b[p + TW] - b[p - TW])) / 4; n++; }
    return den / n > 0.5 ? num / den : Infinity;
  }

  // Samlar ihop bild för bild. push() får {geo, quad, sharp:{ratio,energy}, motion} och svarar {fire, quad (utjämnad), progress, stage, ...}.
  function makeTracker(o = {}) {
    const frames = o.frames || 5, spreadTol = o.spreadTol || 0.03, stillTol = o.stillTol || 0.8, stillFrames = o.stillFrames || 3,
      ratioMin = o.ratioMin || 0.3, energyMin = o.energyMin || 80, relBest = o.relBest || 0.85;
    let hist = [];
    return {
      reset() { hist = []; },
      push(f, W, H) {
        if (!f.geo.ok) { hist = []; return { fire: false, quad: null, stage: 'search', progress: 0, why: f.geo.why }; }
        hist.push(f); if (hist.length > 12) hist.shift();
        const recent = hist.slice(-frames), diag = Math.hypot(W, H);
        const quad = [0, 1, 2, 3].map(k => [median(recent.map(r => r.quad[k][0])), median(recent.map(r => r.quad[k][1]))]);
        if (recent.length < frames) return { fire: false, quad, stage: 'track', progress: 0.2 * recent.length / frames, why: 'Hold still…' };
        const spread = Math.max(...recent.map(r => Math.max(...r.quad.map((p, k) => dist(p, quad[k])))) ) / diag;
        const still = hist.slice(-stillFrames).every(r => r.motion < stillTol), steady = spread < spreadTol;
        const ratios = hist.map(r => r.sharp.ratio), cur = Math.min(...hist.slice(-2).map(r => r.sharp.ratio)), best = Math.max(...ratios);
        const sharp = cur >= ratioMin && cur >= relBest * best && hist[hist.length - 1].sharp.energy >= energyMin;
        const stats = { spread, motion: hist[hist.length - 1].motion, ratio: hist[hist.length - 1].sharp.ratio, energy: hist[hist.length - 1].sharp.energy };
        if (!steady || !still) return { fire: false, quad, stage: 'track', progress: 0.4, why: 'Hold still…', stats };
        if (!sharp) return { fire: false, quad, stage: 'focus', progress: 0.8, why: 'Focusing…', stats };
        return { fire: true, quad, stage: 'fire', progress: 1, why: 'Got it!', stats };
      }
    };
  }
  return { geometry, sharpness, thumb, motion, makeTracker, median };
})();
if (typeof module !== 'undefined') module.exports = SDLive;
