/**
 * Fratura procedural do cookie.
 *
 * 1. Triangula o cookie (Delaunay) com pontos espalhados de forma irregular —
 *    assim as bordas dos pedaços ficam serrilhadas como massa assada de verdade.
 * 2. Divide os triângulos em pedaços: cunhas grandes que irradiam do ponto de
 *    pressão + lascas menores ao longo das rachaduras e da borda.
 * 3. Calcula, por Dijkstra na rede de rachaduras, QUANDO a rachadura chega em
 *    cada ponto — é isso que faz a rachadura "andar" pela superfície no scroll.
 * 4. Gera para cada pedaço: topo (foto), base e paredes da quebra (miolo).
 */
import * as THREE from 'three';
import Delaunator from 'delaunator';
import { edgeRadius, normRadius, topHeight, bottomHeight, SHAPE } from '../lib/procedural/cookieShape.js';
import { createNoise, mulberry32 } from '../lib/procedural/noise.js';

export interface FractureOptions {
  /** Espaçamento médio dos pontos da malha (menor = mais detalhe). */
  spacing: number;
  /** Quantidade de pedaços grandes (cunhas). */
  bigPieces: number;
  /** Quantidade de lascas pequenas. */
  chips: number;
  /** Subdivisões verticais da parede da quebra. */
  wallRows: number;
  seed: number;
  /** Ponto de pressão (onde a rachadura começa), coordenadas locais xz. */
  impact: [number, number];
}

export interface Shard {
  geometry: THREE.BufferGeometry;
  /** Centro do pedaço (espaço local do cookie). */
  centroid: THREE.Vector3;
  area: number;
  big: boolean;
  /** 0..1 — quando a rachadura alcança o pedaço (primeiro contato). */
  crackStart: number;
  /** Direção (xz) para fora do ponto de pressão. */
  outward: THREE.Vector2;
  /** Pontos sobre as bordas quebradas (espaço local), para soltar migalhas. */
  edgePoints: { p: THREE.Vector3; t: number }[];
  distToImpact: number;
}

export interface FractureResult {
  shards: Shard[];
  /** Pontos da rede de rachaduras com o tempo de chegada (0..1). */
  crackPoints: { p: THREE.Vector3; t: number }[];
}

const noise = createNoise(4711);
const next = (e: number) => (e % 3 === 2 ? e - 2 : e + 1);

export function buildFracture(o: FractureOptions): FractureResult {
  const rnd = mulberry32(o.seed);
  const [ix, iz] = o.impact;

  /* ---------------- 1. Pontos ---------------- */
  const coords: number[] = [];
  const isRim: boolean[] = [];
  const h = o.spacing;
  for (let row = 0, z = -1.12; z <= 1.12; row++, z += h * 0.866) {
    for (let x = -1.12 + (row % 2) * h * 0.5; x <= 1.12; x += h) {
      const jx = x + (rnd() - 0.5) * h * 0.6;
      const jz = z + (rnd() - 0.5) * h * 0.6;
      if (normRadius(jx, jz) < 0.885) {
        coords.push(jx, jz);
        isRim.push(false);
      }
    }
  }
  // Anéis próximos à borda: a cúpula cai rápido ali, precisa de mais detalhe.
  for (const s of [0.912, 0.942, 0.966, 0.984, 0.995, 1]) {
    const n = Math.ceil((2 * Math.PI * s) / (h * (s >= 1 ? 0.6 : 0.8)));
    const off = rnd();
    for (let i = 0; i < n; i++) {
      const th = ((i + off + (s < 1 ? (rnd() - 0.5) * 0.4 : 0)) / n) * Math.PI * 2;
      const r = s * edgeRadius(th);
      coords.push(Math.cos(th) * r, Math.sin(th) * r);
      isRim.push(s >= 1);
    }
  }
  const P = coords.length / 2;
  const px = (i: number) => coords[i * 2];
  const pz = (i: number) => coords[i * 2 + 1];
  const topY = new Float32Array(P);
  const botY = new Float32Array(P);
  for (let i = 0; i < P; i++) {
    topY[i] = isRim[i] ? 0 : topHeight(px(i), pz(i));
    botY[i] = isRim[i] ? 0 : bottomHeight(px(i), pz(i));
  }

  /* ---------------- 2. Triangulação ---------------- */
  const d = new Delaunator(Float64Array.from(coords));
  const tris = d.triangles;
  const half = d.halfedges;
  const T = tris.length / 3;
  const valid = new Uint8Array(T);
  for (let t = 0; t < T; t++) {
    const a = tris[t * 3], b = tris[t * 3 + 1], c = tris[t * 3 + 2];
    const cx = (px(a) + px(b) + px(c)) / 3;
    const cz = (pz(a) + pz(b) + pz(c)) / 3;
    const area = Math.abs((px(b) - px(a)) * (pz(c) - pz(a)) - (pz(b) - pz(a)) * (px(c) - px(a))) / 2;
    valid[t] = normRadius(cx, cz) < 1 && area > 1e-7 ? 1 : 0;
  }

  /* ---------------- 3. Sementes dos pedaços ---------------- */
  interface Seed { x: number; z: number; w: number; big: boolean }
  const seeds: Seed[] = [];
  const a0 = rnd() * Math.PI * 2;
  for (let k = 0; k < o.bigPieces; k++) {
    const ang = a0 + (k / o.bigPieces) * Math.PI * 2 + (rnd() - 0.5) * (Math.PI * 2 / o.bigPieces) * 0.5;
    const r = 0.46 + rnd() * 0.24;
    seeds.push({ x: ix + Math.cos(ang) * r, z: iz + Math.sin(ang) * r, w: 1, big: true });
  }
  const bigOnly = seeds.filter((s) => s.big);
  let guard = 0;
  while (seeds.length < o.bigPieces + o.chips && guard++ < 6000) {
    const ang = rnd() * Math.PI * 2;
    const rad = Math.sqrt(rnd()) * 0.98;
    const x = Math.cos(ang) * rad * edgeRadius(ang);
    const z = Math.sin(ang) * rad * edgeRadius(ang);
    const s = normRadius(x, z);
    if (s > 0.97) continue;
    const ds = bigOnly.map((b) => Math.hypot(x - b.x, z - b.z)).sort((p, q) => p - q);
    const nearCrack = ds[1] - ds[0] < 0.07;
    const nearRim = s > 0.86 && rnd() < 0.5;
    if (!nearCrack && !nearRim) continue;
    if (Math.hypot(x - ix, z - iz) < 0.3) continue;
    if (seeds.some((q) => !q.big && Math.hypot(q.x - x, q.z - z) < 0.26)) continue;
    seeds.push({ x, z, w: 3.4 + rnd() * 2.2, big: false });
  }

  /* ---------------- 4. Atribuição (Voronoi ponderado + distorção) ---------------- */
  const cellOf = new Int32Array(T).fill(-1);
  for (let t = 0; t < T; t++) {
    if (!valid[t]) continue;
    const a = tris[t * 3], b = tris[t * 3 + 1], c = tris[t * 3 + 2];
    let cx = (px(a) + px(b) + px(c)) / 3;
    let cz = (pz(a) + pz(b) + pz(c)) / 3;
    cx += 0.05 * noise.fbm2(cx * 3.2, cz * 3.2, 3) + 0.012 * noise.noise2(cx * 18, cz * 18);
    cz += 0.05 * noise.fbm2(cx * 3.2 + 7.7, cz * 3.2 - 3.1, 3) + 0.012 * noise.noise2(cx * 18 + 5, cz * 18);
    let best = 0, bestD = Infinity;
    seeds.forEach((s, i) => {
      const dd = Math.hypot(cx - s.x, cz - s.z) * s.w;
      if (dd < bestD) { bestD = dd; best = i; }
    });
    cellOf[t] = best;
  }

  /* ---------------- 5. Componentes conexos → pedaços ---------------- */
  const piece = new Int32Array(T).fill(-1);
  const pieceTris: number[][] = [];
  for (let t = 0; t < T; t++) {
    if (!valid[t] || piece[t] >= 0) continue;
    const id = pieceTris.length;
    const list: number[] = [];
    const stack = [t];
    piece[t] = id;
    while (stack.length) {
      const cur = stack.pop()!;
      list.push(cur);
      for (let k = 0; k < 3; k++) {
        const opp = half[cur * 3 + k];
        if (opp < 0) continue;
        const t2 = Math.floor(opp / 3);
        if (valid[t2] && piece[t2] < 0 && cellOf[t2] === cellOf[cur]) {
          piece[t2] = id;
          stack.push(t2);
        }
      }
    }
    pieceTris.push(list);
  }
  // Funde fragmentos minúsculos ao vizinho com quem mais compartilham borda.
  for (let pass = 0; pass < 4; pass++) {
    pieceTris.forEach((list, id) => {
      if (!list.length || list.length >= 10) return;
      const votes = new Map<number, number>();
      for (const t of list) {
        for (let k = 0; k < 3; k++) {
          const opp = half[t * 3 + k];
          if (opp < 0) continue;
          const q = piece[Math.floor(opp / 3)];
          if (q >= 0 && q !== id) votes.set(q, (votes.get(q) ?? 0) + 1);
        }
      }
      let target = -1, most = 0;
      votes.forEach((v, q) => { if (v > most) { most = v; target = q; } });
      if (target < 0) return;
      for (const t of list) piece[t] = target;
      pieceTris[target].push(...list);
      list.length = 0;
    });
  }

  /* ---------------- 6. Rede de rachaduras e tempo de chegada ---------------- */
  const adj = new Map<number, { to: number; w: number }[]>();
  const link = (a: number, b: number) => {
    const mx = (px(a) + px(b)) / 2, mz = (pz(a) + pz(b)) / 2;
    const w = Math.hypot(px(a) - px(b), pz(a) - pz(b)) * (0.75 + 0.5 * (noise.noise2(mx * 6, mz * 6) * 0.5 + 0.5));
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a)!.push({ to: b, w });
    adj.get(b)!.push({ to: a, w });
  };
  for (let e = 0; e < tris.length; e++) {
    const opp = half[e];
    if (opp < e) continue; // cada aresta uma vez (e opp=-1 descartado)
    const t1 = Math.floor(e / 3), t2 = Math.floor(opp / 3);
    if (!valid[t1] || !valid[t2] || piece[t1] === piece[t2]) continue;
    link(tris[e], tris[next(e)]);
  }
  // Suaviza o "zigue-zague" da malha ao longo das rachaduras (bordas menos
  // serrilhadas e regulares), mantendo junções e borda do cookie no lugar.
  for (let it = 0; it < 3; it++) {
    const moved: [number, number, number][] = [];
    adj.forEach((nb, v) => {
      if (isRim[v]) return;
      const uniq = [...new Set(nb.map((n) => n.to))];
      if (uniq.length !== 2) return;
      const mx = (px(uniq[0]) + px(uniq[1])) / 2;
      const mz = (pz(uniq[0]) + pz(uniq[1])) / 2;
      moved.push([v, px(v) + (mx - px(v)) * 0.4, pz(v) + (mz - pz(v)) * 0.4]);
    });
    for (const [v, x, z] of moved) {
      coords[v * 2] = x;
      coords[v * 2 + 1] = z;
    }
  }
  adj.forEach((_, v) => {
    if (isRim[v]) return;
    topY[v] = topHeight(px(v), pz(v));
    botY[v] = bottomHeight(px(v), pz(v));
  });

  const crackDist = new Map<number, number>();
  if (adj.size) {
    let start = -1, sd = Infinity;
    adj.forEach((_, v) => {
      const dd = Math.hypot(px(v) - ix, pz(v) - iz);
      if (dd < sd) { sd = dd; start = v; }
    });
    // Dijkstra simples com heap binário
    const heap: [number, number][] = [[0, start]];
    const push = (item: [number, number]) => {
      heap.push(item);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    crackDist.set(start, 0);
    while (heap.length) {
      const [dist, v] = pop();
      if (dist > (crackDist.get(v) ?? Infinity)) continue;
      for (const { to, w } of adj.get(v)!) {
        const nd = dist + w;
        if (nd < (crackDist.get(to) ?? Infinity)) {
          crackDist.set(to, nd);
          push([nd, to]);
        }
      }
    }
    // Trechos desconectados (lascas isoladas): pela distância ao impacto.
    adj.forEach((_, v) => {
      if (!crackDist.has(v)) crackDist.set(v, Math.hypot(px(v) - ix, pz(v) - iz) * 1.35);
    });
  }
  let maxD = 0;
  crackDist.forEach((v) => (maxD = Math.max(maxD, v)));
  const crackT = new Float32Array(P).fill(9);
  crackDist.forEach((v, k) => (crackT[k] = v / (maxD || 1)));
  // Vizinhos de vértices da rachadura herdam o tempo (interpolação estável).
  const nearT = Float32Array.from(crackT);
  for (let t = 0; t < T; t++) {
    if (!valid[t]) continue;
    const vs = [tris[t * 3], tris[t * 3 + 1], tris[t * 3 + 2]];
    const m = Math.min(...vs.map((v) => crackT[v]));
    for (const v of vs) if (crackT[v] > 8) nearT[v] = Math.min(nearT[v], m);
  }

  /* ---------------- 7. Geometria de cada pedaço ---------------- */
  const E = SHAPE.uvExtent;
  const shards: Shard[] = [];
  pieceTris.forEach((list, id) => {
    if (!list.length) return;
    // centroide pela área
    let ax = 0, az = 0, area = 0;
    for (const t of list) {
      const a = tris[t * 3], b = tris[t * 3 + 1], c = tris[t * 3 + 2];
      const ar = Math.abs((px(b) - px(a)) * (pz(c) - pz(a)) - (pz(b) - pz(a)) * (px(c) - px(a))) / 2;
      ax += ((px(a) + px(b) + px(c)) / 3) * ar;
      az += ((pz(a) + pz(b) + pz(c)) / 3) * ar;
      area += ar;
    }
    const cx = ax / area, cz = az / area, cy = 0.05;

    const pos: number[] = [], uv: number[] = [], kind: number[] = [], edge: number[] = [], ct: number[] = [], orig: number[] = [];
    const surfIdx: number[] = [], wallIdx: number[] = [];
    const topMap = new Map<number, number>();
    const botMap = new Map<number, number>();
    const addV = (x: number, y: number, z: number, k: number, e: number, c: number, wu?: number, wv?: number) => {
      pos.push(x - cx, y - cy, z - cz);
      if (wu !== undefined) uv.push(wu, wv ?? 0);
      else uv.push(0.5 + x / (2 * E), 0.5 + z / (2 * E));
      kind.push(k);
      edge.push(e);
      ct.push(c);
      orig.push(x, y, z);
      return pos.length / 3 - 1;
    };
    const topV = (v: number) => {
      let i = topMap.get(v);
      if (i === undefined) {
        i = addV(px(v), topY[v], pz(v), 0, crackT[v] < 8 ? 0 : 1, nearT[v]);
        topMap.set(v, i);
      }
      return i;
    };
    const botV = (v: number) => {
      let i = botMap.get(v);
      if (i === undefined) {
        i = addV(px(v), botY[v], pz(v), 1, 1, 9);
        botMap.set(v, i);
      }
      return i;
    };

    const crackEdges: [number, number, number][] = []; // a, b, terceiro vértice
    for (const t of list) {
      let a = tris[t * 3], b = tris[t * 3 + 1], c = tris[t * 3 + 2];
      // orientação: normal do topo para +Y
      const cross = (pz(b) - pz(a)) * (px(c) - px(a)) - (px(b) - px(a)) * (pz(c) - pz(a));
      if (cross < 0) [b, c] = [c, b];
      surfIdx.push(topV(a), topV(b), topV(c));
      surfIdx.push(botV(a), botV(c), botV(b));
      for (let k = 0; k < 3; k++) {
        const e = t * 3 + k;
        const opp = half[e];
        if (opp < 0) continue;
        const t2 = Math.floor(opp / 3);
        if (!valid[t2] || piece[t2] === id) continue;
        const v0 = tris[e], v1 = tris[next(e)];
        const third = tris[t * 3] + tris[t * 3 + 1] + tris[t * 3 + 2] - v0 - v1;
        crackEdges.push([v0, v1, third]);
      }
    }

    // Comprimento acumulado ao longo das rachaduras deste pedaço → UV contínua do miolo
    const chainAdj = new Map<number, number[]>();
    for (const [v0, v1] of crackEdges) {
      if (!chainAdj.has(v0)) chainAdj.set(v0, []);
      if (!chainAdj.has(v1)) chainAdj.set(v1, []);
      chainAdj.get(v0)!.push(v1);
      chainAdj.get(v1)!.push(v0);
    }
    const arcU = new Map<number, number>();
    const starts = [...chainAdj.keys()].sort((a, b) => (chainAdj.get(a)!.length === 2 ? 1 : 0) - (chainAdj.get(b)!.length === 2 ? 1 : 0));
    for (const s0 of starts) {
      if (arcU.has(s0)) continue;
      arcU.set(s0, rnd() * 3);
      const stack = [s0];
      while (stack.length) {
        const c = stack.pop()!;
        const uc = arcU.get(c)!;
        for (const n of chainAdj.get(c)!) {
          if (arcU.has(n)) continue;
          arcU.set(n, uc + Math.hypot(px(n) - px(c), pz(n) - pz(c)));
          stack.push(n);
        }
      }
    }

    // Paredes da quebra (com relevo irregular de massa partida)
    const R = o.wallRows;
    const wallMap = new Map<string, number>();
    const wallV = (v: number, r: number) => {
      const key = `${v}:${r}`;
      let i = wallMap.get(key);
      if (i !== undefined) return i;
      const t = r / R;
      let x = px(v), z = pz(v);
      const y = topY[v] + (botY[v] - topY[v]) * t;
      if (r > 0 && r < R) {
        let dx = x - cx, dz = z - cz;
        const l = Math.hypot(dx, dz) || 1;
        dx /= l; dz /= l;
        // relevo orgânico de massa partida: ondulação larga + granulado fino (sem padrão regular)
        const amt =
          Math.sin(Math.PI * t) * (0.011 * noise.fbm3(x * 4.5, t * 1.6, z * 4.5, 2) + 0.0018 * noise.noise3(x * 31 + t * 7, t * 5, z * 31));
        x += dx * amt;
        z += dz * amt;
      }
      i = addV(x, y, z, 2, t, 9, (arcU.get(v) ?? 0) * 0.45, 0.06 + (1 - t) * 0.88);
      wallMap.set(key, i);
      return i;
    };
    const edgePoints: { p: THREE.Vector3; t: number }[] = [];
    for (const [v0, v1, third] of crackEdges) {
      // normal para fora do pedaço
      const ex = px(v1) - px(v0), ez = pz(v1) - pz(v0);
      let nx = -ez, nz = ex;
      const mx = (px(v0) + px(v1)) / 2, mz = (pz(v0) + pz(v1)) / 2;
      if (nx * (px(third) - mx) + nz * (pz(third) - mz) > 0) { nx = -nx; nz = -nz; }
      for (let r = 0; r < R; r++) {
        const a0i = wallV(v0, r), a1i = wallV(v0, r + 1), b0i = wallV(v1, r), b1i = wallV(v1, r + 1);
        // checa orientação com a normal esperada
        const ax0 = pos[a0i * 3], ay0 = pos[a0i * 3 + 1], az0 = pos[a0i * 3 + 2];
        const ux = pos[b0i * 3] - ax0, uy = pos[b0i * 3 + 1] - ay0, uz = pos[b0i * 3 + 2] - az0;
        const vx = pos[a1i * 3] - ax0, vy = pos[a1i * 3 + 1] - ay0, vz = pos[a1i * 3 + 2] - az0;
        const fnx = uy * vz - uz * vy, fnz = ux * vy - uy * vx;
        if (fnx * nx + fnz * nz >= 0) wallIdx.push(a0i, b0i, b1i, a0i, b1i, a1i);
        else wallIdx.push(a0i, b1i, b0i, a0i, a1i, b1i);
      }
      if (edgePoints.length < 48 && rnd() < 0.6) {
        const f = rnd();
        const ex2 = px(v0) + ex * f, ez2 = pz(v0) + ez * f;
        const yy = THREE.MathUtils.lerp(botY[v0], topY[v0], 0.25 + rnd() * 0.75);
        edgePoints.push({ p: new THREE.Vector3(ex2, yy, ez2), t: Math.min(crackT[v0], crackT[v1]) });
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
    g.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
    g.setAttribute('aCrackT', new THREE.Float32BufferAttribute(ct, 1));
    g.setAttribute('aOrig', new THREE.Float32BufferAttribute(orig, 3));
    g.setIndex([...surfIdx, ...wallIdx]);
    g.addGroup(0, surfIdx.length, 0);
    g.addGroup(surfIdx.length, wallIdx.length, 1);
    g.computeVertexNormals();
    g.computeBoundingSphere();

    let crackStart = 1;
    topMap.forEach((_, v) => { if (crackT[v] < 8) crackStart = Math.min(crackStart, crackT[v]); });
    const ox = cx - ix, oz = cz - iz;
    const ol = Math.hypot(ox, oz) || 1;
    shards.push({
      geometry: g,
      centroid: new THREE.Vector3(cx, cy, cz),
      area,
      big: area > 0.22,
      crackStart,
      outward: new THREE.Vector2(ox / ol, oz / ol),
      edgePoints,
      distToImpact: ol,
    });
  });

  // Amostra da rede de rachaduras (migalhas que pulam enquanto racha)
  const crackPoints: { p: THREE.Vector3; t: number }[] = [];
  const keys = [...crackDist.keys()];
  for (let i = 0; i < keys.length; i += Math.max(1, Math.floor(keys.length / 160))) {
    const v = keys[i];
    crackPoints.push({ p: new THREE.Vector3(px(v), topY[v] - 0.01, pz(v)), t: crackT[v] });
  }

  return { shards, crackPoints };
}
