// @ts-check
/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  CONFIGURAÇÃO CENTRAL DA MOKKI COOKIES                           ║
 * ║  Preencha os campos abaixo — o site se adapta automaticamente.   ║
 * ║  Campos vazios ('' ou null) simplesmente não aparecem no site.   ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */
export const SITE = {
  name: 'MOKKI Cookies',

  /** Domínio final, com https:// e sem barra no fim. Ex.: 'https://www.seudominio.com.br' */
  url: 'https://mokki-cookies.vercel.app',

  city: 'Juiz de Fora',
  state: 'MG',

  contact: {
    /**
     * WhatsApp com DDI + DDD + número, só dígitos. Ex.: '5532999999999'
     * Enquanto estiver vazio, o botão de pedido abre o WhatsApp para o
     * cliente escolher o contato (a mensagem do pedido já vai montada).
     */
    whatsapp: '',
    /** Usuário do Instagram, sem o arroba. Ex.: 'mokkicookies' */
    instagram: 'mokki.cookie',
    /** E-mail de contato (opcional). */
    email: '',
  },

  /**
   * Horários de atendimento/entrega. Ex.: ['Terça a sábado, 13h às 19h']
   * Deixe [] para não exibir.
   */
  hours: /** @type {string[]} */ ([]),

  /**
   * Informações extras exibidas na seção de pedidos (prazo de encomenda,
   * taxa de entrega, pedido mínimo...). Ex.: ['Encomendas com 1 dia de antecedência']
   */
  orderNotes: /** @type {string[]} */ ([]),

  /** Moeda usada quando houver preços cadastrados nos sabores. */
  currency: 'BRL',
};
