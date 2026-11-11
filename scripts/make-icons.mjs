/**
 * Favicon, ícone Apple e imagem de compartilhamento (Open Graph).
 * Uso: node scripts/make-icons.mjs
 */
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';

const BLUE = '#C5DCE5', BROWN = '#492B27', CREAM = '#FFF0BD';
const oSvg = await readFile('src/assets/brand/mokki-o.svg', 'utf8');
const oPath = oSvg.match(/ d="([^"]+)"/)[1];
const oView = oSvg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
const [, , ow, oh] = oView;

// Favicon SVG: "O" mordido da logo sobre círculo azul.
const pad = Math.max(ow, oh) * 0.28;
const box = Math.max(ow, oh) + pad * 2;
const fav = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}"><rect width="${box}" height="${box}" rx="${box * 0.24}" fill="${BLUE}"/><path transform="translate(${(box - ow) / 2} ${(box - oh) / 2})" fill="${BROWN}" fill-rule="evenodd" d="${oPath}"/></svg>`;
await writeFile('public/favicon.svg', fav);
await sharp(Buffer.from(fav)).resize(32, 32).png().toFile('public/favicon-32.png');
await sharp(Buffer.from(fav)).resize(180, 180).flatten({ background: BLUE }).png().toFile('public/apple-touch-icon.png');
await sharp(Buffer.from(fav)).resize(512, 512).png().toFile('public/icon-512.png');

// Open Graph 1200×630: fundo azul, listras, cookie real e logo.
const logo = (await readFile('src/assets/brand/mokki-logo.svg', 'utf8')).replace('fill="currentColor"', `fill="${BROWN}"`);
const stripes = Array.from({ length: 40 }, (_, i) => `<rect x="${i * 30}" y="0" width="15" height="630" fill="${BROWN}"/>`).join('');
const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="${BLUE}"/><g opacity="1">${stripes}</g><rect x="40" y="40" width="1120" height="550" rx="36" fill="${BLUE}"/><text x="90" y="470" font-family="Arial, sans-serif" font-size="34" fill="${BROWN}">Cookies artesanais recheados</text><text x="90" y="520" font-family="Arial, sans-serif" font-weight="bold" font-size="34" fill="${BROWN}">Juiz de Fora – MG</text></svg>`;
const cookie = await sharp('src/assets/photos/cookie-cutout.png').resize(520, 520).toBuffer();
const logoPng = await sharp(Buffer.from(logo)).resize(560).png().toBuffer();
await sharp(Buffer.from(bg))
  .composite([
    { input: logoPng, left: 80, top: 150 },
    { input: cookie, left: 620, top: 55 },
  ])
  .jpeg({ quality: 86 })
  .toFile('public/og-image.jpg');
console.log('✓ ícones e og-image');
