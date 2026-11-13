/**
 * Fotos reais dos cookies da MOKKI → PNG com fundo transparente, em alta.
 *
 * 1. Amplia (Lanczos) até ~1400px e realça a nitidez de leve
 * 2. Separa o fundo claro/neutro (preenchimento a partir das bordas)
 * 3. Preenche o interior (chocolate branco, creme do Oreo) pelo contorno radial
 * 4. Suaviza a borda sem halo branco e exporta em PNG (1200px)
 *
 * Uso: npm run assets:cookies
 * Entrada: referencias/fotos-mokki/<sabor>.jpg  → Saída: src/assets/photos/mokki-<sabor>.png
 */
import sharp from 'sharp';
import { mkdir, readdir } from 'node:fs/promises';

const IN = 'referencias/fotos-mokki';
const OUT = 'src/assets/photos';
const TARGET = 1400;
await mkdir(OUT, { recursive: true });

const files = (await readdir(IN)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));

for (const file of files) {
  const id = file.replace(/\.[^.]+$/, '');
  const meta = await sharp(`${IN}/${file}`).metadata();
  const scale = Math.max(1, TARGET / meta.width);
  const W = Math.round(meta.width * scale);
  const { data, info } = await sharp(`${IN}/${file}`)
    .resize(W, null, { kernel: 'lanczos3' })
    .sharpen({ sigma: 0.8 * scale, m1: 0.5, m2: 1.2 })
    .modulate({ saturation: 1.04 })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const H = info.height, C = info.channels;

  // Fundo e sombra da mesa são acinzentados (pouca saturação); a borda do
  // cookie é sempre bem saturada (massa dourada/chocolate) ou bem escura.
  const isBg = (i) => {
    const r = data[i * C], g = data[i * C + 1], b = data[i * C + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const v = max / 255, sat = max ? (max - min) / max : 0;
    return !(sat > 0.24 || v < 0.3);
  };
  const bg = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
  while (stack.length) {
    const p = stack.pop();
    if (bg[p] || !isBg(p)) continue;
    bg[p] = 1;
    const x = p % W;
    if (x > 0) stack.push(p - 1);
    if (x < W - 1) stack.push(p + 1);
    if (p >= W) stack.push(p - W);
    if (p < W * (H - 1)) stack.push(p + W);
  }

  // Centro e contorno radial do cookie
  let sx = 0, sy = 0, n = 0;
  for (let p = 0; p < W * H; p++) if (!bg[p]) { sx += p % W; sy += (p / W) | 0; n++; }
  const cx = sx / n, cy = sy / n;
  const A = 720, radii = new Float64Array(A);
  for (let a = 0; a < A; a++) {
    const th = (a / A) * Math.PI * 2;
    let last = 0, miss = 0;
    for (let r = 0; r < W; r++) {
      const x = Math.round(cx + Math.cos(th) * r), y = Math.round(cy + Math.sin(th) * r);
      if (x < 0 || y < 0 || x >= W || y >= H) break;
      if (!bg[y * W + x]) { last = r; miss = 0; } else if (++miss > W * 0.02) break;
    }
    radii[a] = last;
  }
  const R = Array.from(radii, (_, a) => {
    const w = [];
    for (let j = -8; j <= 8; j++) w.push(radii[(a + j + A) % A]);
    return w.sort((p, q) => p - q)[8];
  });
  const radiusAt = (x, y) => {
    let ang = Math.atan2(y - cy, x - cx);
    if (ang < 0) ang += Math.PI * 2;
    const t = (ang / (Math.PI * 2)) * A;
    const i = Math.floor(t) % A, f = t - Math.floor(t);
    return R[i] * (1 - f) + R[(i + 1) % A] * f;
  };

  // Máscara final: borda precisa + interior sempre preenchido
  const mask = Buffer.alloc(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      const r = Math.hypot(x - cx, y - cy);
      const edge = radiusAt(x, y);
      const inside = r < edge * 0.9 || (!bg[p] && r < edge * 1.03);
      mask[p] = inside ? 255 : 0;
    }
  }
  // erosão leve (remove franja branca) + suavização
  const eroded = await sharp(mask, { raw: { width: W, height: H, channels: 1 } })
    .blur(1.4)
    .threshold(200)
    .blur(1.1)
    .extractChannel(0)
    .raw()
    .toBuffer();

  // Recorte quadrado ao redor do cookie
  const Rmax = Math.max(...R) * 1.04;
  const half = Math.ceil(Rmax);
  const left = Math.max(0, Math.round(cx - half)), top = Math.max(0, Math.round(cy - half));
  const size = Math.min(W - left, H - top, half * 2);
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const s = (top + y) * W + (left + x);
      const d = (y * size + x) * 4;
      rgba[d] = data[s * C];
      rgba[d + 1] = data[s * C + 1];
      rgba[d + 2] = data[s * C + 2];
      rgba[d + 3] = eroded[s];
    }
  }
  const outSize = Math.min(1200, size);
  await sharp(rgba, { raw: { width: size, height: size, channels: 4 } })
    .resize(outSize, outSize, { kernel: 'lanczos3' })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(`${OUT}/mokki-${id}.png`);
  console.log(`✓ mokki-${id}.png  (${meta.width}px → ${outSize}px)`);
}
