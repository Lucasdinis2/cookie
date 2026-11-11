/**
 * Cena principal: o cookie que se quebra com a rolagem.
 * O ScrollTrigger controla um único progresso (0..1) que alimenta a cena 3D
 * e as animações de texto — tudo reversível ao rolar para cima.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { reducedMotion, finePointer, lenis, scrollToTarget } from './scroll';
import type { CookieExperience } from '../three/CookieExperience';

const isMobile = () => window.matchMedia('(max-width: 768px), (max-aspect-ratio: 4/5)').matches;

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function lowPowerDevice() {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return (
    isMobile() ||
    (nav.hardwareConcurrency ?? 8) <= 4 ||
    (nav.deviceMemory ?? 8) <= 4
  );
}

export function initHero(): { play: () => void } {
  const hero = document.querySelector<HTMLElement>('[data-hero]');
  const stage = document.querySelector<HTMLElement>('[data-hero-stage]');
  const canvas = document.querySelector<HTMLCanvasElement>('[data-hero-canvas]');
  const noop = { play: () => scrollToTarget('#sabores') };
  if (!hero || !stage || !canvas) return noop;

  // Entrada da cena 1 (logo/título com máscara).
  const lines = hero.querySelectorAll('[data-hero-line]');
  const anims = hero.querySelectorAll('[data-hero-anim]');
  if (!reducedMotion) {
    gsap.from(lines, { yPercent: 110, duration: 1.1, ease: 'power4.out', stagger: 0.09, delay: 0.15 });
    gsap.from(anims, { y: 24, opacity: 0, duration: 0.9, ease: 'power3.out', stagger: 0.1, delay: 0.45 });
  }

  const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
  const can3D = !reducedMotion && webglAvailable() && !nav.connection?.saveData;
  if (!can3D) return noop;

  // ---------- Linha do tempo controlada pelo scroll ----------
  const proxy = { p: 0 };
  let xp: CookieExperience | null = null;
  const mobile = isMobile();

  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: hero,
      start: 'top top',
      end: () => `+=${Math.round(window.innerHeight * (mobile ? 1.9 : 2.3))}`,
      pin: stage,
      scrub: mobile ? 0.4 : 0.6,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onUpdate: (self) => updateProgressUI(self.progress),
    },
  });
  tl.to(proxy, { p: 1, duration: 1, onUpdate: () => xp?.setProgress(proxy.p) }, 0);

  // Cena 1 → sai o texto, entra a "câmera"
  tl.fromTo('[data-hero-intro] .mask-line > span', { yPercent: 0 }, { yPercent: -110, duration: 0.12, stagger: 0.012, immediateRender: false }, 0.02)
    .fromTo('[data-hero-anim]', { y: 0, opacity: 1 }, { y: -30, opacity: 0, duration: 0.1, stagger: 0.01, immediateRender: false }, 0)
    .to('[data-hero-hint]', { opacity: 0, duration: 0.05 }, 0)
    .to('[data-hero-progress]', { opacity: 1, duration: 0.06 }, 0.06)
    .set('[data-hero-intro]', { visibility: 'hidden' }, 0.17);

  // Cena 4 → "Por fora, irresistível. Por dentro, ainda melhor."
  tl.set('[data-hero-reveal]', { visibility: 'visible' }, 0.5)
    .fromTo('[data-reveal-line]', { yPercent: 115 }, { yPercent: 0, duration: 0.1, stagger: 0.025, ease: 'power2.out', immediateRender: true }, 0.54)
    .to('[data-reveal-line]', { yPercent: -115, duration: 0.07, stagger: 0.012, ease: 'power2.in' }, 0.74)
    .set('[data-hero-reveal]', { visibility: 'hidden' }, 0.97);

  // Cena 5 → fundo vira creme e a seção de sabores assume
  tl.to('[data-hero-bg]', { backgroundColor: '#FFF0BD', duration: 0.18 }, 0.8)
    .to('[data-hero-bg] .hero__glow', { opacity: 0, duration: 0.15 }, 0.8)
    .to('[data-hero-progress]', { opacity: 0, duration: 0.06 }, 0.92);

  const steps = [...document.querySelectorAll<HTMLElement>('[data-hero-progress] li')];
  const fill = document.querySelector<HTMLElement>('[data-hero-progress-fill]');
  const stops = [0, 0.07, 0.34, 0.82];
  function updateProgressUI(p: number) {
    if (fill) fill.style.transform = `scaleX(${p})`;
    let idx = 0;
    stops.forEach((s, i) => p >= s && (idx = i));
    steps.forEach((li, i) => li.classList.toggle('is-active', i === idx));
  }

  // ---------- Cena 3D (carregada sob demanda) ----------
  let visible = true;
  const boot = async () => {
    const { CookieExperience } = await import('../three/CookieExperience');
    xp = new CookieExperience({ canvas, lowPower: lowPowerDevice(), fill: mobile ? 0.5 : 0.58 });
    const applyLayout = () => {
      const desktop = !isMobile();
      xp?.setShift(desktop ? 0.225 : 0, desktop ? 0.015 : -0.01);
      xp?.resize();
    };
    applyLayout();
    xp.setProgress(proxy.p);
    await xp.ready;
    // Se a página abriu no meio da história, troca a foto pelo 3D sem esmaecer.
    if (proxy.p > 0.02) hero.querySelector<HTMLElement>('[data-hero-poster]')?.style.setProperty('transition', 'none');
    hero.classList.add('is-3d');
    if (visible) xp.start();

    let resizeRaf = 0;
    window.addEventListener('resize', () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(applyLayout);
    });

    if (finePointer) {
      window.addEventListener(
        'pointermove',
        (e) => xp?.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1),
        { passive: true },
      );
    } else {
      // Toque no cookie: ele balança (interação pensada para o celular).
      canvas.addEventListener('pointerdown', () => xp?.wiggle(), { passive: true });
    }
  };

  // Só renderiza quando o topo está visível.
  new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      if (!xp) return;
      if (visible) xp.start();
      else xp.stop();
    },
    { rootMargin: '100px' },
  ).observe(hero);

  const idle = (cb: () => void) =>
    'requestIdleCallback' in window ? (window as any).requestIdleCallback(cb, { timeout: 1200 }) : setTimeout(cb, 200);
  idle(() => {
    boot().catch((err) => {
      console.warn('[MOKKI] 3D indisponível, mantendo a foto.', err);
      hero.classList.remove('is-3d');
    });
  });

  document.addEventListener('visibilitychange', () => {
    if (!xp) return;
    if (document.hidden) xp.stop();
    else if (visible) xp.start();
  });

  /** "Quero conhecer": rola com calma até o recheio aparecer. */
  const play = () => {
    const st = tl.scrollTrigger!;
    const target = st.start + (st.end - st.start) * 0.66;
    scrollToTarget(target, { duration: lenis ? 3.2 : undefined, offset: 0 });
  };
  return { play };
}

export { ScrollTrigger };
