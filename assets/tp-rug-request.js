/*
 * tp-rug-request.js - Anfrage ueber das Shopify-Kontaktformular.
 *
 * Kein Warenkorb, keine Kasse: Uebertragen werden Kontaktdaten und die
 * Konfiguration als Text. Dateien werden NICHT uebertragen (siehe
 * tp-rug-upload.js); die Anfrage nennt nur ihre Namen, und die Erfolgsmeldung
 * zeigt, wie der Kunde sie mit seiner Referenz nachreicht.
 *
 * Versand per fetch an /contact (gleiche Seite bleibt stehen). Verlangt Shopify
 * eine Captcha-Pruefung, faellt das Formular auf den normalen Versand zurueck.
 */
import { esc } from './tp-rug-core.js';

const LAST_KEY = 'tp-rug-letzte-anfrage';
const MAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function remember(data) {
  try { sessionStorage.setItem(LAST_KEY, JSON.stringify({ ...data, at: Date.now() })); } catch (e) { /* egal */ }
}

export function lastRequest() {
  try { return JSON.parse(sessionStorage.getItem(LAST_KEY) || 'null'); } catch (e) { return null; }
}

export function successHtml({ reference, files = [], email = '', whatsapp = '' }) {
  const subject = encodeURIComponent(`Teppich-Anfrage ${reference} – Dateien`);
  const waText = encodeURIComponent(`Hallo, hier die Dateien zu meiner Teppich-Anfrage ${reference}.`);
  const fileBlock = files.length
    ? `<div class="tp-rug-next"><p><strong>Jetzt noch Ihre ${files.length === 1 ? 'Datei' : `${files.length} Dateien`} senden</strong> – sie wurden nicht mitgeschickt:</p>
       <ul class="tp-rug-next__files">${files.map((f) => `<li>${esc(f.name)}</li>`).join('')}</ul>
       <div class="tp-rug-actions">
         ${email ? `<a class="tp-rug-btn tp-rug-btn--primary tp-rug-btn--small" href="mailto:${esc(email)}?subject=${subject}">Per E-Mail senden</a>` : ''}
         ${whatsapp ? `<a class="tp-rug-btn tp-rug-btn--ghost tp-rug-btn--small" href="https://wa.me/${esc(whatsapp)}?text=${waText}" target="_blank" rel="noopener">Per WhatsApp senden</a>` : ''}
       </div>
       <p class="tp-rug-small">Bitte die Referenz <strong>${esc(reference)}</strong> angeben, damit wir die Dateien zuordnen können.</p></div>`
    : '';
  return `<div class="tp-rug-ok" role="status" tabindex="-1">
    <p class="tp-rug-ok__title">Vielen Dank – Ihre Anfrage ist bei uns angekommen.</p>
    <p>Ihre Referenz: <strong>${esc(reference)}</strong>. Wir prüfen Ihre Angaben und melden uns persönlich.</p>
    ${fileBlock}
  </div>`;
}

/**
 * @param {HTMLFormElement} form
 * @param {{ getPayload: () => ({ subject: string, text: string, reference: string, files?: {name:string,size:number}[], error?: string }), onSent?: (p: object) => void }} o
 */
export function wireRequestForm(form, o) {
  if (!form || form.dataset.tpRugWired) return;
  form.dataset.tpRugWired = '1';
  const status = form.querySelector('[data-status]');
  const setStatus = (msg, kind = '') => {
    if (!status) return;
    status.textContent = msg;
    status.dataset.kind = kind;
  };
  const errEl = (el) => form.querySelector(`[data-err-for="${el.id}"]`);

  function check(el) {
    const v = (el.value || '').trim();
    let msg = '';
    if (el.hasAttribute('data-required') && !v) msg = el.dataset.msg || 'Bitte ausfüllen.';
    else if (el.type === 'email' && v && !MAIL_RE.test(v)) msg = 'Bitte eine gültige E-Mail-Adresse eingeben, z. B. name@beispiel.de.';
    const e = errEl(el);
    if (e) { e.textContent = msg; e.hidden = !msg; }
    el.setAttribute('aria-invalid', msg ? 'true' : 'false');
    return !msg;
  }

  form.querySelectorAll('input, textarea, select').forEach((el) => {
    if (el.type === 'hidden') return;
    el.addEventListener('blur', () => { if (el.value || el.getAttribute('aria-invalid') === 'true') check(el); });
  });

  const setHidden = (key, value) => {
    const el = form.querySelector(`[data-h="${key}"]`);
    if (el) el.value = value;
  };

  form.addEventListener('submit', async (ev) => {
    if (form.dataset.native === '1') return;
    ev.preventDefault();
    const fields = [...form.querySelectorAll('input:not([type=hidden]), textarea, select')];
    const bad = fields.filter((el) => !check(el));
    if (bad.length) { bad[0].focus(); setStatus('Bitte prüfen Sie die markierten Felder.', 'err'); return; }
    const p = o.getPayload();
    if (p.error) { setStatus(p.error, 'err'); return; }

    setHidden('betreff', p.subject);
    setHidden('referenz', p.reference);
    setHidden('konfiguration', p.text);
    setHidden('dateien', (p.files || []).length ? `${p.files.map((f) => f.name).join(', ')} – NICHT übertragen, Kunde reicht nach` : 'keine');
    remember({ reference: p.reference, files: (p.files || []).map((f) => ({ name: f.name })) });

    const btn = form.querySelector('[type=submit]');
    if (btn) { btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = 'Wird gesendet …'; }
    setStatus('');
    try {
      const res = await fetch(form.action, { method: 'POST', body: new FormData(form), credentials: 'same-origin' });
      if (/\/challenge/.test(res.url)) {
        // Captcha verlangt: normaler Versand, Shopify fuehrt durch die Pruefung.
        form.dataset.native = '1';
        form.submit();
        return;
      }
      const html = res.ok ? await res.text() : '';
      const ok = res.ok && (/contact_posted=true/.test(res.url) || /posted_successfully|form-status--success|contact_posted/i.test(html));
      if (!ok) throw new Error(`Status ${res.status}`);
      form.innerHTML = successHtml({ reference: p.reference, files: p.files || [], email: form.dataset.shopEmail, whatsapp: form.dataset.whatsapp });
      form.querySelector('.tp-rug-ok')?.focus();
      if (o.onSent) o.onSent(p);
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = btn.dataset.label || 'Senden'; }
      setStatus('Das hat leider nicht geklappt. Bitte versuchen Sie es erneut oder rufen Sie uns an.', 'err');
    }
  });
}
