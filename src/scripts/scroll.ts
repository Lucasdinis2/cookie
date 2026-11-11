/**
 * Rolagem suave (Lenis) sincronizada com o GSAP ScrollTrigger.
 * Desativada para quem prefere menos movimento.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

export const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

export let lenis: Lenis | null = null;

export function initScroll() {
  ScrollTrigger.config({ ignoreMobileResize: true });
  if (reducedMotion) return;
  lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 0.95, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis?.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  document.documentElement.classList.add('lenis');
}

const headerOffset = () => -(document.querySelector<HTMLElement>('[data-header]')?.offsetHeight ?? 76) + 4;

/** Rola até um destino (seletor, elemento ou posição). */
export function scrollToTarget(target: string | HTMLElement | number, opts: { duration?: number; offset?: number } = {}) {
  const el = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
  if (el == null) return;
  const offset = opts.offset ?? (typeof el === 'number' ? 0 : headerOffset());
  if (lenis) {
    lenis.scrollTo(el, {
      offset,
      duration: opts.duration ?? 1.4,
      easing: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    });
  } else {
    const top = typeof el === 'number' ? el : el.getBoundingClientRect().top + window.scrollY + offset;
    window.scrollTo({ top, behavior: reducedMotion ? 'auto' : 'smooth' });
  }
}

/** Links internos (#âncora) com rolagem suave e foco acessível. */
export function initAnchors(special: Record<string, () => void> = {}) {
  document.addEventListener('click', (ev) => {
    const a = (ev.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
    if (!a || ev.defaultPrevented || ev.metaKey || ev.ctrlKey) return;
    const hash = a.getAttribute('href')!;
    if (hash === '#' || hash === '#conteudo') return;
    ev.preventDefault();
    if (special[hash]) {
      special[hash]();
      return;
    }
    const target = document.querySelector<HTMLElement>(hash);
    if (!target) return;
    if (hash === '#inicio') scrollToTarget(0, { duration: 1.6 });
    else scrollToTarget(target);
    history.replaceState(null, '', hash);
    // Move o foco para a seção (leitores de tela / teclado) sem pular a rolagem.
    const focusEl = target.querySelector<HTMLElement>('h1, h2') ?? target;
    if (!focusEl.hasAttribute('tabindex')) focusEl.setAttribute('tabindex', '-1');
    window.setTimeout(() => focusEl.focus({ preventScroll: true }), lenis ? 900 : 50);
  });
}
