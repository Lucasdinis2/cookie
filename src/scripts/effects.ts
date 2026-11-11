/** Animações de entrada, parallax e microinterações (com propósito, sem exagero). */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { reducedMotion, finePointer } from './scroll';

export function initEffects() {
  if (reducedMotion) {
    gsap.set('[data-reveal]', { opacity: 1, y: 0 });
    return;
  }

  // Títulos com máscara (linha por linha)
  document.querySelectorAll<HTMLElement>('h2').forEach((title) => {
    const lines = title.querySelectorAll('[data-split-line]');
    if (!lines.length) return;
    gsap.from(lines, {
      yPercent: 110,
      duration: 1.05,
      ease: 'power4.out',
      stagger: 0.08,
      scrollTrigger: { trigger: title, start: 'top 86%' },
    });
  });

  // Elementos que surgem suavemente
  ScrollTrigger.batch('[data-reveal]', {
    start: 'top 90%',
    onEnter: (els) =>
      gsap.to(els, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.08, overwrite: true }),
  });

  // Cards de sabores: entrada escalonada + profundidade na foto
  const cards = gsap.utils.toArray<HTMLElement>('[data-flavor-card]');
  const mobile = window.matchMedia('(max-width: 768px)').matches;
  cards.forEach((card, i) => {
    gsap.from(card, {
      y: mobile ? 40 : 110,
      rotate: mobile ? 0 : i % 2 ? 3 : -3,
      opacity: 0,
      duration: 1.2,
      ease: 'power4.out',
      delay: mobile ? 0 : (i % 2) * 0.12,
      scrollTrigger: { trigger: card, start: mobile ? 'top 95%' : 'top 88%' },
    });
    const img = card.querySelector('img');
    if (img && !mobile) {
      gsap.fromTo(
        img,
        { yPercent: -6 },
        { yPercent: 6, ease: 'none', scrollTrigger: { trigger: card, start: 'top bottom', end: 'bottom top', scrub: true } },
      );
    }
  });

  // Parallax genérico
  document.querySelectorAll<HTMLElement>('[data-parallax]').forEach((el) => {
    const k = Number(el.dataset.parallax) || 0.1;
    gsap.fromTo(
      el,
      { yPercent: -k * 100 },
      { yPercent: k * 100, ease: 'none', scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } },
    );
  });
  document.querySelectorAll<HTMLElement>('[data-spin-scroll]').forEach((el) => {
    gsap.fromTo(
      el,
      { rotate: -25 },
      { rotate: 25, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } },
    );
  });
  document.querySelectorAll<HTMLElement>('[data-float]').forEach((el) => {
    const k = Number(el.dataset.float) || 1;
    gsap.to(el, {
      y: -120 * k,
      rotate: 40 * k,
      ease: 'none',
      scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
    });
  });

  // Faixa de sabores: loop infinito que acelera com a velocidade da rolagem
  const track = document.querySelector<HTMLElement>('[data-marquee]');
  if (track) {
    const loop = gsap.to(track, { xPercent: -50, duration: 26, ease: 'none', repeat: -1 });
    ScrollTrigger.create({
      trigger: track,
      start: 'top bottom',
      end: 'bottom top',
      onUpdate: (self) => {
        const v = gsap.utils.clamp(-4, 4, self.getVelocity() / 400);
        gsap.to(loop, { timeScale: (self.direction || 1) * (1 + Math.abs(v)), duration: 0.4, overwrite: true });
      },
      onToggle: (self) => (self.isActive ? loop.play() : loop.pause()),
    });
  }

  // Carrossel mobile: bolinhas de paginação
  const scroller = document.querySelector<HTMLElement>('[data-flavor-track]');
  const dots = [...document.querySelectorAll<HTMLElement>('[data-flavor-dots] span')];
  if (scroller && dots.length) {
    scroller.addEventListener(
      'scroll',
      () => {
        const items = [...scroller.querySelectorAll<HTMLElement>('[data-flavor-card]')];
        const center = scroller.scrollLeft + scroller.clientWidth / 2;
        let best = 0;
        let bestD = Infinity;
        items.forEach((it, i) => {
          const d = Math.abs(it.offsetLeft + it.offsetWidth / 2 - center);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        });
        dots.forEach((d, i) => d.classList.toggle('is-active', i === best));
      },
      { passive: true },
    );
  }

  if (finePointer) initPointerEffects();
}

/** Desktop: elementos que acompanham o cursor e fotos com profundidade. */
function initPointerEffects() {
  const followers = gsap.utils.toArray<HTMLElement>('[data-follow]').map((el) => ({
    el,
    k: Number(el.dataset.follow) || 0.04,
    x: gsap.quickTo(el, 'x', { duration: 0.9, ease: 'power3.out' }),
    y: gsap.quickTo(el, 'y', { duration: 0.9, ease: 'power3.out' }),
  }));
  if (followers.length) {
    window.addEventListener(
      'pointermove',
      (e) => {
        const dx = e.clientX - window.innerWidth / 2;
        const dy = e.clientY - window.innerHeight / 2;
        followers.forEach((f) => {
          f.x(dx * f.k * 2);
          f.y(dy * f.k * 2);
        });
      },
      { passive: true },
    );
  }

  document.querySelectorAll<HTMLElement>('[data-tilt]').forEach((el) => {
    const rx = gsap.quickTo(el, 'rotationX', { duration: 0.6, ease: 'power3.out' });
    const ry = gsap.quickTo(el, 'rotationY', { duration: 0.6, ease: 'power3.out' });
    gsap.set(el, { transformPerspective: 900 });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      ry(((e.clientX - r.left) / r.width - 0.5) * 10);
      rx(-((e.clientY - r.top) / r.height - 0.5) * 8);
    });
    el.addEventListener('pointerleave', () => {
      rx(0);
      ry(0);
    });
  });

  // Botões "magnéticos"
  document.querySelectorAll<HTMLElement>('.btn, [data-add-flavor]').forEach((btn) => {
    const x = gsap.quickTo(btn, 'x', { duration: 0.5, ease: 'power3.out' });
    const y = gsap.quickTo(btn, 'y', { duration: 0.5, ease: 'power3.out' });
    btn.addEventListener('pointermove', (e) => {
      const r = btn.getBoundingClientRect();
      x((e.clientX - r.left - r.width / 2) * 0.18);
      y((e.clientY - r.top - r.height / 2) * 0.25);
    });
    btn.addEventListener('pointerleave', () => {
      x(0);
      y(0);
    });
  });
}

/** Barra fixa de pedido no celular (aparece depois do topo). */
export function initOrderBar() {
  const bar = document.querySelector<HTMLElement>('[data-order-bar]');
  const hero = document.querySelector<HTMLElement>('[data-hero]');
  const order = document.getElementById('pedidos');
  if (!bar || !hero || !order) return;
  let heroVisible = true;
  let orderVisible = false;
  const update = () => {
    const show = !heroVisible && !orderVisible;
    bar.classList.toggle('is-visible', show);
    bar.setAttribute('aria-hidden', String(!show));
    bar.querySelector('a')?.setAttribute('tabindex', show ? '0' : '-1');
  };
  new IntersectionObserver(([e]) => {
    heroVisible = e.isIntersecting;
    update();
  }).observe(hero);
  new IntersectionObserver(
    ([e]) => {
      orderVisible = e.isIntersecting;
      update();
    },
    { rootMargin: '0px 0px -30% 0px' },
  ).observe(order);
}
