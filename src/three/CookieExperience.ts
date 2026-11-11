/**
 * Cena 3D da MOKKI: o cookie (foto real) racha a partir de um ponto de
 * pressão, as rachaduras correm pela superfície e ele se desfaz em pedaços,
 * lascas e migalhas — tudo derivado de um único progresso (0..1) do scroll,
 * portanto 100% reversível.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildFracture, type Shard } from './fracture';
import { clamp, smoothstep, lerp, mulberry32, createNoise } from '../lib/procedural/noise.js';

const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t;

/** Janelas da história (progresso global do scroll). */
const CRACK = [0.07, 0.36] as const;
const BREAK = [0.3, 0.9] as const;
const EXIT = [0.8, 1] as const;

interface Story {
  intro: number;
  crack: number;
  brk: number;
  exit: number;
  floatAmp: number;
  dist: number;
  yaw: number;
  pitch: number;
  shake: number;
}

function storyAt(p: number): Story {
  const intro = easeInOut(seg(p, 0, 0.14));
  const crack = seg(p, CRACK[0], CRACK[1]);
  const brk = seg(p, BREAK[0], BREAK[1]);
  const exit = seg(p, EXIT[0], EXIT[1]);
  const brkE = easeInOut(brk);
  return {
    intro,
    crack,
    brk,
    exit,
    floatAmp: 1 - intro,
    dist: lerp(1, 0.84, intro) - 0.05 * easeInOut(crack) + 0.2 * brkE + 0.05 * easeIn(exit),
    yaw: 0.3 * brkE,
    pitch: -0.1 * brkE,
    shake: Math.sin(Math.PI * crack) * (1 - brk),
  };
}

interface ShardMotion {
  shard: Shard;
  group: THREE.Group;
  surfMat: THREE.MeshStandardMaterial;
  uOpen: { value: number };
  release: number;
  vel: THREE.Vector3;
  gravity: number;
  spinAxis: THREE.Vector3;
  spin: number;
  bendAxis: THREE.Vector3;
}

interface Particle {
  origin: THREE.Vector3;
  vel: THREE.Vector3;
  emit: number;
  dur: number;
  gravity: number;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  size: THREE.Vector3;
}

export interface ExperienceOptions {
  canvas: HTMLCanvasElement;
  lowPower?: boolean;
  fill?: number;
}

export class CookieExperience {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
  readonly ready: Promise<void>;
  private orient = new THREE.Group();
  private stage = new THREE.Group();
  private cookie = new THREE.Group();
  private motions: ShardMotion[] = [];
  private crumbs: THREE.InstancedMesh | null = null;
  private crumbData: Particle[] = [];
  private dust: THREE.Points | null = null;
  private dustBase = new Float32Array(0);
  private key: THREE.DirectionalLight;
  private shared = {
    uCrack: { value: 0 },
    uCrackDark: { value: new THREE.Color('#24130a') },
    uLip: { value: new THREE.Color('#e7c189') },
    uBottom: { value: new THREE.Color('#ad6a32') },
    uCrumbMap: { value: null as THREE.Texture | null },
  };
  private topMap = { value: null as THREE.Texture | null };
  private wallMat: THREE.MeshStandardMaterial;
  private low: boolean;
  private fill: number;
  private baseDist = 7;
  private portrait = false;
  private viewW = 1;
  private viewH = 1;
  private shift = { x: 0, y: 0 };
  private target = 0;
  private progress = 0;
  private pointer = new THREE.Vector2();
  private pointerSmooth = new THREE.Vector2();
  private t0 = performance.now();
  private last = performance.now();
  private wiggleAt = -10;
  private running = false;
  private raf = 0;
  private tmp = {
    v: new THREE.Vector3(),
    q: new THREE.Quaternion(),
    q2: new THREE.Quaternion(),
    e: new THREE.Euler(),
    m: new THREE.Matrix4(),
    s: new THREE.Vector3(),
    g: new THREE.Vector3(),
  };

  constructor(private opts: ExperienceOptions) {
    this.low = !!opts.lowPower;
    this.fill = opts.fill ?? 0.56;
    this.renderer = new THREE.WebGLRenderer({
      canvas: opts.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.low ? 1.5 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = this.low ? THREE.PCFSoftShadowMap : THREE.VSMShadowMap;

    // Luz de estúdio + ambiente para reflexos suaves
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.32;
    pmrem.dispose();
    this.key = new THREE.DirectionalLight('#fff6ec', 1.15);
    this.key.position.set(-1.5, 2.3, 6.2);
    this.key.castShadow = true;
    const sc = this.key.shadow;
    sc.mapSize.setScalar(this.low ? 1024 : 2048);
    sc.camera.left = -3.4;
    sc.camera.right = 3.4;
    sc.camera.top = 3.4;
    sc.camera.bottom = -3.4;
    sc.camera.near = 0.5;
    sc.camera.far = 16;
    sc.bias = -0.0004;
    sc.normalBias = 0.02;
    sc.radius = 14;
    sc.blurSamples = 20;
    const rim = new THREE.DirectionalLight('#e6f3ff', 1.3);
    rim.position.set(3.5, 2.5, -4);
    const kick = new THREE.DirectionalLight('#ffe2c4', 0.35);
    kick.position.set(4, -1.5, 3);
    const hemi = new THREE.HemisphereLight('#ffffff', '#b4c9d3', 0.42);
    this.scene.add(this.key, this.key.target, rim, kick, hemi);

    // Fundo invisível que só recebe sombras (profundidade real)
    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.ShadowMaterial({ color: '#2f2430', opacity: 0.16 }),
    );
    backdrop.position.z = -1.1;
    backdrop.receiveShadow = true;
    this.scene.add(backdrop);

    this.stage.add(this.cookie);
    this.orient.add(this.stage);
    this.scene.add(this.orient);

    this.wallMat = this.makeWallMaterial();
    this.resize();
    this.ready = this.build();
  }

  /* ------------------------------------------------------------------ */
  /* Materiais                                                           */
  /* ------------------------------------------------------------------ */
  private makeSurfaceMaterial(uOpen: { value: number }) {
    const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, envMapIntensity: 0.55 });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.shared, { uOpen });
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute float aKind;\nattribute float aEdge;\nattribute float aCrackT;\nattribute vec3 aOrig;\nvarying float vKind;\nvarying float vEdge;\nvarying float vCrackT;\nvarying vec3 vObjN;\nvarying vec3 vOrig;',
        )
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvKind = aKind;\nvEdge = aEdge;\nvCrackT = aCrackT;\nvObjN = normal;\nvOrig = aOrig;',
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uCrack;\nuniform float uOpen;\nuniform vec3 uCrackDark;\nuniform vec3 uLip;\nuniform vec3 uBottom;\nuniform sampler2D uCrumbMap;\nvarying float vKind;\nvarying float vEdge;\nvarying float vCrackT;\nvarying vec3 vObjN;\nvarying vec3 vOrig;',
        )
        .replace(
          '#include <map_fragment>',
          /* glsl */ `#include <map_fragment>
          float isBottom = step(0.5, vKind);
          float topSide = 1.0 - isBottom;
          // Lateral externa: crosta REAL da foto (faixa da borda), sem esticar
          float side = smoothstep(0.45, 0.8, 1.0 - abs(normalize(vObjN).y)) * topSide;
          vec2 pin = vOrig.xz * (0.9 - clamp(vOrig.y, 0.0, 0.2) * 0.25);
          vec3 crustC = texture2D(map, 0.5 + pin / 2.24).rgb * 0.88;
          diffuseColor.rgb = mix(diffuseColor.rgb, crustC, side);
          // Base: tostada, com os poros da massa
          vec3 crumbC = texture2D(uCrumbMap, vOrig.xz * vec2(0.5, 1.4) + 0.5).rgb;
          float cl = dot(crumbC, vec3(0.299, 0.587, 0.114));
          vec3 bottomC = uBottom * (0.55 + 0.9 * cl);
          diffuseColor.rgb = mix(diffuseColor.rgb, bottomC, isBottom);
          // Rachadura chegando: fenda escura fina + sombra ao redor
          float arrived = smoothstep(vCrackT - 0.035, vCrackT, uCrack);
          float age = clamp((uCrack - vCrackT) * 3.0, 0.0, 1.0);
          float w = mix(0.1, 0.22, age);
          float core = (1.0 - smoothstep(w * 0.35, w, vEdge)) * arrived;
          float halo = (1.0 - smoothstep(0.0, 0.6, vEdge)) * arrived;
          diffuseColor.rgb *= 1.0 - halo * 0.18 * topSide * (1.0 - uOpen * 0.7);
          diffuseColor.rgb = mix(diffuseColor.rgb, uCrackDark, core * 0.9 * topSide * (1.0 - uOpen));
          // Depois de solto: crosta partida mais clara na quina da quebra
          diffuseColor.rgb = mix(diffuseColor.rgb, uLip, (1.0 - smoothstep(0.0, 0.3, vEdge)) * uOpen * 0.4 * topSide * arrived);`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.88, step(0.5, vKind));',
        );
    };
    mat.customProgramCacheKey = () => 'mokki-shard-surface';
    return mat;
  }

  private makeWallMaterial() {
    const mat = new THREE.MeshStandardMaterial({ color: '#fff3e2', roughness: 0.9, metalness: 0, envMapIntensity: 0.4 });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, { uTopMap: this.topMap });
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aEdge;\nattribute vec3 aOrig;\nvarying float vDepth;\nvarying vec3 vOrig;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDepth = aEdge;\nvOrig = aOrig;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          /* glsl */ `#include <common>
          uniform sampler2D uTopMap;
          varying float vDepth;
          varying vec3 vOrig;
          float mkHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
          float mkNoise(vec3 x) {
            vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(mix(mkHash(i), mkHash(i + vec3(1,0,0)), f.x), mix(mkHash(i + vec3(0,1,0)), mkHash(i + vec3(1,1,0)), f.x), f.y),
                       mix(mix(mkHash(i + vec3(0,0,1)), mkHash(i + vec3(1,0,1)), f.x), mix(mkHash(i + vec3(0,1,1)), mkHash(i + vec3(1,1,1)), f.x), f.y), f.z);
          }`,
        )
        .replace(
          '#include <map_fragment>',
          /* glsl */ `#include <map_fragment>
          // Pedaços de chocolate da superfície continuam para dentro da quebra
          vec3 topC = texture2D(uTopMap, 0.5 + vOrig.xz / 2.24).rgb;
          float tl = dot(topC, vec3(0.299, 0.587, 0.114));
          float depthLimit = 0.42 + 0.22 * mkNoise(vOrig * 14.0);
          float choco = (1.0 - smoothstep(0.09, 0.17, tl)) * (1.0 - smoothstep(depthLimit - 0.12, depthLimit, vDepth));
          // Gotas de chocolate escondidas no miolo
          float n = mkNoise(vOrig * vec3(16.0, 22.0, 16.0)) * 0.7 + mkNoise(vOrig * 41.0) * 0.3;
          float inner = smoothstep(0.72, 0.78, n) * smoothstep(0.08, 0.2, vDepth) * (1.0 - smoothstep(0.85, 0.95, vDepth));
          vec3 chocC = mix(vec3(0.075, 0.032, 0.016), topC * 0.85, step(0.01, choco) * 0.6);
          float chocoMask = max(choco, inner);
          diffuseColor.rgb = mix(diffuseColor.rgb, chocC, chocoMask);
          // Oclusão: o meio da parede fica mais escuro (profundidade da quebra)
          diffuseColor.rgb *= 0.74 + 0.26 * abs(vDepth * 2.0 - 1.0);`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.42, chocoMask);',
        );
    };
    mat.customProgramCacheKey = () => 'mokki-shard-wall';
    return mat;
  }

  /* ------------------------------------------------------------------ */
  /* Montagem                                                            */
  /* ------------------------------------------------------------------ */
  private async build() {
    const loader = new THREE.TextureLoader();
    const sm = this.low ? '-sm' : '';
    const aniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const load = async (url: string, color: boolean, repeat = false) => {
      const t = await loader.loadAsync(url);
      t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = aniso;
      t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
      return t;
    };
    const [map, normal, rough, crumb, crumbNormal] = await Promise.all([
      load(`/textures/photo-top${sm}.webp`, true),
      load(`/textures/photo-normal${sm}.webp`, false),
      load(`/textures/photo-rough${sm}.webp`, false),
      load('/textures/crumb-photo.webp', true, true),
      load('/textures/crumb-photo-normal.webp', false, true),
    ]);
    this.topMap.value = map;
    this.shared.uCrumbMap.value = crumb;
    this.wallMat.map = crumb;
    this.wallMat.normalMap = crumbNormal;
    this.wallMat.normalScale.set(0.8, 0.8);
    this.wallMat.needsUpdate = true;

    const { shards, crackPoints } = buildFracture({
      spacing: this.low ? 0.032 : 0.021,
      bigPieces: 5,
      chips: this.low ? 6 : 9,
      wallRows: this.low ? 3 : 4,
      seed: 20251111,
      impact: [0.06, -0.04],
    });

    const rnd = mulberry32(77);
    const bigs = shards.filter((s) => s.big).sort((a, b) => a.crackStart - b.crackStart);
    shards.forEach((shard) => {
      const uOpen = { value: 0 };
      const surfMat = this.makeSurfaceMaterial(uOpen);
      surfMat.map = map;
      surfMat.normalMap = normal;
      surfMat.normalScale.set(0.45, 0.45);
      surfMat.roughnessMap = rough;
      const mesh = new THREE.Mesh(shard.geometry, [surfMat, this.wallMat]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const group = new THREE.Group();
      group.position.copy(shard.centroid);
      group.add(mesh);
      this.cookie.add(group);

      const out = new THREE.Vector3(shard.outward.x, 0, shard.outward.y);
      const big = shard.big;
      const order = big ? bigs.indexOf(shard) / Math.max(1, bigs.length - 1) : 0;
      const release = big ? 0.16 + order * 0.24 + rnd() * 0.06 : 0.02 + shard.crackStart * 0.3 + rnd() * 0.12;
      const speed = big ? 0.22 + rnd() * 0.16 : 0.5 + rnd() * 0.55;
      // big: uns vêm para a câmera, outros recuam → profundidade; lascas pulam e caem
      const depth = big ? (rnd() - 0.35) * 0.5 : 0.15 + rnd() * 0.45;
      const vel = out
        .clone()
        .multiplyScalar(speed)
        .add(new THREE.Vector3((rnd() - 0.5) * 0.2, depth, (rnd() - 0.5) * 0.2));
      const tangent = new THREE.Vector3(-out.z, 0, out.x);
      const spinAxis = tangent
        .clone()
        .multiplyScalar(big ? 1 : 0.5)
        .add(new THREE.Vector3(rnd() - 0.5, (rnd() - 0.5) * (big ? 0.4 : 1.2), rnd() - 0.5))
        .normalize();
      this.motions.push({
        shard,
        group,
        surfMat,
        uOpen,
        release: Math.min(0.7, release),
        vel,
        gravity: big ? 0.3 : 1.9,
        spinAxis,
        spin: (big ? 0.35 + rnd() * 0.45 : 2 + rnd() * 4) * (rnd() < 0.5 ? -1 : 1),
        bendAxis: tangent,
      });
    });

    this.buildCrumbs(crackPoints);
    this.buildDust();
    this.update(0, 0);
  }

  private buildCrumbs(crackPoints: { p: THREE.Vector3; t: number }[]) {
    const n3 = createNoise(99);
    let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 1);
    geo.deleteAttribute('uv');
    geo.deleteAttribute('normal');
    geo = mergeVertices(geo);
    const gp = geo.getAttribute('position') as THREE.BufferAttribute;
    const tv = new THREE.Vector3();
    for (let i = 0; i < gp.count; i++) {
      tv.fromBufferAttribute(gp, i);
      tv.multiplyScalar(1 + 0.38 * n3.noise3(tv.x * 1.6 + 1.3, tv.y * 1.6, tv.z * 1.6));
      gp.setXYZ(i, tv.x, tv.y * 0.7, tv.z);
    }
    geo.computeVertexNormals();

    const rnd = mulberry32(5150);
    const crackCount = this.low ? 40 : 80;
    const breakCount = this.low ? 110 : 230;
    const data: Particle[] = [];
    // Migalhas que pulam enquanto a rachadura corre
    for (let i = 0; i < crackCount && crackPoints.length; i++) {
      const cp = crackPoints[Math.floor(rnd() * crackPoints.length)];
      data.push({
        origin: cp.p.clone(),
        vel: new THREE.Vector3((rnd() - 0.5) * 0.4, 0.1 + rnd() * 0.35, (rnd() - 0.5) * 0.4),
        emit: CRACK[0] + (CRACK[1] - CRACK[0]) * cp.t + rnd() * 0.02,
        dur: 0.22 + rnd() * 0.12,
        gravity: 1.6,
        rot: new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6),
        spin: new THREE.Vector3((rnd() - 0.5) * 9, (rnd() - 0.5) * 9, (rnd() - 0.5) * 9),
        size: new THREE.Vector3(1, 1, 1).multiplyScalar(0.004 + Math.pow(rnd(), 2) * 0.01),
      });
    }
    // Migalhas que se soltam junto com os pedaços
    for (let i = 0; i < breakCount; i++) {
      const mo = this.motions[Math.floor(rnd() * this.motions.length)];
      const ep = mo?.shard.edgePoints[Math.floor(rnd() * mo.shard.edgePoints.length)];
      if (!ep) continue;
      const out = new THREE.Vector3(mo.shard.outward.x, 0, mo.shard.outward.y);
      data.push({
        origin: ep.p.clone(),
        vel: out
          .multiplyScalar((rnd() - 0.2) * 1.4)
          .add(new THREE.Vector3((rnd() - 0.5) * 1.0, 0.1 + rnd() * 0.7, (rnd() - 0.5) * 1.0)),
        emit: BREAK[0] + (BREAK[1] - BREAK[0]) * mo.release + rnd() * 0.06,
        dur: 0.32 + rnd() * 0.3,
        gravity: 1.5 + rnd() * 0.8,
        rot: new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6),
        spin: new THREE.Vector3((rnd() - 0.5) * 12, (rnd() - 0.5) * 12, (rnd() - 0.5) * 12),
        size: new THREE.Vector3(1, 0.8 + rnd() * 0.4, 1).multiplyScalar(0.005 + Math.pow(rnd(), 2.2) * 0.03),
      });
    }
    this.crumbData = data;
    const crumbs = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 }), data.length);
    crumbs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    crumbs.frustumCulled = false;
    crumbs.castShadow = !this.low;
    const color = new THREE.Color();
    const palette = ['#d9a25c', '#c98c47', '#e6bb7c', '#b97535', '#d6a066', '#4a2a1b'];
    data.forEach((_, i) => {
      color.set(palette[i % 11 === 0 ? 5 : Math.floor(rnd() * 5)]);
      crumbs.setColorAt(i, color);
    });
    this.crumbs = crumbs;
    this.cookie.add(crumbs);
  }

  private buildDust() {
    const count = this.low ? 70 : 170;
    const rnd = mulberry32(31);
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 0.4 + rnd() * 1.6;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = (rnd() - 0.2) * 1.4;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    this.dustBase = pos.slice();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,240,210,1)');
    grad.addColorStop(0.4, 'rgba(240,205,150,0.6)');
    grad.addColorStop(1, 'rgba(240,205,150,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.PointsMaterial({
      map: tex,
      size: 0.035,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      sizeAttenuation: true,
      color: '#f3d9ab',
    });
    this.dust = new THREE.Points(g, mat);
    this.dust.frustumCulled = false;
    this.cookie.add(this.dust);
  }

  /* ------------------------------------------------------------------ */
  /* API pública                                                         */
  /* ------------------------------------------------------------------ */
  resize() {
    const c = this.opts.canvas;
    const w = c.clientWidth || 1;
    const h = c.clientHeight || 1;
    this.viewW = w;
    this.viewH = h;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;
    this.portrait = aspect < 0.85;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const diameter = 2.1;
    const byHeight = diameter / (this.fill * 2 * tanHalf);
    const byWidth = diameter / ((this.portrait ? 0.72 : 0.7) * 2 * tanHalf * aspect);
    this.baseDist = Math.max(byHeight, byWidth);
    this.camera.updateProjectionMatrix();
  }

  setShift(x: number, y: number) {
    this.shift.x = x;
    this.shift.y = y;
  }

  setProgress(p: number) {
    this.target = clamp(p);
  }

  setPointer(x: number, y: number) {
    this.pointer.set(clamp(x, -1, 1), clamp(y, -1, 1));
  }

  wiggle() {
    this.wiggleAt = this.elapsed();
  }

  private elapsed() {
    return (performance.now() - this.t0) / 1000;
  }

  /* ------------------------------------------------------------------ */
  /* Quadro a quadro                                                     */
  /* ------------------------------------------------------------------ */
  private update(time: number, dt: number) {
    // Suaviza o progresso (movimento "amanteigado" mesmo com rodinha do mouse)
    const k = dt > 0 ? 1 - Math.exp(-dt * 7) : 1;
    this.progress += (this.target - this.progress) * k;
    if (Math.abs(this.target - this.progress) < 1e-5) this.progress = this.target;
    const p = this.progress;
    const s = storyAt(p);
    const { v, q, q2, e, m, s: sc, g } = this.tmp;

    // Ponteiro: influência diminui conforme a história avança
    this.pointerSmooth.lerp(this.pointer, 0.06);
    const pInf = 1 - 0.7 * s.intro;
    this.orient.rotation.set(
      -this.pointerSmooth.y * 0.12 * pInf,
      this.pointerSmooth.x * 0.18 * pInf,
      this.portrait ? Math.PI / 2 : 0,
    );

    const wt = time - this.wiggleAt;
    const wiggle = wt >= 0 && wt < 1.6 ? Math.exp(-wt * 3.2) * Math.sin(wt * 24) * 0.09 : 0;
    const shake = s.shake * (Math.sin(time * 61) * 0.5 + Math.sin(time * 37) * 0.5) * 0.007;
    const bob = Math.sin(time * 1.15) * 0.07 * s.floatAmp;
    this.stage.position.set(0, bob, 0);
    this.stage.rotation.set(
      Math.PI / 2 - lerp(0.32, 0.2, s.intro) + Math.sin(time * 0.8) * 0.04 * s.floatAmp + shake,
      Math.sin(time * 0.5) * 0.1 * s.floatAmp,
      Math.sin(time * 0.65) * 0.05 * s.floatAmp + wiggle + shake * 0.6,
      'XZY',
    );
    this.stage.updateMatrixWorld(true);

    // Gravidade (mundo → espaço do cookie)
    this.cookie.getWorldQuaternion(q2);
    g.set(0, -1, 0).applyQuaternion(q2.invert());

    this.shared.uCrack.value = easeInOut(s.crack) * 1.04;
    const ex = easeIn(s.exit);

    for (const mo of this.motions) {
      const sh = mo.shard;
      // Fendas abrindo enquanto racha (pedaços cedem e se afastam um tiquinho)
      const open = smoothstep(sh.crackStart * 0.95, sh.crackStart * 0.95 + 0.3, s.crack);
      const press = Math.max(0, 1 - sh.distToImpact / 0.35);
      // Voo depois de soltar
      const tau = clamp((s.brk - mo.release) / (1 - mo.release));
      const fly = tau * 0.55 + 0.45 * easeOut(tau);
      mo.uOpen.value = smoothstep(0, 0.12, tau);

      v.set(sh.outward.x, 0, sh.outward.y).multiplyScalar(0.012 * open + ex * 2.8);
      v.y -= press * 0.012 * open;
      v.addScaledVector(mo.vel, fly);
      v.addScaledVector(g, tau * tau * mo.gravity * 0.5 + ex * 1.1);
      mo.group.position.copy(sh.centroid).add(v);

      q.setFromAxisAngle(mo.bendAxis, -0.035 * open * (sh.big ? 1 : 0.5));
      q2.setFromAxisAngle(mo.spinAxis, mo.spin * (fly + ex * 0.5));
      mo.group.quaternion.copy(q2.multiply(q));
    }

    // Migalhas (determinísticas → reversíveis)
    if (this.crumbs) {
      const data = this.crumbData;
      const fade = 1 - smoothstep(0.4, 1, s.exit);
      for (let i = 0; i < data.length; i++) {
        const d = data[i];
        const lt = (p - d.emit) / d.dur;
        if (lt <= 0) {
          sc.setScalar(0.00001);
          m.compose(d.origin, q.identity(), sc);
        } else {
          const t = Math.min(lt, 3);
          v.copy(d.origin).addScaledVector(d.vel, t * 0.9).addScaledVector(g, t * t * 0.5 * d.gravity);
          e.set(d.rot.x + d.spin.x * t * 0.3, d.rot.y + d.spin.y * t * 0.3, d.rot.z + d.spin.z * t * 0.3);
          q.setFromEuler(e);
          sc.copy(d.size).multiplyScalar(Math.max(smoothstep(0, 0.08, lt) * fade, 0.00001));
          m.compose(v, q, sc);
        }
        this.crumbs.setMatrixAt(i, m);
      }
      this.crumbs.instanceMatrix.needsUpdate = true;
    }

    // Poeira dourada no ar
    if (this.dust) {
      const dustA = smoothstep(0.02, 0.2, s.brk) * (1 - smoothstep(0.3, 1, s.exit));
      (this.dust.material as THREE.PointsMaterial).opacity = 0.55 * dustA;
      this.dust.visible = dustA > 0.001;
      if (this.dust.visible) {
        const pos = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
        const arr = pos.array as Float32Array;
        const b = this.dustBase;
        for (let i = 0; i < arr.length; i += 3) {
          const ph = i * 0.37;
          arr[i] = b[i] * (0.7 + 0.5 * s.brk) + Math.sin(time * 0.3 + ph) * 0.04;
          arr[i + 1] = b[i + 1] + s.brk * 0.5 + Math.sin(time * 0.4 + ph * 1.3) * 0.05;
          arr[i + 2] = b[i + 2] * (0.7 + 0.5 * s.brk) + Math.cos(time * 0.35 + ph) * 0.04;
        }
        pos.needsUpdate = true;
      }
    }

    // Câmera: aproxima no estalo e gira de leve na quebra (parallax real)
    const dist = this.baseDist * s.dist;
    const yaw = s.yaw * (this.portrait ? 0.6 : 1);
    this.camera.position.set(
      Math.sin(yaw) * Math.cos(s.pitch) * dist,
      Math.sin(s.pitch) * dist,
      Math.cos(yaw) * Math.cos(s.pitch) * dist,
    );
    this.camera.lookAt(0, 0, 0);
    const kshift = s.floatAmp;
    if (kshift > 0.001 && (this.shift.x || this.shift.y)) {
      this.camera.setViewOffset(
        this.viewW,
        this.viewH,
        -this.shift.x * this.viewW * kshift,
        -this.shift.y * this.viewH * kshift,
        this.viewW,
        this.viewH,
      );
    } else if (this.camera.view?.enabled) {
      this.camera.clearViewOffset();
    }
  }

  renderFrame() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.update(this.elapsed(), dt);
    this.renderer.render(this.scene, this.camera);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = () => {
      if (!this.running) return;
      this.renderFrame();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  dispose() {
    this.stop();
    this.motions.forEach((mo) => {
      mo.shard.geometry.dispose();
      mo.surfMat.dispose();
    });
    this.wallMat.dispose();
    this.crumbs?.geometry.dispose();
    this.dust?.geometry.dispose();
    this.renderer.dispose();
  }
}
