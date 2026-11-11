// @ts-check
/**
 * Forma do cookie MOKKI: contorno real (extraído da foto) e cúpula assada.
 * Espaço local: raio ≈ 1, eixo Y = espessura (topo em +Y).
 */
import { createNoise } from './noise.js';
import { HERO_OUTLINE } from './heroOutline.js';

export const SHAPE = {
  radius: 1,
  top: 0.25,
  bottom: 0.12,
  /** Extensão do mapeamento planar das UVs (u = 0.5 + x / (2*uvExtent)). */
  uvExtent: 1.12,
};

const N = createNoise(1307);

/**
 * Raio do contorno em função do ângulo. Vem do contorno REAL do cookie da
 * foto (scripts/prepare-photos.mjs), então a geometria casa com a textura.
 */
export function edgeRadius(theta) {
  const n = HERO_OUTLINE.length;
  const t = ((((theta / (Math.PI * 2)) % 1) + 1) % 1) * n;
  const i = Math.floor(t);
  const f = t - i;
  return HERO_OUTLINE[i % n] * (1 - f) + HERO_OUTLINE[(i + 1) % n] * f;
}

/** Distância normalizada ao centro (0 centro, 1 borda). */
export function normRadius(x, z) {
  const r = Math.hypot(x, z);
  return r / edgeRadius(Math.atan2(z, x));
}

/** Relevo suave do topo (montinhos de massa). */
export function topLumps(x, z) {
  return 0.012 * N.fbm2(x * 1.4 + 4.2, z * 1.4 - 7.1, 3) + 0.004 * N.fbm2(x * 3.6 - 2, z * 3.6 + 5, 2);
}

export function topHeight(x, z) {
  const s = normRadius(x, z);
  if (s >= 1) return 0;
  const dome = Math.pow(1 - Math.pow(s, 2.35), 0.42);
  return SHAPE.top * dome + topLumps(x, z) * (1 - Math.pow(s, 4));
}

export function bottomHeight(x, z) {
  const s = normRadius(x, z);
  if (s >= 1) return 0;
  return -SHAPE.bottom * Math.pow(1 - Math.pow(s, 9), 0.24);
}
