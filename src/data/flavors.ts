/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  SABORES DA MOKKI                                                ║
 * ║  • price: preço em reais (ex.: 14.9). Use null para não exibir.  ║
 * ║  • size: tamanho/peso (ex.: '120 g'). Use null para não exibir.  ║
 * ║  • available: false esconde o botão de pedido do sabor.          ║
 * ║  • image: troque pelas fotos reais dos cookies da MOKKI          ║
 * ║    (coloque o arquivo em src/assets/photos e atualize o import). ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */
import type { ImageMetadata } from 'astro';
import nutellaImg from '../assets/photos/flavor-nutella.jpg';
import cookiesCreamImg from '../assets/photos/flavor-cookies-cream.jpg';
import brigadeiroImg from '../assets/photos/flavor-brigadeiro.jpg';
import tripleImg from '../assets/photos/flavor-triple-chocolate.jpg';

export interface Flavor {
  id: string;
  name: string;
  description: string;
  price: number | null;
  size: string | null;
  available: boolean;
  image: ImageMetadata;
  /** Recorte PNG (fundo transparente) do cookie real — tem prioridade sobre `image`. */
  cutout?: ImageMetadata;
  imageAlt: string;
  /** Enquadramento da foto dentro do card (CSS object-position). */
  imagePosition: string;
  /** Tema visual do card. */
  theme: 'blue' | 'brown' | 'cream' | 'teal';
  /** Créditos da foto provisória (remova ao trocar pela foto própria). */
  photoCredit?: { author: string; url: string };
}

export const FLAVORS: Flavor[] = [
  {
    id: 'nutella',
    name: 'Nutella',
    description: 'Massa tradicional com gotas de chocolate e recheio cremoso de Nutella.',
    price: null,
    size: null,
    available: true,
    image: nutellaImg,
    imageAlt: 'Cookie partido ao meio com recheio cremoso de chocolate escorrendo',
    imagePosition: '20% 62%',
    theme: 'blue',
    photoCredit: { author: 'Swiss Educational College', url: 'https://unsplash.com/photos/ufwocY-3WOA' },
  },
  {
    id: 'cookies-cream',
    name: 'Cookies & Cream',
    description: 'Massa de baunilha com pedaços de Oreo e recheio de chocolate branco.',
    price: null,
    size: null,
    available: true,
    image: cookiesCreamImg,
    imageAlt: 'Cookies empilhados com recheio branco cremoso',
    imagePosition: '50% 45%',
    theme: 'brown',
    photoCredit: { author: 'Eiliv Aceron', url: 'https://unsplash.com/photos/3jNTCCeC7gI' },
  },
  {
    id: 'brigadeiro',
    name: 'Brigadeiro',
    description: 'Massa de chocolate com recheio de brigadeiro cremoso e granulado.',
    price: null,
    size: null,
    available: true,
    image: brigadeiroImg,
    imageAlt: 'Cookie de chocolate partido ao meio visto de cima',
    imagePosition: '50% 50%',
    theme: 'cream',
    photoCredit: { author: 'With Mahdy', url: 'https://unsplash.com/photos/hMO34T7Kwnk' },
  },
  {
    id: 'triple-chocolate',
    name: 'Triple Chocolate',
    description: 'Massa de chocolate com três tipos de chocolate.',
    price: null,
    size: null,
    available: true,
    image: tripleImg,
    imageAlt: 'Cookie de chocolate com pedaço de chocolate derretido',
    imagePosition: '50% 50%',
    theme: 'teal',
    photoCredit: { author: '12photostory', url: 'https://unsplash.com/photos/UQCehsNx8dg' },
  },
];

/**
 * Enquanto as fotos acima forem provisórias (de banco de imagens),
 * o site exibe o aviso "Imagens meramente ilustrativas".
 * Mude para false quando usar as fotos reais da MOKKI.
 */
export const ILLUSTRATIVE_PHOTOS = true;

/** Fotos reais usadas nas texturas do cookie 3D do topo (créditos). */
export const HERO_PHOTO_CREDITS = [
  { author: 'Imad 786', url: 'https://unsplash.com/photos/5So4kc3Ocus' },
  { author: 'Swiss Educational College', url: 'https://unsplash.com/photos/ufwocY-3WOA' },
];
