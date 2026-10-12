/**
 * Ansicht "Social Media" (#/social): die Links, die man fuer Social Media taeglich braucht.
 *
 * Drei Dinge, sonst nichts: der Upload-Link fuer die Baustellenfotos des Teams,
 * ein Baukasten fuer Kampagnen-Links (UTM) und die Wege zur Social-Zentrale und
 * zu den eigenen Profilen. Der Upload-Link enthaelt ein Geheimnis; er kommt nur
 * vom Server (/api/social/zugaenge) und nie fuer die Rolle "lesen".
 */
import { esc, toast } from '../kern/helfer.mjs';
import { fetchEinkauf, orgSchreiben } from '../kern/api.mjs';
import { render } from '../kern/render.mjs';
import { istNurLesend } from '../kern/sitzung.mjs';
import { emptyState, stoerungState } from '../bausteine/karten.mjs';
import { ZIELE, KANAELE, ARTEN, kampagnenLink } from '../lib/kampagnenlink.mjs';

const social = {
  daten: null, loading: false, legtAn: false,
  // Eingaben des Baukastens ueberleben ein Neuzeichnen (z. B. nach dem Laden der Zugaenge).
  ziel: '/', eigeneAdresse: '', kanal: 'instagram', art: 'beitrag', kampagne: '',
};

function ensureZugaenge() {
  if (social.daten || social.loading || istNurLesend()) return;
  social.loading = true;
  fetchEinkauf('/api/social/zugaenge').then(d => { social.daten = d; })
    .finally(() => { social.loading = false; if (location.hash.startsWith('#/social')) render(); });
}

function datum(iso) {
  return iso ? new Date(iso).toLocaleDateString('de-DE') : '';
}

function uploadKarte() {
  const d = social.daten;
  let inhalt;
  if (!d) inhalt = '<div class="empty">Lade …</div>';
  else if (d.fehler) inhalt = stoerungState(d, 'Die Upload-Links');
  else if (!d.zugaenge.length) {
    inhalt = emptyState('Noch kein Upload-Link angelegt.', 'Der Inhaber legt ihn hier mit „Neuen Link anlegen“ an (Name z. B. „Team“) und schickt ihn ans Handy der Monteure.');
  } else {
    inhalt = `<div class="rows">${d.zugaenge.map(z => `<div class="row">
        <div>
          <div class="t">${esc(z.name)}</div>
          ${z.link
            ? `<div class="m social-link mono">${esc(z.link)}</div>`
            : `<div class="m">Gültig seit ${esc(datum(z.seit))}. Der Link wurde nur beim Anlegen angezeigt –
                für einen kopierbaren Link einmal „Neuen Link anlegen“. Der alte bleibt gültig.</div>`}
        </div>
        <div class="r">${z.link ? `<button type="button" class="btn btn-sm btn-primary" data-kopiertext="${esc(z.link)}">Kopieren</button>` : ''}</div>
      </div>`).join('')}</div>`;
  }
  const basisFehlt = d && !d.fehler && d.basisVorhanden === false
    ? '<p class="small muted" style="margin:8px 0 0">Die öffentliche Upload-Adresse ist am Mac noch nicht eingetragen – dann kann kein Link entstehen.</p>'
    : '';
  return `<section class="card social-karte" aria-labelledby="socialUploadKopf">
      <h2 id="socialUploadKopf">Foto-Upload fürs Team</h2>
      <p class="small muted">Mit diesem Link laden die Monteure Fotos vom fertigen Raum hoch – ohne Anmeldung. Nur an das eigene Team weitergeben.</p>
      ${inhalt}${basisFehlt}
      <form class="social-neu" id="socialLinkNeu" data-nur-inhaber>
        <label class="small" for="socialLinkName">Neuen Link anlegen für</label>
        <div class="social-zeile">
          <input type="text" id="socialLinkName" maxlength="40" placeholder="z. B. Team" autocomplete="off">
          <button type="submit" class="btn"${social.legtAn ? ' disabled' : ''}>${social.legtAn ? 'Wird angelegt …' : 'Neuen Link anlegen'}</button>
        </div>
      </form>
    </section>`;
}

function auswahl(id, werte, aktuell) {
  return `<select id="${id}">${werte.map(([w, t]) => `<option value="${esc(w)}"${w === aktuell ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
}

function aktuellerLink() {
  return kampagnenLink({
    ziel: social.ziel === 'eigen' ? social.eigeneAdresse : social.ziel,
    kanal: social.kanal, art: social.art, kampagne: social.kampagne,
  });
}

function ergebnisHtml() {
  const r = aktuellerLink();
  if (r.fehler) return `<p class="small muted" style="margin:0">${esc(r.fehler)}</p>`;
  return `<div class="social-link mono">${esc(r.link)}</div>
    <button type="button" class="btn btn-primary" data-kopiertext="${esc(r.link)}">Kopieren</button>`;
}

function baukasten() {
  const ziele = [...ZIELE.map(z => [z.wert, z.text]), ['eigen', 'Andere Shop-Adresse …']];
  return `<section class="card social-karte" aria-labelledby="socialKampagneKopf">
      <h2 id="socialKampagneKopf">Kampagnen-Link</h2>
      <p class="small muted">Für Beiträge, Anzeigen und QR-Codes. So sehen wir später, welche Kampagne Besucher in den Shop gebracht hat.</p>
      <div class="social-felder" id="socialBaukasten">
        <div class="field"><label for="socialZiel">Ziel</label>${auswahl('socialZiel', ziele, social.ziel)}</div>
        <div class="field" id="socialEigenFeld"${social.ziel === 'eigen' ? '' : ' hidden'}>
          <label for="socialEigen">Shop-Adresse</label>
          <input type="url" id="socialEigen" placeholder="https://www.teppich-paradies.net/products/…" value="${esc(social.eigeneAdresse)}" autocomplete="off">
        </div>
        <div class="field"><label for="socialKanal">Kanal</label>${auswahl('socialKanal', Object.entries(KANAELE).map(([w, k]) => [w, k.text]), social.kanal)}</div>
        <div class="field"><label for="socialArt">Art</label>${auswahl('socialArt', Object.entries(ARTEN), social.art)}</div>
        <div class="field"><label for="socialKampagne">Kampagne</label>
          <input type="text" id="socialKampagne" placeholder="z. B. Herbst 2026" value="${esc(social.kampagne)}" autocomplete="off">
        </div>
      </div>
      <div class="social-ergebnis" id="socialErgebnis" aria-live="polite">${ergebnisHtml()}</div>
    </section>`;
}

function weitereLinks() {
  // Die Zentrale laeuft auf demselben Mac wie das Control Center, nur auf Port 8020.
  const zentrale = `${location.protocol}//${location.hostname}:8020/`;
  const links = [
    [zentrale, 'Social-Zentrale'],
    ['https://www.instagram.com/teppich.paradies/', 'Instagram'],
    ['https://www.facebook.com/profile.php?id=100079849794255', 'Facebook'],
  ];
  return `<p class="social-weitere small">${links.map(([href, text]) =>
    `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(text)}</a>`).join('<span aria-hidden="true">·</span>')}</p>`;
}

export function viewSocial() {
  const kopf = `<div class="page-head"><div><h1>Social Media</h1>
      <p class="sub">Upload-Link fürs Team und Links für Kampagnen.</p></div></div>`;
  if (istNurLesend()) {
    return kopf + emptyState('Nur für Mitarbeiter.', 'Mit einem Lesezugang sind die Social-Media-Links nicht sichtbar.');
  }
  ensureZugaenge();
  return `${kopf}${weitereLinks()}<div class="social-raster">${uploadKarte()}${baukasten()}</div>`;
}

/** Baukasten: Eingaben merken und nur das Ergebnis neu schreiben - der Fokus bleibt im Feld. */
export function socialEingabe(e) {
  const el = e.target;
  if (!el?.id || !el.closest?.('#socialBaukasten')) return false;
  if (el.id === 'socialZiel') social.ziel = el.value;
  else if (el.id === 'socialEigen') social.eigeneAdresse = el.value;
  else if (el.id === 'socialKanal') social.kanal = el.value;
  else if (el.id === 'socialArt') social.art = el.value;
  else if (el.id === 'socialKampagne') social.kampagne = el.value;
  else return false;
  const eigen = document.getElementById('socialEigenFeld');
  if (eigen) eigen.hidden = social.ziel !== 'eigen';
  const aus = document.getElementById('socialErgebnis');
  if (aus) aus.innerHTML = ergebnisHtml();
  return true;
}

/** "Neuen Link anlegen" (nur Inhaber; der Server prueft das ebenfalls). */
export function socialAbsenden(e) {
  const form = e.target.closest?.('#socialLinkNeu');
  if (!form) return false;
  e.preventDefault();
  const name = document.getElementById('socialLinkName')?.value.trim() || '';
  if (!name) { toast('Bitte einen Namen eintragen, z. B. „Team“.', 'crit'); return true; }
  social.legtAn = true; render();
  orgSchreiben('/api/social/link-neu', { name })
    .then(d => { social.daten = d; toast(`Link für ${name} angelegt – jetzt kopieren`); })
    .catch(err => toast(err.message, 'crit'))
    .finally(() => { social.legtAn = false; render(); });
  return true;
}
