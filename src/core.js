// Spelldigger scanner core: detection, warp, match-driven corner refinement. No DOM needed.
const SDCore = (() => {
  const MW = 146, MH = 204; // matching resolution = Scryfall "small" image size used for the database
  const mkImage = (w, h) => (typeof ImageData !== 'undefined' ? new ImageData(w, h) : { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });

  // ---- initial guess: colour distance to background + edge strength, holes filled, extreme corners ----
  function detect(img, robust) {
    const k = Math.min(1, 360 / Math.max(img.width, img.height)), w = Math.max(3, Math.round(img.width * k)), h = Math.max(3, Math.round(img.height * k)), n = w * h;
    const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n), Y = new Float32Array(n), d = img.data, W = img.width;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, Math.floor((x + 0.5) / k)), sy = Math.min(img.height - 1, Math.floor((y + 0.5) / k)), i = (sy * W + sx) * 4, p = y * w + x;
      R[p] = d[i]; G[p] = d[i + 1]; B[p] = d[i + 2]; Y[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    }
    const border = []; for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x); for (let y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1);
    const med = A => { const v = border.map(p => A[p]).sort((a, b) => a - b); return v[v.length >> 1]; };
    const br = med(R), bg = med(G), bb = med(B);
    const dist = new Float32Array(n), grad = new Float32Array(n);
    for (let p = 0; p < n; p++) dist[p] = Math.hypot(R[p] - br, G[p] - bg, B[p] - bb);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      const gx = Y[p - w + 1] + 2 * Y[p + 1] + Y[p + w + 1] - Y[p - w - 1] - 2 * Y[p - 1] - Y[p + w - 1];
      const gy = Y[p + w - 1] + 2 * Y[p + w] + Y[p + w + 1] - Y[p - w - 1] - 2 * Y[p - w] - Y[p - w + 1];
      grad[p] = Math.hypot(gx, gy) / 4;
    }
    const pct = (A, idx, q) => { const v = idx.map(p => A[p]).sort((a, b) => a - b); return v[Math.min(v.length - 1, Math.floor(q * v.length))]; };
    const inner = border.map(p => { const x = p % w, y = (p - x) / w; return Math.min(h - 2, Math.max(1, y)) * w + Math.min(w - 2, Math.max(1, x)); });
    const tDist = Math.max(28, pct(dist, border, 0.9) * 1.6), tGrad = Math.max(24, pct(grad, inner, 0.9) * 1.8);
    let m = new Uint8Array(n); for (let p = 0; p < n; p++) m[p] = dist[p] > tDist || grad[p] > tGrad ? 1 : 0;
    const pass = (src, r, dil, horiz) => { const out = new Uint8Array(n); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = dil ? 0 : 1; for (let t = -r; t <= r; t++) { const xx = horiz ? x + t : x, yy = horiz ? y : y + t; const s = (xx < 0 || yy < 0 || xx >= w || yy >= h) ? (dil ? 0 : 1) : src[yy * w + xx]; if (dil ? s : !s) { v = dil ? 1 : 0; break; } } out[y * w + x] = v; } return out; };
    const r = Math.max(2, Math.round(Math.max(w, h) / 90));
    m = pass(pass(m, r, true, true), r, true, false); m = pass(pass(m, r, false, true), r, false, false);
    const outside = new Uint8Array(n), stack = [];
    for (const p of border) if (!m[p] && !outside[p]) { outside[p] = 1; stack.push(p); }
    while (stack.length) { const p = stack.pop(), x = p % w, y = (p - x) / w; for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) if (q >= 0 && !m[q] && !outside[q]) { outside[q] = 1; stack.push(q); } }
    const lab = new Int32Array(n); let bestLab = 0, bestSize = 0, cur = 0;
    for (let i = 0; i < n; i++) { if (outside[i] || lab[i]) continue; cur++; let size = 0; stack.push(i); lab[i] = cur; while (stack.length) { const p = stack.pop(); size++; const x = p % w, y = (p - x) / w; for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) if (q >= 0 && !outside[q] && !lab[q]) { lab[q] = cur; stack.push(q); } } if (size > bestSize) { bestSize = size; bestLab = cur; } }
    const frac = bestSize / n;
    if (frac < 0.06 || frac > 0.97) return null;
    if (robust) {
      // Rotated rectangle around the blob; 0.7% of pixels at each extreme are ignored so small spurs do not move the sides.
      const xs = [], ys = []; let c = 0;
      for (let i = 0; i < n; i++) { if (lab[i] !== bestLab) continue; if (c++ % 3) continue; xs.push(i % w); ys.push((i / w) | 0); }
      const m = xs.length, lo = Math.floor(m * 0.007), hi = m - 1 - lo; let bestA = Infinity, bestR = null;
      const U = new Float32Array(m), V = new Float32Array(m);
      for (let deg = -45; deg <= 45; deg += 2) {
        const t = deg * Math.PI / 180, co = Math.cos(t), si = Math.sin(t);
        for (let j = 0; j < m; j++) { U[j] = xs[j] * co + ys[j] * si; V[j] = -xs[j] * si + ys[j] * co; }
        const su = Float32Array.from(U).sort(), sv = Float32Array.from(V).sort(), u0 = su[lo], u1 = su[hi], v0 = sv[lo], v1 = sv[hi], A = (u1 - u0) * (v1 - v0);
        if (A < bestA) { bestA = A; bestR = { co, si, u0, u1, v0, v1 }; }
      }
      const { co, si, u0, u1, v0, v1 } = bestR;
      return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => [(u * co - v * si + 0.5) / k, (u * si + v * co + 0.5) / k]);
    }
    let tl = [0, 0, Infinity], tr = [0, 0, -Infinity], brc = [0, 0, -Infinity], bl = [0, 0, Infinity];
    for (let i = 0; i < n; i++) { if (lab[i] !== bestLab) continue; const x = i % w, y = (i - x) / w, s = x + y, dd = x - y;
      if (s < tl[2]) tl = [x, y, s]; if (s > brc[2]) brc = [x, y, s]; if (dd > tr[2]) tr = [x, y, dd]; if (dd < bl[2]) bl = [x, y, dd]; }
    return [tl, tr, brc, bl].map(p => [(p[0] + 0.5) / k, (p[1] + 0.5) / k]);
  }
  // Card-shaped rectangle centred in the frame, as large as `f` of what fits.
  function framePrior(img, f) {
    const ar = 63 / 88, W = img.width, H = img.height;
    if (H >= W) { const ch = Math.min(H, W / ar) * f, cw = ch * ar; return rect((W - cw) / 2, (H - ch) / 2, cw, ch); }
    const cw = Math.min(W, H / ar) * f, ch = cw * ar; return rect((W - cw) / 2, (H - ch) / 2, cw, ch);
  }
  const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

  // ---- perspective warp ----
  function homography(dst, src) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) { const [u, v] = dst[i], [x, y] = src[i];
      A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x); A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y); }
    for (let c = 0; c < 8; c++) { let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
      for (let r = 0; r < 8; r++) { if (r === c) continue; const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; } }
    return b.map((v, i) => v / A[i][i]);
  }
  // Warp with area-ish sampling: average of 2x2 bilinear taps per output pixel, so a big photo shrinks cleanly.
  function warp(img, q, OW, OH) {
    const H = homography([[0, 0], [OW, 0], [OW, OH], [0, OH]], q), out = mkImage(OW, OH), o = out.data, d = img.data, W = img.width, Hh = img.height;
    const h0 = H[0], h1 = H[1], h2 = H[2], h3 = H[3], h4 = H[4], h5 = H[5], h6 = H[6], h7 = H[7], mx = W - 2, my = Hh - 2;
    let j = 0;
    for (let v = 0; v < OH; v++) for (let u = 0; u < OW; u++, j += 4) {
      let r = 0, g = 0, b = 0;
      for (let t = 0; t < 4; t++) {
        const uu = u + ((t & 1) ? 0.75 : 0.25), vv = v + ((t & 2) ? 0.75 : 0.25), z = h6 * uu + h7 * vv + 1;
        let x = (h0 * uu + h1 * vv + h2) / z - 0.5, y = (h3 * uu + h4 * vv + h5) / z - 0.5;
        if (x < 0) x = 0; else if (x > mx) x = mx; if (y < 0) y = 0; else if (y > my) y = my;
        const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i00 = (y0 * W + x0) * 4, i01 = i00 + W * 4;
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        r += d[i00] * w00 + d[i00 + 4] * w10 + d[i01] * w01 + d[i01 + 4] * w11;
        g += d[i00 + 1] * w00 + d[i00 + 5] * w10 + d[i01 + 1] * w01 + d[i01 + 5] * w11;
        b += d[i00 + 2] * w00 + d[i00 + 6] * w10 + d[i01 + 2] * w01 + d[i01 + 6] * w11;
      }
      o[j] = r / 4; o[j + 1] = g / 4; o[j + 2] = b / 4; o[j + 3] = 255;
    }
    return out;
  }
  // Box-downscale an image so its longest side is `maxSide` (keeps scoring fast on big photos).
  function shrink(img, maxSide) {
    const k = Math.min(1, maxSide / Math.max(img.width, img.height));
    if (k >= 1) return { img, k: 1 };
    const w = Math.round(img.width * k), h = Math.round(img.height * k), out = mkImage(w, h), o = out.data, d = img.data, W = img.width;
    for (let y = 0; y < h; y++) { const y0 = Math.floor(y / k), y1 = Math.max(y0 + 1, Math.min(img.height, Math.floor((y + 1) / k)));
      for (let x = 0; x < w; x++) { const x0 = Math.floor(x / k), x1 = Math.max(x0 + 1, Math.min(W, Math.floor((x + 1) / k))); let r = 0, g = 0, b = 0, n = 0;
        for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * W + xx) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
        const j = (y * w + x) * 4; o[j] = r / n; o[j + 1] = g / n; o[j + 2] = b / n; o[j + 3] = 255; } }
    return { img: out, k: w / img.width };
  }
  const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  // Both readings of the quad as an upright portrait card (and its 180 degree turn).
  function orientations(q) {
    const portrait = len(q[0], q[3]) + len(q[1], q[2]) >= len(q[0], q[1]) + len(q[3], q[2]);
    const base = portrait ? q : [q[1], q[2], q[3], q[0]];
    return [base, [base[2], base[3], base[0], base[1]]];
  }

  // ---- matching ----
  const pop = x => { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; };
  const toBits = h => { const a = new Uint32Array(8); for (let i = 0; i < 8; i++) a[i] = parseInt(h.slice(i * 8, i * 8 + 8), 16) >>> 0; return a; };
  function makeIndex(db) { const flat = new Uint32Array(db.length * 8); db.forEach((r, i) => flat.set(toBits(r[5]), i * 8)); return flat; }
  function nearest(flat, bits) {
    let best = 1e9, bi = -1; const n = flat.length / 8;
    for (let i = 0; i < n; i++) { const o = i * 8; let s = 0;
      for (let k = 0; k < 8 && s < best; k++) s += pop((flat[o + k] ^ bits[k]) >>> 0);
      if (s < best) { best = s; bi = i; } }
    return [best, bi];
  }
  function allDistances(flat, bits) { const n = flat.length / 8, out = new Uint16Array(n); for (let i = 0; i < n; i++) { const o = i * 8; let s = 0; for (let k = 0; k < 8; k++) s += pop((flat[o + k] ^ bits[k]) >>> 0); out[i] = s; } return out; }
  const scoreQ = (img, flat, q) => { const bits = toBits(SDH.hash(warp(img, q, MW, MH))); return nearest(flat, bits)[0]; };

  // ---- identify: score start quads, then move corners while the best database match improves ----
  function identify(photo, flat, starts0) {
    const sh = shrink(photo, 640), img = sh.img, k = sh.k, starts = starts0.map(q => q.map(p => [p[0] * k, p[1] * k]));
    let cands = [];
    for (const s of starts) for (const q of orientations(s)) cands.push({ q, d: scoreQ(img, flat, q) });
    cands.sort((a, b) => a.d - b.d);
    let best = null, evals = cands.length;
    for (const c of cands.slice(0, 2)) {
      let q = c.q.map(p => p.slice()), cur = c.d;
      const cw = len(q[0], q[1]);
      for (const step of [0.05, 0.025, 0.012]) {
        const s = step * cw;
        for (let round = 0, improved = true; improved && round < 4; round++) {
          improved = false;
          const moves = [];
          for (let k = 0; k < 4; k++) for (const [dx, dy] of [[s, 0], [-s, 0], [0, s], [0, -s]]) { const m = q.map(p => p.slice()); m[k][0] += dx; m[k][1] += dy; moves.push(m); }
          const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
          for (const f of [1 + step, 1 - step]) moves.push(q.map(p => [cx + (p[0] - cx) * f, cy + (p[1] - cy) * f]));
          for (const [dx, dy] of [[s, 0], [-s, 0], [0, s], [0, -s]]) moves.push(q.map(p => [p[0] + dx, p[1] + dy]));
          for (const m of moves) { const d = scoreQ(img, flat, m); evals++; if (d < cur) { cur = d; q = m; improved = true; } }
        }
      }
      if (!best || cur < best.d) best = { q, d: cur };
    }
    const bits = toBits(SDH.hash(warp(img, best.q, MW, MH)));
    return { quad: best.q.map(p => [p[0] / k, p[1] / k]), dists: allDistances(flat, bits), evals };
  }
  return { detect, framePrior, shrink, warp, orientations, makeIndex, identify, MW, MH };
})();
if (typeof module !== 'undefined') module.exports = SDCore;
