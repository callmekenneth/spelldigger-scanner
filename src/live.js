// Live-scan gating: is a whole, card-shaped thing in frame, how sharp is it, and has it held still?
const SDLive = (() => {
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  // img: small ImageData (longest side ~360). Returns {quad, ok, why, sharp}
  function analyse(img, quad) {
    const W = img.width, H = img.height;
    if (!quad) return { quad: null, ok: false, why: 'no card', sharp: 0 };
    const [tl, tr, br, bl] = quad, a = dist(tl, tr), b = dist(tr, br), c = dist(br, bl), d = dist(bl, tl);
    const w = (a + c) / 2, h = (b + d) / 2, ratio = Math.min(w, h) / Math.max(w, h);
    const mx = W * 0.015, my = H * 0.015;
    const inside = quad.every(p => p[0] >= mx && p[0] <= W - mx && p[1] >= my && p[1] <= H - my);
    const sideOk = a / c > 0.78 && a / c < 1.28 && b / d > 0.78 && b / d < 1.28;
    const area = Math.abs((tl[0] * tr[1] - tr[0] * tl[1]) + (tr[0] * br[1] - br[0] * tr[1]) + (br[0] * bl[1] - bl[0] * br[1]) + (bl[0] * tl[1] - tl[0] * bl[1])) / 2 / (W * H);
    let why = '';
    if (!inside) why = 'Move so the whole card is in view';
    else if (area < 0.12) why = 'Move closer';
    else if (ratio < 0.62 || ratio > 0.83 || !sideOk) why = 'Looking for the card edges…';
    return { quad, ok: !why, why, sharp: why ? 0 : sharpness(img, quad), ratio, area };
  }
  // Variance of the Laplacian over the inner 80% of the card (point-in-quad test).
  function sharpness(img, q) {
    const W = img.width, H = img.height, d = img.data, g = new Float32Array(W * H);
    for (let i = 0, p = 0; p < g.length; p++, i += 4) g[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
    const s = q.map(p => [cx + (p[0] - cx) * 0.8, cy + (p[1] - cy) * 0.8]);
    const x0 = Math.max(1, Math.floor(Math.min(...s.map(p => p[0])))), x1 = Math.min(W - 2, Math.ceil(Math.max(...s.map(p => p[0]))));
    const y0 = Math.max(1, Math.floor(Math.min(...s.map(p => p[1])))), y1 = Math.min(H - 2, Math.ceil(Math.max(...s.map(p => p[1]))));
    let sum = 0, sum2 = 0, n = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      let inQ = true;
      for (let k = 0; k < 4; k++) { const A = s[k], B = s[(k + 1) % 4]; if ((B[0] - A[0]) * (y - A[1]) - (B[1] - A[1]) * (x - A[0]) < 0) { inQ = false; break; } }
      if (!inQ) continue;
      const p = y * W + x, l = 4 * g[p] - g[p - 1] - g[p + 1] - g[p - W] - g[p + W];
      sum += l; sum2 += l * l; n++;
    }
    if (n < 200) return 0;
    const m = sum / n; return sum2 / n - m * m;
  }
  // Tracks recent frames: capture when the card has held still and is at (near) its sharpest.
  function makeTracker(opts = {}) {
    const need = opts.frames || 4, moveTol = opts.moveTol || 0.012, floor = opts.sharpFloor || 40;
    let hist = [];
    return {
      reset() { hist = []; },
      push(res, W, H) {
        if (!res.ok) { hist = []; return { fire: false, progress: 0 }; }
        hist.push({ q: res.quad, s: res.sharp }); if (hist.length > 10) hist.shift();
        const diag = Math.hypot(W, H), recent = hist.slice(-need);
        if (recent.length < need) return { fire: false, progress: recent.length / need * 0.8 };
        let move = 0; for (let i = 1; i < recent.length; i++) for (let k = 0; k < 4; k++) move = Math.max(move, dist(recent[i].q[k], recent[i - 1].q[k]) / diag);
        const best = Math.max(...hist.map(h => h.s)), cur = recent[recent.length - 1].s;
        const still = move < moveTol, sharp = cur >= floor && cur >= 0.85 * best;
        return { fire: still && sharp, progress: still ? (sharp ? 1 : 0.9) : 0.5, move, cur, best };
      }
    };
  }
  return { analyse, sharpness, makeTracker };
})();
if (typeof module !== 'undefined') module.exports = SDLive;
