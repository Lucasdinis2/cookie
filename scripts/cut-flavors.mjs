/**
 * Recorta os 4 cookies da arte da MOKKI (fundo claro) e gera PNGs com
 * transparência para os cards de sabores.
 *
 * Uso: node scripts/cut-flavors.mjs referencias/cookies-mokki.png
 *
 * Ordem na arte (2×2): sup. esq. → Brigadeiro, sup. dir. → Nutella,
 *                      inf. esq. → Cookies & Cream, inf. dir. → Triple Chocolate
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const SRC = process.argv[2];
if (!SRC) {
  console.error('Informe o arquivo: node scripts/cut-flavors.mjs referencias/cookies-mokki.png');
  process.exit(1);
}
const ORDER = ['brigadeiro', 'nutella', 'cookies-cream', 'triple-chocolate'];
const OUT = 'src/assets/photos';
await mkdir(OUT, { recursive: true });

const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;
const at = (x, y) => {
  const i = (y * W + x) * 3;
  return [data[i], data[i + 1], data[i + 2]];
};

// Fundo = claro (branco, creme, azul-claro). Cookie = mais escuro/saturado.
function isCookie(x, y) {
  const [r, g, b] = at(x, y);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const v = max / 255, s = max ? (max - min) / max : 0;
  if (v > 0.9 && s < 0.32) return false; // branco/creme claro
  if (b > r && v > 0.7) return false; // azul-claro
  return v < 0.86 || s > 0.42;
}

// Máscara em 1/2 resolução → componentes conexos → 4 maiores.
const S = 2, MW = Math.floor(W / S), MH = Math.floor(H / S);
const mask = new Uint8Array(MW * MH);
for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) mask[y * MW + x] = isCookie(x * S, y * S) ? 1 : 0;
const label = new Int32Array(MW * MH).fill(-1);
const comps = [];
for (let p = 0; p < MW * MH; p++) {
  if (!mask[p] || label[p] >= 0) continue;
  const id = comps.length;
  let n = 0, sx = 0, sy = 0;
  const stack = [p];
  label[p] = id;
  while (stack.length) {
    const c = stack.pop();
    const x = c % MW, y = (c / MW) | 0;
    n++; sx += x; sy += y;
    for (const q of [c - 1, c + 1, c - MW, c + MW]) {
      if (q < 0 || q >= MW * MH || label[q] >= 0 || !mask[q]) continue;
      if (Math.abs((q % MW) - x) > 1) continue;
      label[q] = id;
      stack.push(q);
    }
  }
  comps.push({ id, n, cx: (sx / n) * S, cy: (sy / n) * S });
}
const cookies = comps.sort((a, b) => b.n - a.n).slice(0, 4);
if (cookies.length < 4) throw new Error('Não encontrei 4 cookies na imagem.');
cookies.sort((a, b) => a.cy - b.cy);
const rows = [cookies.slice(0, 2).sort((a, b) => a.cx - b.cx), cookies.slice(2).sort((a, b) => a.cx - b.cx)].flat();

for (let k = 0; k < 4; k++) {
  const c = rows[k];
  // contorno radial a partir do centro (preenche buracos como o creme do Oreo)
  const N = 360, radii = new Float64Array(N);
  for (let a = 0; a < N; a++) {
    const th = (a / N) * Math.PI * 2;
    let last = 0, miss = 0;
    for (let r = 0; r < Math.min(W, H) / 3; r++) {
      const x = Math.round(c.cx + Math.cos(th) * r), y = Math.round(c.cy + Math.sin(th) * r);
      if (x < 0 || y < 0 || x >= W || y >= H) break;
      if (isCookie(x, y)) { last = r; miss = 0; } else if (++miss > 10) break;
    }
    radii[a] = last;
  }
  const med = Array.from(radii, (_, a) => {
    const w = [];
    for (let j = -6; j <= 6; j++) w.push(radii[(a + j + N) % N]);
    return w.sort((p, q) => p - q)[6];
  });
  const R = Math.max(...med) + 6;
  const size = Math.ceil(R * 2);
  const left = Math.round(c.cx - size / 2), top = Math.round(c.cy - size / 2);
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = left + x, gy = top + y;
      const i = (y * size + x) * 4;
      if (gx < 0 || gy < 0 || gx >= W || gy >= H) continue;
      const dx = gx - c.cx, dy = gy - c.cy;
      let ang = Math.atan2(dy, dx);
      if (ang < 0) ang += Math.PI * 2;
      const t = (ang / (Math.PI * 2)) * N;
      const i0 = Math.floor(t) % N, f = t - Math.floor(t);
      const edge = med[i0] * (1 - f) + med[(i0 + 1) % N] * f;
      const r = Math.hypot(dx, dy);
      const alpha = Math.max(0, Math.min(1, (edge - r) / 1.6 + 0.5));
      const [cr, cg, cb] = at(gx, gy);
      rgba[i] = cr; rgba[i + 1] = cg; rgba[i + 2] = cb;
      rgba[i + 3] = Math.round(alpha * 255);
    }
  }
  const file = `${OUT}/mokki-${ORDER[k]}.png`;
  await sharp(rgba, { raw: { width: size, height: size, channels: 4 } })
    .resize(Math.min(900, size * 2), Math.min(900, size * 2), { kernel: 'lanczos3' })
    .sharpen({ sigma: 0.6 })
    .png({ compressionLevel: 9 })
    .toFile(file);
  console.log(`✓ ${file} (${size}px → ${Math.min(900, size * 2)}px)`);
}
