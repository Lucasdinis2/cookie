/**
 * Prepara a FOTO REAL do cookie para virar a superfície do cookie 3D:
 *  1. Recorta o cookie do fundo (segmentação por cor + preenchimento de buracos)
 *  2. Extrai o contorno real (perfil radial) → a geometria 3D usa esse contorno
 *  3. Gera textura de cor, relevo (normal map) e brilho (roughness) alinhados
 *
 * Uso: node scripts/prepare-photos.mjs
 * Entrada: referencias/fotos/hero-classic.jpg (Unsplash, licença livre)
 */
import sharp from 'sharp';
import { writeFile, mkdir } from 'node:fs/promises';

const SRC = 'referencias/fotos/hero-classic.jpg';
const UV_EXTENT = 1.12; // deve bater com SHAPE.uvExtent
const ANGLES = 360;

await mkdir('public/textures', { recursive: true });

const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels;

// --- 1+2. Contorno real por varredura radial a partir do centro -------------
// Massa: saturada e clara; chocolate: escuro e bem saturado. Sombra e papel não.
const SEED = { x: 1540, y: 1940 };
function cookieAt(x, y) {
  if (x < 0 || y < 0 || x >= W || y >= H) return false;
  const i = (Math.round(y) * W + Math.round(x)) * C;
  const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const s = max === 0 ? 0 : (max - min) / max;
  return (s > 0.2 && max > 0.55) || (s > 0.5 && max > 0.25);
}
// Máscara em 1/4 da resolução → componente conectado ao centro → sem buracos.
const Q = 4, MW = Math.floor(W / Q), MH = Math.floor(H / Q);
const raw = new Uint8Array(MW * MH);
for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) raw[y * MW + x] = cookieAt(x * Q, y * Q) ? 1 : 0;
function flood(mask, sx, sy, value) {
  const out = new Uint8Array(MW * MH);
  const stack = [sy * MW + sx];
  while (stack.length) {
    const p = stack.pop();
    if (out[p] || mask[p] !== value) continue;
    out[p] = 1;
    const x = p % MW, y = (p / MW) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < MW - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - MW);
    if (y < MH - 1) stack.push(p + MW);
  }
  return out;
}
function morph(mask, r, grow) {
  const out = new Uint8Array(MW * MH);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    let hit = !grow;
    for (let dy = -r; dy <= r && hit !== grow; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const nx = x + dx, ny = y + dy;
      const v = nx >= 0 && ny >= 0 && nx < MW && ny < MH ? mask[ny * MW + nx] : 0;
      if (grow && v) { hit = true; break; }
      if (!grow && !v) { hit = false; break; }
    }
    out[y * MW + x] = hit ? 1 : 0;
  }
  return out;
}
// Abertura morfológica: quebra pontes finas com os cookies vizinhos.
const opened = morph(morph(raw, 6, false), 6, true).map((v, i) => v & raw[i]);
let comp = flood(opened, Math.round(1250 / Q), Math.round(2350 / Q), 1);
comp = morph(morph(comp, 3, true), 3, false);
const outsideBg = flood(comp, 0, MH - 1, 0);
const solid = outsideBg.map((v) => 1 - v);
function profile(cx, cy) {
  const out = new Float64Array(ANGLES);
  for (let k = 0; k < ANGLES; k++) {
    const th = (k / ANGLES) * Math.PI * 2;
    const dx = Math.cos(th), dy = -Math.sin(th); // +z local = para cima na foto
    let last = 0;
    for (let r = 0; r < 1800; r += 1) {
      const x = Math.round((cx + dx * r) / Q), y = Math.round((cy + dy * r) / Q);
      if (x < 0 || y < 0 || x >= MW || y >= MH) break;
      if (solid[y * MW + x]) last = r;
      else if (r - last > 40) break;
    }
    out[k] = last;
  }
  const med = new Float64Array(ANGLES);
  for (let k = 0; k < ANGLES; k++) {
    const win = [];
    for (let j = -8; j <= 8; j++) win.push(out[(k + j + ANGLES) % ANGLES]);
    win.sort((a, b) => a - b);
    med[k] = win[8];
  }
  const sm = new Float64Array(ANGLES);
  for (let k = 0; k < ANGLES; k++) {
    let s2 = 0, ws = 0;
    for (let j = -3; j <= 3; j++) { const w = 4 - Math.abs(j); s2 += med[(k + j + ANGLES) % ANGLES] * w; ws += w; }
    sm[k] = s2 / ws;
  }
  return sm;
}
let FCX = SEED.x, FCY = SEED.y, smoothFull = profile(FCX, FCY);
for (let it = 0; it < 3; it++) {
  // Recentraliza pelo centróide do polígono do contorno.
  let ax = 0, ay = 0;
  for (let k = 0; k < ANGLES; k++) {
    const th = (k / ANGLES) * Math.PI * 2;
    ax += FCX + Math.cos(th) * smoothFull[k];
    ay += FCY - Math.sin(th) * smoothFull[k];
  }
  FCX = ax / ANGLES; FCY = ay / ANGLES;
  smoothFull = profile(FCX, FCY);
}
const FR = smoothFull.reduce((a, b) => a + b, 0) / ANGLES;
const smooth = smoothFull.map((r) => r / 2);
const outline = Array.from(smoothFull, (r) => Number((r / FR).toFixed(4)));
await writeFile('src/lib/procedural/heroOutline.js', '// Gerado por scripts/prepare-photos.mjs — contorno real do cookie da foto (unsplash.com/photos/5So4kc3Ocus)' + String.fromCharCode(10) + 'export const HERO_OUTLINE = ' + JSON.stringify(outline) + ';' + String.fromCharCode(10));
console.log(`centro (${FCX.toFixed(0)}, ${FCY.toFixed(0)}), raio médio ${FR.toFixed(0)}px, min ${Math.min(...outline)} max ${Math.max(...outline)}`);

// --- 3. Texturas alinhadas ao espaço local do cookie ---------------------------
const radiusAt = (th) => {
  const t = (((th / (Math.PI * 2)) % 1) + 1) % 1 * ANGLES;
  const i = Math.floor(t), f = t - i;
  return (smooth[i % ANGLES] * (1 - f) + smooth[(i + 1) % ANGLES] * f) * 2;
};
function sample(x, y) {
  const xi = Math.min(W - 2, Math.max(0, Math.floor(x))), yi = Math.min(H - 2, Math.max(0, Math.floor(y)));
  const fx = x - xi, fy = y - yi;
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const a = data[(yi * W + xi) * C + c], b = data[(yi * W + xi + 1) * C + c];
    const d = data[((yi + 1) * W + xi) * C + c], e = data[((yi + 1) * W + xi + 1) * C + c];
    out[c] = (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy;
  }
  return out;
}

async function buildSet(S, suffix) {
  const color = Buffer.alloc(S * S * 3);
  const lum = new Float32Array(S * S);
  const choc = new Float32Array(S * S);
  const salt = new Float32Array(S * S);
  for (let row = 0; row < S; row++) {
    const v = 1 - row / (S - 1);
    for (let col = 0; col < S; col++) {
      const u = col / (S - 1);
      const lx = (u - 0.5) * 2 * UV_EXTENT; // unidades locais (raio ≈ 1)
      const lz = (v - 0.5) * 2 * UV_EXTENT;
      const th = Math.atan2(lz, lx);
      const edge = radiusAt(th) / FR;
      let r = Math.hypot(lx, lz);
      // Fora do cookie: estende a cor da borda radialmente (sem vazar o papel).
      const limit = edge * 0.972;
      if (r > limit) r = Math.max(limit * 0.82, 2 * limit - r);
      const k = r / Math.max(1e-6, Math.hypot(lx, lz));
      const px = FCX + lx * k * FR;
      const py = FCY - lz * k * FR;
      const [R, G, B] = sample(px, py);
      const i = row * S + col;
      color[i * 3] = R;
      color[i * 3 + 1] = G;
      color[i * 3 + 2] = B;
      const max = Math.max(R, G, B) / 255, min = Math.min(R, G, B) / 255;
      const sat = max ? (max - min) / max : 0;
      lum[i] = (0.299 * R + 0.587 * G + 0.114 * B) / 255;
      // Chocolate: escuro e marrom; sal: claro e sem saturação.
      choc[i] = max < 0.5 && R > B ? Math.min(1, (0.5 - max) * 6) : 0;
      salt[i] = max > 0.82 && sat < 0.2 ? 1 : 0;
    }
  }
  await sharp(color, { raw: { width: S, height: S, channels: 3 } })
    .webp({ quality: 84, effort: 6 })
    .toFile(`public/textures/photo-top${suffix}.webp`);

  // Relevo: passa-alta da luminância (+ chocolate em relevo).
  const toBuf = (arr) => Buffer.from(arr.map((v) => Math.max(0, Math.min(255, Math.round(v * 255)))));
  const blurred = async (arr, sigma) =>
    new Float32Array(
      [...(await sharp(toBuf(arr), { raw: { width: S, height: S, channels: 1 } }).blur(sigma).raw().toBuffer())].map(
        (v) => v / 255,
      ),
    );
  const scale = S / 2048;
  const fine = await blurred(lum, Math.max(0.3, 1.2 * scale));
  const coarse = await blurred(lum, 14 * scale);
  const chocSoft = await blurred(choc, 3 * scale);
  const height = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) height[i] = (fine[i] - coarse[i]) * 1.6 + chocSoft[i] * 0.22;

  const normal = Buffer.alloc(S * S * 3);
  const strength = 9 * scale;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const l = height[y * S + Math.max(0, x - 1)], r = height[y * S + Math.min(S - 1, x + 1)];
      const u = height[Math.max(0, y - 1) * S + x], d = height[Math.min(S - 1, y + 1) * S + x];
      let nx = -(r - l) * strength / scale, ny = -(u - d) * strength / scale, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      normal[i * 3] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      normal[i * 3 + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      normal[i * 3 + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
    }
  }
  await sharp(normal, { raw: { width: S, height: S, channels: 3 } })
    .resize(S / 2)
    .webp({ quality: 78, effort: 6 })
    .toFile(`public/textures/photo-normal${suffix}.webp`);

  // Roughness (canal G): chocolate e sal brilham, massa é fosca.
  const rough = Buffer.alloc(S * S * 3);
  for (let i = 0; i < S * S; i++) {
    const g = 0.86 - chocSoft[i] * 0.3 - salt[i] * 0.3;
    const val = Math.round(Math.max(0.5, g) * 255);
    rough[i * 3] = val;
    rough[i * 3 + 1] = val;
    rough[i * 3 + 2] = val;
  }
  await sharp(rough, { raw: { width: S, height: S, channels: 3 } })
    .resize(S / 2)
    .webp({ quality: 85 })
    .toFile(`public/textures/photo-rough${suffix}.webp`);
  console.log(`✓ texturas ${S}px`);
}

await buildSet(2048, '');
await buildSet(1024, '-sm');

// --- 4. Miolo real (face da quebra) a partir de foto de cookie partido ---------
// Fonte: referencias/fotos/nutella.jpg (Unsplash, licença livre)
{
  const SRC2 = 'referencias/fotos/nutella.jpg';
  // "Quilting": a partir de UM recorte nítido de miolo limpo, sorteia pequenas
  // janelas (com giros de 90° e espelhamentos) e mescla com bordas suaves.
  // Migalha é uma textura isotrópica, então o resultado não mostra repetição.
  const EX = { left: 800, top: 1460, width: 165, height: 150 };
  const ex = new Uint8Array(await sharp(SRC2).extract(EX).removeAlpha().raw().toBuffer());
  const exPix = (x, y, c) => ex[(Math.min(EX.height - 1, y) * EX.width + Math.min(EX.width - 1, x)) * 3 + c];
  const CW = 1024, CH = 256;
  const acc = new Float32Array(CW * CH * 3);
  const wsum = new Float32Array(CW * CH);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const T = 76, STEP = 40;
  for (let gy = -1; gy <= Math.ceil(CH / STEP); gy++) {
    for (let gx = -1; gx <= Math.ceil(CW / STEP); gx++) {
      const ox = Math.floor(rnd() * (EX.width - T));
      const oy = Math.floor(rnd() * (EX.height - T));
      const rot = Math.floor(rnd() * 4);
      const flip = rnd() < 0.5;
      const x0 = Math.round(gx * STEP + (rnd() - 0.5) * 18);
      const y0 = Math.round(gy * STEP + (rnd() - 0.5) * 18);
      for (let y = 0; y < T; y++) {
        const Y = y0 + y;
        if (Y < 0 || Y >= CH) continue;
        const wy = Math.sin((Math.PI * (y + 0.5)) / T);
        for (let x = 0; x < T; x++) {
          const X = x0 + x;
          if (X < 0 || X >= CW) continue;
          const wx = Math.sin((Math.PI * (x + 0.5)) / T);
          const wgt = Math.pow(Math.max(1e-4, wx * wy), 4);
          let sx = flip ? T - 1 - x : x, sy = y;
          for (let r = 0; r < rot; r++) [sx, sy] = [T - 1 - sy, sx];
          const i = Y * CW + X;
          for (let c = 0; c < 3; c++) acc[i * 3 + c] += exPix(ox + sx, oy + sy, c) * wgt;
          wsum[i] += wgt;
        }
      }
    }
  }
  // Ajusta a cor média para o tom de miolo de um cookie dourado.
  const mean = [0, 0, 0];
  for (let i = 0; i < CW * CH; i++) for (let c = 0; c < 3; c++) mean[c] += acc[i * 3 + c] / wsum[i] / (CW * CH);
  const target = [214, 170, 110];
  for (let i = 0; i < CW * CH; i++) {
    for (let c = 0; c < 3; c++) acc[i * 3 + c] = ((acc[i * 3 + c] / wsum[i]) * target[c]) / mean[c];
    wsum[i] = 1;
  }
  const crust = (v) => {
    const top = Math.max(0, (v - 0.88) / 0.12), bot = Math.max(0, (0.12 - v) / 0.12);
    return { top: top * top, bot: bot * bot };
  };
  const out = Buffer.alloc(CW * CH * 3);
  const lumArr = new Float32Array(CW * CH);
  for (let y = 0; y < CH; y++) {
    const v = 1 - y / (CH - 1);
    const { top, bot } = crust(v);
    for (let x = 0; x < CW; x++) {
      const i = y * CW + x;
      let r = acc[i * 3] / wsum[i], g = acc[i * 3 + 1] / wsum[i], b = acc[i * 3 + 2] / wsum[i];
      // Crosta dourada no topo e base, como no cookie real.
      r = r * (1 - top * 0.8) + 176 * top * 0.8; g = g * (1 - top * 0.8) + 108 * top * 0.8; b = b * (1 - top * 0.8) + 50 * top * 0.8;
      r = r * (1 - bot * 0.8) + 150 * bot * 0.8; g = g * (1 - bot * 0.8) + 88 * bot * 0.8; b = b * (1 - bot * 0.8) + 40 * bot * 0.8;
      out[i * 3] = r; out[i * 3 + 1] = g; out[i * 3 + 2] = b;
      lumArr[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }
  }
  await sharp(out, { raw: { width: CW, height: CH, channels: 3 } }).webp({ quality: 90 }).toFile('public/textures/crumb-photo.webp');
  const lumBuf = Buffer.from(lumArr.map((v) => Math.round(v * 255)));
  const fine = await sharp(lumBuf, { raw: { width: CW, height: CH, channels: 1 } }).blur(0.8).raw().toBuffer();
  const coarse = await sharp(lumBuf, { raw: { width: CW, height: CH, channels: 1 } }).blur(8).raw().toBuffer();
  const nm = Buffer.alloc(CW * CH * 3);
  const hgt = (x, y) => (fine[y * CW + x] - coarse[y * CW + x]) / 255;
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const nx = -(hgt(Math.min(CW - 1, x + 1), y) - hgt(Math.max(0, x - 1), y)) * 6;
    const ny = -(hgt(x, Math.max(0, y - 1)) - hgt(x, Math.min(CH - 1, y + 1))) * 6;
    const len = Math.hypot(nx, ny, 1);
    const i = (y * CW + x) * 3;
    nm[i] = Math.round((nx / len * 0.5 + 0.5) * 255);
    nm[i + 1] = Math.round((ny / len * 0.5 + 0.5) * 255);
    nm[i + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
  }
  await sharp(nm, { raw: { width: CW, height: CH, channels: 3 } }).webp({ quality: 88 }).toFile('public/textures/crumb-photo-normal.webp');
  console.log('✓ miolo fotográfico');
}

// --- 5. Recorte com transparência (poster do topo, fallback e Open Graph) ------
{
  await mkdir('src/assets/photos', { recursive: true });
  const half = Math.round(FR * 1.035);
  const left = Math.round(FCX - half), top = Math.round(FCY - half), size = half * 2;
  const alpha = Buffer.alloc(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const lx = (x - half) / FR, lz = -(y - half) / FR;
      const edge = radiusAt(Math.atan2(lz, lx)) / FR;
      const r = Math.hypot(lx, lz);
      const radial = Math.max(0, Math.min(1, (edge * 0.995 - r) / 0.006));
      alpha[y * size + x] = Math.round(radial * 255);
    }
  }
  const softAlpha = await sharp(alpha, { raw: { width: size, height: size, channels: 1 } }).blur(1.2).extractChannel(0).raw().toBuffer();
  const rgb = await sharp(SRC).extract({ left, top, width: size, height: size }).removeAlpha().raw().toBuffer();
  const rgba = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    rgba[i * 4] = rgb[i * 3];
    rgba[i * 4 + 1] = rgb[i * 3 + 1];
    rgba[i * 4 + 2] = rgb[i * 3 + 2];
    rgba[i * 4 + 3] = softAlpha[i];
  }
  await sharp(rgba, { raw: { width: size, height: size, channels: 4 } })
    .resize(1400, 1400)
    .png({ compressionLevel: 9 })
    .toFile('src/assets/photos/cookie-cutout.png');
  console.log('✓ recorte com transparência');
}
