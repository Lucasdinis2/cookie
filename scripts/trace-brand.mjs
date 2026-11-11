/**
 * Vetoriza a logo e o mascote da MOKKI a partir das artes originais
 * (pasta /referencias) e gera SVGs limpos em src/assets/brand.
 *
 * Uso: npm run assets:logo
 */
import sharp from 'sharp';
import potrace from 'potrace';
import { mkdir, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const trace = promisify(potrace.trace);
const OUT = new URL('../src/assets/brand/', import.meta.url);
await mkdir(OUT, { recursive: true });

/** Recorta, amplia e binariza uma região da arte antes de vetorizar. */
async function prepare(file, region, scale, threshold) {
  const { left, top, width, height } = region;
  return sharp(file)
    .extract({ left, top, width, height })
    .resize(width * scale, height * scale, { kernel: 'lanczos3' })
    .grayscale()
    .blur(0.6 * scale)
    .threshold(threshold)
    .png()
    .toBuffer();
}

function extractPaths(svg) {
  const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1] ?? svg.match(/width="(\d+)" height="(\d+)"/).slice(1).join(' ');
  const d = [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]).join(' ');
  const w = svg.match(/width="([\d.]+)"/)[1];
  const h = svg.match(/height="([\d.]+)"/)[1];
  return { d, w: Number(w), h: Number(h), viewBox };
}

async function vectorize(name, file, region, { scale = 4, threshold = 150, turdSize = 20 } = {}) {
  const buf = await prepare(file, region, scale, threshold);
  const svg = await trace(buf, {
    turdSize,
    alphaMax: 1,
    optCurve: true,
    optTolerance: 0.4,
    threshold: 128,
    blackOnWhite: true,
    color: 'currentColor',
    background: 'transparent',
  });
  const { d, w, h } = extractPaths(svg);
  const clean = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" fill="currentColor"><path fill-rule="evenodd" d="${d}"/></svg>\n`;
  await writeFile(new URL(`${name}.svg`, OUT), clean);
  console.log(`✓ ${name}.svg (${w}×${h})`);
  return { d, w, h };
}

// Palavra "MOKKI"
await vectorize('mokki-wordmark', 'referencias/logo-mokki.png', { left: 128, top: 712, width: 648, height: 166 });
// Assinatura "cookies"
await vectorize('mokki-cookies-script', 'referencias/logo-mokki.png', { left: 312, top: 878, width: 286, height: 70 }, { threshold: 165, turdSize: 8 });
// Logo completa (MOKKI + cookies)
await vectorize('mokki-logo', 'referencias/logo-mokki.png', { left: 128, top: 712, width: 648, height: 236 }, { threshold: 160, turdSize: 8 });
// Mascote do cardápio
await vectorize('mokki-mascote', 'referencias/cardapio-mokki.webp', { left: 360, top: 428, width: 182, height: 156 }, { scale: 5, threshold: 175, turdSize: 10 });
// "O" mordido (favicon)
await vectorize('mokki-o', 'referencias/logo-mokki.png', { left: 309, top: 712, width: 134, height: 166 });
