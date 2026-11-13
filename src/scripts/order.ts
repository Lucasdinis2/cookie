/**
 * Pedido: escolha de sabores/quantidades → mensagem pronta no WhatsApp.
 * Não há checkout nem pagamento no site — tudo é combinado pelo WhatsApp.
 */
interface OrderConfig {
  whatsapp: string;
  instagram: string;
  city: string;
  state: string;
  currency: string;
  flavors: { id: string; name: string; price: number | null }[];
}

const STORAGE_KEY = 'mokki:pedido';
const MAX_QTY = 99;

export function initOrder() {
  const cfgEl = document.getElementById('order-config');
  if (!cfgEl) return;
  const cfg: OrderConfig = JSON.parse(cfgEl.textContent || '{}');
  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cfg.currency });
  const form = document.querySelector<HTMLFormElement>('[data-order-form]');
  const qty: Record<string, number> = Object.fromEntries(cfg.flavors.map((f) => [f.id, 0]));

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    for (const id of Object.keys(qty)) if (Number.isFinite(saved[id])) qty[id] = Math.max(0, Math.min(MAX_QTY, saved[id]));
  } catch {
    /* armazenamento indisponível: segue sem persistir */
  }

  const total = () => Object.values(qty).reduce((a, b) => a + b, 0);
  const plural = (n: number) => `${n} cookie${n === 1 ? '' : 's'}`;

  const render = (changed?: string) => {
    const n = total();
    for (const f of cfg.flavors) {
      const q = qty[f.id];
      const val = document.querySelector<HTMLElement>(`[data-qty="${f.id}"]`);
      if (val) {
        val.textContent = String(q);
        if (changed === f.id) {
          val.classList.remove('bump');
          void val.offsetWidth;
          val.classList.add('bump');
        }
      }
      document.querySelector(`[data-line="${f.id}"]`)?.classList.toggle('is-active', q > 0);
      const minus = document.querySelector<HTMLButtonElement>(`[data-step="-1"][data-id="${f.id}"]`);
      if (minus) minus.disabled = q === 0;
      const badge = document.querySelector<HTMLElement>(`[data-flavor-qty="${f.id}"]`);
      if (badge) {
        badge.hidden = q === 0;
        badge.textContent = `${q} no pedido`;
      }
    }
    document.querySelectorAll<HTMLElement>('[data-cart-count]').forEach((el) => {
      el.hidden = n === 0;
      el.textContent = String(n);
      if (changed) {
        el.classList.remove('bump');
        void el.offsetWidth;
        el.classList.add('bump');
      }
    });
    const barCount = document.querySelector<HTMLElement>('[data-order-bar-count]');
    if (barCount) barCount.textContent = n ? `${plural(n)} no pedido` : 'Escolha seus sabores';
    const totalItems = document.querySelector<HTMLElement>('[data-order-total-items]');
    if (totalItems) totalItems.textContent = n ? `Total: ${plural(n)}` : 'Nenhum cookie escolhido';
    const totalPrice = document.querySelector<HTMLElement>('[data-order-total-price]');
    const priced = cfg.flavors.filter((f) => qty[f.id] > 0);
    const allPriced = priced.length > 0 && priced.every((f) => f.price != null);
    if (totalPrice) {
      totalPrice.hidden = !allPriced;
      if (allPriced) totalPrice.textContent = money.format(priced.reduce((s, f) => s + (f.price ?? 0) * qty[f.id], 0));
    }
    const clear = document.querySelector<HTMLElement>('[data-order-clear]');
    if (clear) clear.hidden = n === 0;
    if (n > 0) document.querySelector<HTMLElement>('[data-order-error]')?.setAttribute('hidden', '');
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(qty));
    } catch {
      /* ignora */
    }
  };

  const change = (id: string, delta: number) => {
    if (!(id in qty)) return;
    qty[id] = Math.max(0, Math.min(MAX_QTY, qty[id] + delta));
    render(id);
  };

  document.addEventListener('click', (ev) => {
    const el = ev.target as HTMLElement;
    const step = el.closest<HTMLButtonElement>('[data-step]');
    if (step) {
      change(step.dataset.id!, Number(step.dataset.step));
      return;
    }
    const add = el.closest<HTMLButtonElement>('[data-add-flavor]');
    if (add) {
      change(add.dataset.addFlavor!, 1);
      add.classList.remove('is-added');
      void add.offsetWidth;
      add.classList.add('is-added');
      showToast(`${add.dataset.flavorName} adicionado ao pedido`);
      return;
    }
    if (el.closest('[data-order-clear]')) {
      for (const id of Object.keys(qty)) qty[id] = 0;
      render();
    }
  });

  /** Copia a mensagem do pedido (com plano B para navegadores antigos). */
  const copyOrder = (message: string) => {
    const title = form?.querySelector<HTMLElement>('[data-order-sent-title]');
    const textEl = form?.querySelector<HTMLTextAreaElement>('[data-order-text]');
    const fallback = () => {
      textEl?.focus();
      textEl?.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      if (title) title.textContent = ok ? 'Mensagem do pedido copiada! ✓' : 'Copie a mensagem abaixo e envie no Instagram:';
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(message).then(() => {
        if (title) title.textContent = 'Mensagem do pedido copiada! ✓';
      }, fallback);
    } else fallback();
  };
  form?.querySelector('[data-order-copy-again]')?.addEventListener('click', () => {
    const text = form.querySelector<HTMLTextAreaElement>('[data-order-text]')?.value;
    if (text) copyOrder(text);
  });

  form?.addEventListener('input', (ev) => {
    const input = ev.target as HTMLInputElement;
    if (input.getAttribute('aria-invalid') === 'true' && input.value.trim().length >= 2) {
      input.setAttribute('aria-invalid', 'false');
      form.querySelector<HTMLElement>(`[data-field-error="${input.name}"]`)?.setAttribute('hidden', '');
    }
  });

  form?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const n = total();
    const error = form.querySelector<HTMLElement>('[data-order-error]');
    if (!n) {
      if (error) {
        error.hidden = false;
        error.classList.remove('shake');
        void error.offsetWidth;
        error.classList.add('shake');
      }
      form.querySelector<HTMLButtonElement>('[data-step="1"]')?.focus();
      return;
    }
    const data = new FormData(form);
    const nome = String(data.get('nome') || '').trim();
    const endereco = String(data.get('endereco') || '').trim();
    // Nome e endereço são obrigatórios
    let firstInvalid: HTMLInputElement | null = null;
    for (const [field, value] of [['nome', nome], ['endereco', endereco]] as const) {
      const input = form.querySelector<HTMLInputElement>(`[name="${field}"]`);
      const msg = form.querySelector<HTMLElement>(`[data-field-error="${field}"]`);
      const ok = value.length >= 2;
      input?.setAttribute('aria-invalid', String(!ok));
      if (msg) msg.hidden = ok;
      if (!ok && !firstInvalid) firstInvalid = input;
    }
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }
    const obs = String(data.get('obs') || '').trim();
    const items = cfg.flavors.filter((f) => qty[f.id] > 0);
    const allPriced = items.every((f) => f.price != null);
    const lines = [
      'Olá, MOKKI! 🍪 Quero fazer um pedido:',
      '',
      ...items.map((f) => `• ${qty[f.id]}x ${f.name}`),
      '',
      `Total: ${plural(n)}`,
      ...(allPriced ? [`Valor dos cookies: ${money.format(items.reduce((s, f) => s + (f.price ?? 0) * qty[f.id], 0))}`] : []),
      `Nome: ${nome}`,
      `Endereço: ${endereco} – ${cfg.city} – ${cfg.state}`,
      ...(obs ? [`Observações: ${obs}`] : []),
      '',
      'Pedido montado pelo site.',
    ];
    const message = lines.join('\n');
    const open = (url: string) => {
      const win = window.open(url, '_blank');
      if (win) win.opener = null;
      else window.location.href = url;
    };
    if (cfg.whatsapp) {
      open(`https://wa.me/${cfg.whatsapp}?text=${encodeURIComponent(message)}`);
      return;
    }
    if (cfg.instagram) {
      // O Instagram não aceita mensagem pronta em link: copiamos o pedido e
      // abrimos o perfil da MOKKI (no celular abre direto no app → "Mensagem").
      const sent = form.querySelector<HTMLElement>('[data-order-sent]');
      const textEl = form.querySelector<HTMLTextAreaElement>('[data-order-text]');
      if (textEl) textEl.value = message;
      if (sent) sent.hidden = false;
      copyOrder(message);
      const win = window.open(`https://www.instagram.com/${cfg.instagram}/`, '_blank');
      if (win) win.opener = null;
      sent?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`);
  });

  render();
}

let toastTimer = 0;
function showToast(message: string) {
  const toast = document.querySelector<HTMLElement>('[data-toast]');
  const text = document.querySelector<HTMLElement>('[data-toast-text]');
  if (!toast || !text) return;
  text.textContent = message;
  toast.hidden = false;
  toast.style.animation = 'none';
  void toast.offsetWidth;
  toast.style.animation = '';
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.hidden = true), 3200);
}
