/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  SABORES DA MOKKI                                                ║
 * ║  • price: preço em reais (ex.: 14.9). Use null para não exibir.  ║
 * ║  • size: tamanho/peso (ex.: '120 g'). Use null para não exibir.  ║
 * ║  • available: false esconde o botão de pedido do sabor.          ║
 * ║  • image: PNG do cookie com fundo transparente. Para trocar,     ║
 * ║    coloque a foto em referencias/fotos-mokki/<sabor>.jpg e rode  ║
 * ║    npm run assets:cookies                                         ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */
import type { ImageMetadata } from 'astro';
import nutellaImg from '../assets/photos/mokki-nutella.png';
import cookiesCreamImg from '../assets/photos/mokki-cookies-cream.png';
import brigadeiroImg from '../assets/photos/mokki-brigadeiro.png';
import tripleImg from '../assets/photos/mokki-triple-chocolate.png';

export interface Flavor {
  id: string;
  name: string;
  description: string;
  price: number | null;
  size: string | null;
  available: boolean;
  /** Foto real do cookie, recortada (PNG com fundo transparente). */
  image: ImageMetadata;
  imageAlt: string;
  /** Tema visual do card. */
  theme: 'blue' | 'brown' | 'cream' | 'teal';
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
    imageAlt: 'Cookie MOKKI de Nutella com pedaços de chocolate e Nutella derretida por cima',
    theme: 'blue',
  },
  {
    id: 'cookies-cream',
    name: 'Cookies & Cream',
    description: 'Massa tradicional com pedaços de Oreo e recheio de chocolate branco.',
    price: null,
    size: null,
    available: true,
    image: cookiesCreamImg,
    imageAlt: 'Cookie MOKKI Cookies & Cream com pedaços de Oreo e chocolate branco',
    theme: 'brown',
  },
  {
    id: 'brigadeiro',
    name: 'Brigadeiro',
    description: 'Massa tradicional com recheio de brigadeiro cremoso e granulado.',
    price: null,
    size: null,
    available: true,
    image: brigadeiroImg,
    imageAlt: 'Cookie MOKKI de brigadeiro coberto de granulado e chocolate',
    theme: 'cream',
  },
  {
    id: 'triple-chocolate',
    name: 'Triple Chocolate',
    description: 'Massa de chocolate com gotas de chocolate meio amargo e recheio de chocolate branco.',
    price: null,
    size: null,
    available: true,
    image: tripleImg,
    imageAlt: 'Cookie MOKKI de massa de chocolate com pedaços de chocolate meio amargo e chocolate branco',
    theme: 'teal',
  },
];

/** Créditos das fotos de banco usadas na textura do miolo do cookie 3D. */
export const TEXTURE_PHOTO_CREDITS = [{ author: 'Swiss Educational College', url: 'https://unsplash.com/photos/ufwocY-3WOA' }];
