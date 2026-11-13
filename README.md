# MOKKI Cookies — site oficial

Site da **MOKKI Cookies** (cookies artesanais recheados · entregas somente em **Juiz de Fora – MG**).
A experiência principal é um cookie real (textura fotográfica em 3D) que **racha a partir do centro, as rachaduras correm pela superfície e ele se desfaz em pedaços, lascas e migalhas conforme a rolagem** — 100% sincronizado com o scroll e reversível.

## Como rodar

Requisitos: Node.js 22.12+ (testado com Node 24).

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # gera o site estático em dist/
npm run preview    # serve o dist/ localmente
```

## O que preencher (tudo em um lugar)

| O quê | Onde |
| --- | --- |
| **WhatsApp** (DDI+DDD+número, só dígitos, ex.: `5532999999999`) | `src/config/site.mjs` → `contact.whatsapp` |
| Instagram (já preenchido: `mokki.cookie`) | `src/config/site.mjs` → `contact.instagram` |
| E-mail (opcional) | `src/config/site.mjs` → `contact.email` |
| **Domínio final** (para canonical, Open Graph absoluto e sitemap) | `src/config/site.mjs` → `url` (ou variável `SITE_URL`) |
| Horários de atendimento/entrega | `src/config/site.mjs` → `hours` |
| Avisos de pedido (antecedência, taxa, mínimo...) | `src/config/site.mjs` → `orderNotes` |
| **Preços, tamanho e disponibilidade** de cada sabor | `src/data/flavors.ts` → `price`, `size`, `available` |
| **Fotos dos sabores** | coloque a foto em `referencias/fotos-mokki/<sabor>.jpg` (fundo claro) e rode `npm run assets:cookies` — gera o PNG recortado em `src/assets/photos/mokki-<sabor>.png` |

Campos vazios simplesmente não aparecem no site (nada de link quebrado ou dado inventado).
Enquanto o WhatsApp estiver vazio, o botão **Fazer meu pedido** copia a mensagem do pedido e abre o **Direct do Instagram** (@mokki.cookie) — o cliente só cola e envia. Com o WhatsApp preenchido, o pedido passa a abrir direto no WhatsApp com a mensagem pronta.
Quando houver preço em todos os sabores escolhidos, o total estimado aparece no resumo e na mensagem.

> As fotos dos sabores são as fotos reais da MOKKI, recortadas em PNG com fundo transparente. O cookie 3D do topo usa a foto do cookie de Nutella.

## Como funciona o pedido

1. O cliente escolhe sabores e quantidades (botões `+`/`−` ou "Pedir este sabor" nos cards).
2. Informa nome e endereço de entrega (obrigatórios) e, se quiser, observações.
3. **Fazer meu pedido** abre o WhatsApp com a mensagem montada. Não há checkout nem pagamento no site.
O carrinho fica salvo no navegador do cliente (localStorage).

## Arquitetura

- **Astro 7** (HTML estático, ótimo para SEO e desempenho) + **TypeScript**
- **Three.js** — cookie 3D (carregado sob demanda, depois do primeiro paint)
- **GSAP + ScrollTrigger** — linha do tempo da história controlada pelo scroll
- **Lenis** — rolagem suave (desligada com `prefers-reduced-motion`)
- Fontes auto-hospedadas (Fredoka, Poppins, Yellowtail) via Fontsource
- Imagens convertidas para WebP responsivo no build (`astro:assets`)

```
src/
  config/site.mjs          ← configuração central (contatos, cidade, horários)
  data/flavors.ts          ← sabores (nome, descrição, preço, foto)
  components/              ← Header, Hero, Flavors, About, Order, Footer...
  scripts/                 ← scroll, header/menu, hero (história), pedido, efeitos
  three/                   ← cena 3D: modelo do cookie, recheio, migalhas
  lib/procedural/          ← forma do cookie, linha de fratura, contorno da foto
  assets/brand/            ← logo e mascote vetorizados das artes originais
public/textures/           ← texturas do cookie 3D (geradas pelos scripts)
scripts/                   ← geração de assets (logo, fotos → texturas, ícones)
referencias/               ← artes originais e fotos-fonte
```

### A animação do cookie

- A **superfície é a foto real do cookie de Nutella da MOKKI**, recortada automaticamente; o **contorno da geometria 3D é extraído da própria foto**.
- **Fratura procedural** (`src/three/fracture.ts`): o cookie é triangulado (Delaunay) e dividido em cunhas que partem do ponto de pressão + lascas menores ao longo das rachaduras e da borda.
- **Rachaduras que andam**: o tempo de chegada da rachadura em cada ponto vem de um caminho mínimo (Dijkstra) na rede de fraturas, então elas se propagam do centro para a borda conforme o scroll, e as fendas se abrem de verdade.
- **Dentro e fora realistas**: topo = foto; lateral = crosta real da foto; base tostada com poros; face da quebra = miolo fotográfico (sintetizado sem repetição a partir de uma foto de cookie partido), com os pedaços de chocolate da superfície continuando para dentro da quebra.
- **Física e profundidade**: pedaços com velocidade, rotação e gravidade; migalhas e poeira dourada; sombras suaves projetadas no fundo; câmera que gira levemente durante a quebra. Tudo é função do progresso → rolar para cima "remonta" o cookie.
- Celular: malha e partículas reduzidas, sombras mais leves, toque no cookie faz ele balançar.
- Sem WebGL, com economia de dados ou com movimento reduzido: o topo mostra a foto real, sem pin e sem animação.

### Regerar assets (opcional)

```bash
npm run assets:brand     # vetoriza logo/mascote a partir de referencias/
npm run assets:photos    # cookie do 3D (padrão: mokki-nutella.png) → texturas + contorno
npm run assets:icons     # favicon, apple-touch-icon e og-image
npm run assets:cookies   # fotos dos sabores → PNG recortado (referencias/fotos-mokki)
```

Para trocar o cookie do 3D: `npm run assets:photos -- caminho/da/foto.png` (foto de cima, fundo claro).

## Publicação

O build gera um site 100% estático em `dist/` — funciona em qualquer hospedagem:

- **Vercel / Netlify / Cloudflare Pages**: conecte o repositório; comando `npm run build`, pasta `dist`.
- **Hospedagem comum (cPanel/FTP)**: rode `npm run build` e envie o conteúdo de `dist/`.

Antes de publicar: preencha `url`, `whatsapp` e `instagram` em `src/config/site.mjs`.
Depois, cadastre o site no Google Search Console e crie/atualize o **Perfil da Empresa no Google** com a área de entrega em Juiz de Fora — é o que mais ajuda nas buscas locais.

## Créditos das fotos

Fotos dos cookies: MOKKI Cookies. Textura do miolo da quebra: Swiss Educational College / [Unsplash](https://unsplash.com/photos/ufwocY-3WOA) (licença gratuita).
