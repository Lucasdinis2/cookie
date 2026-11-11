/** Header: fundo ao rolar, seção ativa com "pílula" animada e menu mobile. */
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { lenis } from './scroll';

export function initHeader() {
  const header = document.querySelector<HTMLElement>('[data-header]');
  if (!header) return;

  // Fundo sólido após sair do topo
  const setSolid = () => header.classList.toggle('is-solid', window.scrollY > 24);
  setSolid();
  window.addEventListener('scroll', setSolid, { passive: true });

  // Indicador da seção atual
  const pill = header.querySelector<HTMLElement>('[data-nav-pill]');
  const links = [...header.querySelectorAll<HTMLAnchorElement>('[data-nav-link]')];
  const movePill = (link: HTMLAnchorElement | null) => {
    links.forEach((l) => l.setAttribute('aria-current', String(l === link)));
    if (!pill) return;
    if (!link) {
      pill.style.opacity = '0';
      return;
    }
    pill.style.opacity = '1';
    pill.style.width = `${link.offsetWidth}px`;
    pill.style.transform = `translateX(${link.offsetLeft}px)`;
  };
  const sections = links
    .map((l) => document.getElementById(l.dataset.navLink!))
    .filter((s): s is HTMLElement => !!s);
  sections.forEach((section) => {
    ScrollTrigger.create({
      trigger: section,
      start: 'top 45%',
      end: 'bottom 45%',
      onToggle: (self) => {
        if (self.isActive) movePill(links.find((l) => l.dataset.navLink === section.id) ?? null);
      },
    });
  });
  movePill(links[0] ?? null);
  window.addEventListener('resize', () => movePill(links.find((l) => l.getAttribute('aria-current') === 'true') ?? null));

  initMobileMenu();
}

function initMobileMenu() {
  const toggle = document.querySelector<HTMLButtonElement>('[data-menu-toggle]');
  const menu = document.querySelector<HTMLElement>('[data-mobile-menu]');
  const label = document.querySelector<HTMLElement>('[data-menu-label]');
  const main = document.getElementById('conteudo');
  if (!toggle || !menu) return;
  let open = false;
  let closeTimer = 0;

  const focusables = () =>
    [toggle, ...menu.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')].filter((el) => el.offsetParent !== null);

  const setOpen = (value: boolean, { restoreFocus = true } = {}) => {
    if (value === open) return;
    open = value;
    window.clearTimeout(closeTimer);
    toggle.setAttribute('aria-expanded', String(open));
    if (label) label.textContent = open ? 'Fechar menu' : 'Abrir menu';
    if (open) {
      menu.hidden = false;
      requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add('is-open')));
      main?.setAttribute('inert', '');
      lenis?.stop();
      document.body.style.overflow = 'hidden';
      window.setTimeout(() => menu.querySelector<HTMLElement>('a')?.focus(), 250);
    } else {
      menu.classList.remove('is-open');
      main?.removeAttribute('inert');
      lenis?.start();
      document.body.style.overflow = '';
      closeTimer = window.setTimeout(() => (menu.hidden = true), 650);
      if (restoreFocus) toggle.focus();
    }
  };

  toggle.addEventListener('click', () => setOpen(!open));
  menu.addEventListener('click', (ev) => {
    if ((ev.target as HTMLElement).closest('[data-menu-link]')) setOpen(false, { restoreFocus: false });
  });
  document.addEventListener('keydown', (ev) => {
    if (!open) return;
    if (ev.key === 'Escape') setOpen(false);
    if (ev.key === 'Tab') {
      const els = focusables();
      const first = els[0];
      const last = els[els.length - 1];
      if (ev.shiftKey && document.activeElement === first) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault();
        first.focus();
      }
    }
  });
  window.matchMedia('(min-width: 921px)').addEventListener('change', (mq) => mq.matches && setOpen(false, { restoreFocus: false }));
}
