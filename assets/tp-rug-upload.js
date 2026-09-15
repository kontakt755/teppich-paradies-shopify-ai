/*
 * tp-rug-upload.js - Dateiauswahl fuer Skizzen, Schablonen, Grundrisse und Raumfotos.
 *
 * Ehrlich statt Attrappe: Die Dateien bleiben im Browser. Das Shopify-
 * Kontaktformular kann keine Anhaenge uebertragen, und ein Dateispeicher
 * (App oder eigene API) ist nicht angebunden. Die Oberflaeche sagt das
 * ausdruecklich; die Anfrage nennt nur Dateinamen und -groessen.
 *
 * uploadAdapter ist die eine Stelle, an der spaeter ein echter Speicher
 * andockt: upload(files, meta) liefert dann { stored: true, urls: [...] }.
 */
export const ACCEPT_MIME = ['image/jpeg', 'image/png', 'application/pdf'];
export const ACCEPT_EXT = ['.jpg', '.jpeg', '.png', '.pdf'];
export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_FILES = 8;

export const uploadAdapter = {
  name: 'lokal',
  stores: false,
  async upload() {
    return { stored: false, reason: 'Kein Dateispeicher angebunden (Entwurf).' };
  },
};

export function fmtSize(bytes) {
  if (bytes >= 1048576) return `${(bytes / 1048576).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const ext = (name) => (name.match(/\.[^.]+$/) || [''])[0].toLowerCase();
const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const ICON_UPLOAD = '<svg viewBox="0 0 48 48" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M24 32V10m-8 8 8-8 8 8"/><path d="M8 30v8h32v-8"/></svg>';
const ICON_FILE = '<svg viewBox="0 0 48 48" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" aria-hidden="true"><path d="M12 6h16l10 10v26H12z"/><path d="M28 6v10h10"/><path d="M17 30h14M17 24h14" stroke-linecap="round"/></svg>';

export class UploadField {
  /**
   * @param {HTMLElement} root
   * @param {{ label?: string, onChange?: (files: File[]) => void }} [o]
   */
  constructor(root, o = {}) {
    this.root = root;
    this.files = [];
    this.urls = new Map();
    this.onChange = o.onChange;
    const id = `tpu${Math.random().toString(36).slice(2, 8)}`;
    root.classList.add('tp-rug-upload');
    root.innerHTML = `
      <div class="tp-rug-upload__drop" data-drop>
        <input class="tp-rug-sr" type="file" id="${id}" multiple accept="${ACCEPT_EXT.join(',')},${ACCEPT_MIME.join(',')}" aria-describedby="${id}-hint ${id}-note">
        <label class="tp-rug-upload__label" for="${id}">
          <span class="tp-rug-upload__icon">${ICON_UPLOAD}</span>
          <span class="tp-rug-upload__title">${escHtml(o.label || 'Skizze, Raumfoto oder Schablone hochladen')}</span>
          <span class="tp-rug-upload__sub">Dateien hierher ziehen oder <u>auswählen</u></span>
        </label>
        <p class="tp-rug-upload__hint" id="${id}-hint">JPG, PNG oder PDF · bis 10 MB je Datei · bis zu ${MAX_FILES} Dateien</p>
      </div>
      <ul class="tp-rug-upload__list" role="list" data-list></ul>
      <p class="tp-rug-err" role="alert" data-uerr hidden></p>
      <p class="tp-rug-upload__note" id="${id}-note" data-note hidden>Wichtig: Die Dateien bleiben vorerst auf Ihrem Gerät. Das Anfrageformular kann noch keine Anhänge übertragen – nach dem Absenden zeigen wir Ihnen, wie Sie sie mit Ihrer Referenz per E-Mail oder WhatsApp nachreichen.</p>`;
    this.input = root.querySelector('input[type=file]');
    this.drop = root.querySelector('[data-drop]');
    this.list = root.querySelector('[data-list]');
    this.err = root.querySelector('[data-uerr]');
    this.note = root.querySelector('[data-note]');

    this.input.addEventListener('change', () => { this.add([...this.input.files]); this.input.value = ''; });
    ['dragenter', 'dragover'].forEach((t) => this.drop.addEventListener(t, (e) => { e.preventDefault(); this.drop.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach((t) => this.drop.addEventListener(t, (e) => { e.preventDefault(); this.drop.classList.remove('is-over'); }));
    this.drop.addEventListener('drop', (e) => this.add([...(e.dataTransfer?.files || [])]));
    this.list.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove]');
      if (btn) this.remove(Number(btn.dataset.remove));
    });
  }

  add(incoming) {
    const problems = [];
    for (const f of incoming) {
      const e = ext(f.name);
      if (e === '.heic' || e === '.heif' || /heic|heif/i.test(f.type)) {
        problems.push(`„${f.name}“: iPhone-Fotos im HEIC-Format bitte als JPG senden (Einstellungen › Kamera › Formate › „Maximale Kompatibilität“).`);
        continue;
      }
      if (!ACCEPT_MIME.includes(f.type) && !ACCEPT_EXT.includes(e)) { problems.push(`„${f.name}“: nur JPG, PNG oder PDF.`); continue; }
      if (f.size > MAX_BYTES) { problems.push(`„${f.name}“ ist ${fmtSize(f.size)} groß – höchstens 10 MB je Datei.`); continue; }
      if (this.files.length >= MAX_FILES) { problems.push(`Höchstens ${MAX_FILES} Dateien.`); break; }
      if (this.files.some((x) => x.name === f.name && x.size === f.size)) continue;
      this.files.push(f);
    }
    this.err.hidden = problems.length === 0;
    this.err.textContent = problems.join(' ');
    this.render();
  }

  remove(i) {
    const f = this.files[i];
    if (!f) return;
    const url = this.urls.get(f);
    if (url) URL.revokeObjectURL(url);
    this.urls.delete(f);
    this.files.splice(i, 1);
    this.render();
  }

  render() {
    this.list.innerHTML = this.files.map((f, i) => {
      let thumb = `<span class="tp-rug-upload__thumb tp-rug-upload__thumb--file">${ICON_FILE}</span>`;
      if (/^image\//.test(f.type)) {
        if (!this.urls.has(f)) this.urls.set(f, URL.createObjectURL(f));
        thumb = `<img class="tp-rug-upload__thumb" src="${this.urls.get(f)}" alt="">`;
      }
      return `<li class="tp-rug-upload__item">${thumb}<span class="tp-rug-upload__meta"><span class="tp-rug-upload__name">${escHtml(f.name)}</span><span class="tp-rug-upload__size">${fmtSize(f.size)} · nur auf Ihrem Gerät</span></span><button type="button" class="tp-rug-upload__remove" data-remove="${i}" aria-label="${escHtml(f.name)} entfernen">×</button></li>`;
    }).join('');
    this.note.hidden = this.files.length === 0;
    if (this.onChange) this.onChange(this.files);
  }

  meta() {
    return this.files.map((f) => ({ name: f.name, size: f.size, type: f.type }));
  }
}
