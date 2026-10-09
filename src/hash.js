// Shared hashing for Spelldigger scanner PoC. Identical in builder and in the phone page.
// Input: ImageData of an upright, perspective-corrected card (any size, card fills the image).
// Output: hex string of 4 x 64-bit hashes (pHash+dHash of the inner card, pHash+dHash of the art box).
const SDH = (() => {
  const REGIONS = { card: [0.04, 0.03, 0.96, 0.97], art: [0.08, 0.11, 0.92, 0.55] };
  function grayArea(img, region, w, h) {
    const [x0r, y0r, x1r, y1r] = region, W = img.width, H = img.height, d = img.data;
    const x0 = x0r * W, y0 = y0r * H, cw = (x1r - x0r) * W / w, ch = (y1r - y0r) * H / h;
    const out = new Float64Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const sx0 = Math.floor(x0 + i * cw), sx1 = Math.max(sx0 + 1, Math.floor(x0 + (i + 1) * cw));
      const sy0 = Math.floor(y0 + j * ch), sy1 = Math.max(sy0 + 1, Math.floor(y0 + (j + 1) * ch));
      let s = 0, n = 0;
      for (let y = sy0; y < sy1 && y < H; y++) for (let x = sx0; x < sx1 && x < W; x++) {
        const k = (y * W + x) * 4; s += 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2]; n++;
      }
      out[j * w + i] = n ? s / n : 0;
    }
    return out;
  }
  const N = 32, COS = [];
  for (let u = 0; u < 8; u++) { COS[u] = new Float64Array(N); for (let x = 0; x < N; x++) COS[u][x] = Math.cos((2 * x + 1) * u * Math.PI / (2 * N)); }
  function bitsToHex(bits) { let s = ''; for (let i = 0; i < bits.length; i += 4) s += ((bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3]).toString(16); return s; }
  function phash(img, region) {
    const g = grayArea(img, region, N, N), c = [];
    for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) {
      let s = 0; for (let y = 0; y < N; y++) { const cy = COS[v][y]; for (let x = 0; x < N; x++) s += g[y * N + x] * COS[u][x] * cy; }
      c.push(s);
    }
    const rest = c.slice(1).sort((a, b) => a - b), med = (rest[31] + rest[32]) / 2;
    return bitsToHex(c.map(v => v > med ? 1 : 0));
  }
  function dhash(img, region) {
    const g = grayArea(img, region, 9, 8), b = [];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) b.push(g[y * 9 + x] < g[y * 9 + x + 1] ? 1 : 0);
    return bitsToHex(b);
  }
  function hash(img) { return phash(img, REGIONS.card) + dhash(img, REGIONS.card) + phash(img, REGIONS.art) + dhash(img, REGIONS.art); }
  const POP = new Uint8Array(16).map((_, i) => (i & 1) + ((i >> 1) & 1) + ((i >> 2) & 1) + ((i >> 3) & 1));
  function dist(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += POP[parseInt(a[i], 16) ^ parseInt(b[i], 16)]; return s; }
  return { hash, dist };
})();
