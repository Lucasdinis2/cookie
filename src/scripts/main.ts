import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initScroll, initAnchors } from './scroll';
import { initHeader } from './header';
import { initHero } from './hero';
import { initEffects, initOrderBar } from './effects';
import { initOrder } from './order';

initScroll();
const hero = initHero();
initAnchors({ '#historia': () => hero.play() });
initHeader();
initOrder();
initEffects();
initOrderBar();

// Recalcula posições após fontes e imagens carregarem.
document.fonts?.ready.then(() => ScrollTrigger.refresh());
window.addEventListener('load', () => ScrollTrigger.refresh());
