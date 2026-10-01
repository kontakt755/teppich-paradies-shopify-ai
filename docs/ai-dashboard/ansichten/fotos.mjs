/**
 * Ansicht "Fotos" (#/fotos): Baustellenfotos vom Handy einreichen (verkleinert im Browser)
 * und der Eingang der eingereichten Bilder.
 */
import { $, esc, fmtDate, toast } from '../kern/helfer.mjs';
import { fetchEinkauf, orgSchreiben } from '../kern/api.mjs';
import { render } from '../kern/render.mjs';
import { emptyState } from '../bausteine/karten.mjs';
import { ORG_STATUS_LABEL } from './organisation/gemeinsam.mjs';

// -- Baustellenfotos --------------------------------------------------------

/**
 * Der Weg vom Handy ins Haus. Die Monteure stehen im fertigen Raum, haben
 * schmutzige Hände und wenig Zeit: Fotos aussuchen, Auftragsnummer eintippen,
 * abschicken. Alles andere passiert hier.
 */
const fotos = {
  liste: null, loading: false, gewaehlt: [], sendet: false, vorschlag: null,
  // Auf der Baustelle tippt man einhaendig. Was eingegeben ist, muss ein
  // Neuzeichnen ueberleben - sonst steht man nach einem Fehlversuch wieder
  // vor leeren Feldern.
  auftrag: '', boden: '', notiz: '', einwilligung: false,
};

function fotoSrc(id, datei) {
  return `/api/org/anhang-lesen?${new URLSearchParams({ id, datei })}`;
}

function ensureFotos() {
  if (fotos.liste || fotos.loading) return;
  fotos.loading = true;
  fetchEinkauf('/api/fotos/liste').then(d => { fotos.liste = d; })
    .catch(() => { fotos.liste = { verfuegbar: false, eintraege: [] }; })
    .finally(() => { fotos.loading = false; render(); });
}

export function viewFotos() {
  ensureFotos();
  const d = fotos.liste;
  const gewaehlt = fotos.gewaehlt.length;

  const formular = `<form id="fotoForm" class="card foto-form">
    <h2 style="margin:0 0 4px">Fotos vom fertigen Raum</h2>
    <p class="small muted" style="margin:0 0 12px">Bilder aussuchen, Auftragsnummer eintippen, abschicken. Mehr ist es nicht.</p>

    <input class="visually-hidden" type="file" id="fotoDateien" accept="image/*" multiple>
    <label class="foto-upload" for="fotoDateien">
      <span class="foto-upload-plus" aria-hidden="true">+</span>
      <span><strong>Fotos auswählen</strong><small>Bis zu 20 Bilder – große Fotos werden automatisch verkleinert</small></span>
    </label>
    <p class="small ${gewaehlt ? '' : 'muted'}" id="fotoGewaehlt">${gewaehlt ? `${gewaehlt} ${gewaehlt === 1 ? 'Bild' : 'Bilder'} ausgewählt` : 'Noch nichts ausgewählt'}</p>

    <label class="small" for="fotoAuftrag">Auftragsnummer</label>
    <input type="text" id="fotoAuftrag" inputmode="numeric" placeholder="z. B. 1042" value="${esc(fotos.auftrag)}"
           style="width:100%;box-sizing:border-box;margin:4px 0 12px">

    <label class="small" for="fotoBoden">Welcher Boden? <span class="muted">(steht auf dem Auftragszettel)</span></label>
    <input type="text" id="fotoBoden" placeholder="z. B. Selene 620" value="${esc(fotos.boden)}"
           style="width:100%;box-sizing:border-box;margin:4px 0 4px">
    <p class="small" id="fotoProdukt" style="margin:0 0 12px">&nbsp;</p>

    <label class="small" for="fotoNotiz">Notiz <span class="muted">(optional – Raumgröße, Besonderheit)</span></label>
    <input type="text" id="fotoNotiz" placeholder="z. B. Wohnzimmer 4 × 5 m" value="${esc(fotos.notiz)}"
           style="width:100%;box-sizing:border-box;margin:4px 0 12px">

    <label class="small foto-einwilligung">
      <input type="checkbox" id="fotoEinwilligung"${fotos.einwilligung ? ' checked' : ''}>
      <span>Der Kunde ist damit einverstanden, dass wir die Fotos verwenden.
        <span class="muted">Ohne Zustimmung dürfen wir Bilder aus einer Wohnung nicht zeigen – dann bitte nicht abschicken.</span></span>
    </label>

    <button type="submit" class="btn btn-primary" id="fotoSenden"${fotos.sendet ? ' disabled' : ''}>${fotos.sendet ? 'Wird gesendet …' : 'Abschicken'}</button>
  </form>`;

  const galerie = !d ? `<div class="empty">Lade …</div>`
    : !d.eintraege.length
      ? emptyState('Noch keine Fotos eingegangen.', 'Das erste Mal dauert zwei Minuten – danach ist es Routine.')
      : `<div class="rows">${d.eintraege.map(e => `<div class="row">
          <div>
            <div class="t">${esc(e.titel)}</div>
            <div class="m">${e.produkt
              ? `<a href="https://www.teppich-paradies.net/products/${esc(e.produkt)}" target="_blank" rel="noopener">${esc(e.produktTitel || e.produkt)}</a>${e.farbe ? ` <span class="muted">· Farbe ${esc(e.farbe)}</span>` : ''}`
              : '<span class="muted">nicht im Shop – „exklusiv bei Teppich-Paradies"</span>'}
              ${e.sicher === false && e.produkt ? ' <span class="badge gap">bitte prüfen</span>' : ''}
              · von ${esc(e.wer)} · ${esc(fmtDate(e.erstelltAm))}</div>
            <div class="foto-band">${e.fotos.map(f => `<a href="${fotoSrc(e.id, f.datei)}" target="_blank" rel="noopener">
              <img src="${fotoSrc(e.id, f.datei)}" alt="${esc(f.name)}" loading="lazy"></a>`).join('')}</div>
          </div>
          <div class="r">
            <span class="badge status ${esc(String(e.status).toLowerCase())}">${esc(ORG_STATUS_LABEL[e.status] || e.status)}</span>
            <a class="btn btn-sm" href="#/organisation?oid=${encodeURIComponent(e.id)}">Öffnen</a>
          </div>
        </div>`).join('')}</div>`;

  return `<div class="page-head">
      <div><h1>Baustellenfotos</h1>
      <p class="sub">Fotos vom fertigen Raum – die Grundlage für unsere Beiträge.</p></div>
    </div>
    <div class="foto-layout">
      ${formular}
      <aside class="card foto-hilfe" aria-label="So entstehen gute Baustellenfotos">
        <span class="badge plain">In zwei Minuten erledigt</span>
        <h2>So werden die Bilder brauchbar</h2>
        <ol class="foto-schritte">
          <li><span>1</span><div><strong>Raum fertig machen</strong><small>Werkzeug und Verpackung aus dem Bild nehmen.</small></div></li>
          <li><span>2</span><div><strong>Übersicht und Details</strong><small>Ein Bild vom ganzen Raum, danach Übergänge und Kanten.</small></div></li>
          <li><span>3</span><div><strong>Auftrag zuordnen</strong><small>Auftragsnummer und Boden vom Auftragszettel eintragen.</small></div></li>
        </ol>
        <p class="small muted foto-datenschutz">Nur mit Zustimmung des Kunden abschicken. Die Bilder bleiben im internen Arbeitsbereich, bis sie geprüft wurden.</p>
      </aside>
    </div>
    <h2 style="margin:24px 0 8px">Eingegangen${d?.anzahl ? ` (${d.anzahl})` : ''}</h2>
    ${galerie}`;
}

/** Datei -> base64, ohne den Praefix "data:...;base64," */
function alsBase64(datei) {
  return new Promise((ja, nein) => {
    const leser = new FileReader();
    leser.onload = () => ja(String(leser.result).split(',')[1] || '');
    leser.onerror = () => nein(new Error(`„${datei.name}" ließ sich nicht lesen`));
    leser.readAsDataURL(datei);
  });
}

/** Lange Kante, auf die Fotos vor dem Hochladen verkleinert werden. */
const FOTO_MAX_KANTE = 2000;

/**
 * Ein Foto vom Handy hat 12 Megapixel und 3-5 MB. Fuer einen Beitrag und fuer
 * die Ablage reicht die lange Kante mit 2000 px; das spart auf der Baustelle
 * Mobilfunkdaten und haelt die Anfrage klein genug, dass sie ueberhaupt
 * ankommt (der Server nimmt 24 MB fuer den ganzen Schwung).
 *
 * Geht das Verkleinern nicht - unbekanntes Format, kein canvas, HEIC, das der
 * Browser nicht dekodiert -, wird die Datei unveraendert geschickt. Lieber ein
 * grosses Foto als gar keins; die Groessengrenze faengt den Rest ab.
 */
async function alsHochladbar(datei) {
  const unveraendert = async () => ({ name: datei.name, typ: datei.type, daten: await alsBase64(datei) });
  if (!/^image\//.test(datei.type) || typeof createImageBitmap !== 'function') return unveraendert();
  let bild = null;
  try {
    bild = await createImageBitmap(datei);
    const faktor = Math.min(1, FOTO_MAX_KANTE / Math.max(bild.width, bild.height));
    // Schon klein genug: nicht neu kodieren, das wuerde nur Qualitaet kosten.
    if (faktor === 1 && datei.size <= 1_500_000) return unveraendert();
    const flaeche = document.createElement('canvas');
    flaeche.width = Math.max(1, Math.round(bild.width * faktor));
    flaeche.height = Math.max(1, Math.round(bild.height * faktor));
    flaeche.getContext('2d').drawImage(bild, 0, 0, flaeche.width, flaeche.height);
    const klein = await new Promise(ja => flaeche.toBlob(ja, 'image/jpeg', 0.82));
    // Wenn das Ergebnis nicht kleiner ist, hat das Verkleinern nichts gebracht.
    if (!klein || klein.size >= datei.size) return unveraendert();
    return { name: datei.name.replace(/\.[^.]+$/, '') + '.jpg', typ: 'image/jpeg', daten: await alsBase64(klein) };
  } catch {
    return unveraendert();
  } finally {
    bild?.close?.();
  }
}

async function fotosAbschicken() {
  if (fotos.sendet) return;
  const dateien = fotos.gewaehlt;
  if (!dateien.length) { toast('Bitte zuerst Fotos auswählen', 'crit'); return; }
  if (!$('#fotoEinwilligung')?.checked) { toast('Ohne die Zustimmung des Kunden geht es nicht', 'crit'); return; }

  const auftrag = $('#fotoAuftrag')?.value ?? fotos.auftrag;
  const boden = $('#fotoBoden')?.value ?? fotos.boden;
  const notiz = $('#fotoNotiz')?.value ?? fotos.notiz;
  Object.assign(fotos, { auftrag, boden, notiz, einwilligung: true });
  if (!auftrag.trim() && !boden.trim()) { toast('Bitte Auftragsnummer oder Boden angeben', 'crit'); return; }

  fotos.sendet = true; render();
  try {
    const fertig = [];
    for (const f of dateien) {
      // eslint-disable-next-line no-await-in-loop -- nacheinander, damit nicht 20 Bilder gleichzeitig im Speicher liegen.
      fertig.push(await alsHochladbar(f));
    }
    // base64 macht aus drei Bytes vier; der Server nimmt 24 MB. Lieber hier
    // mit klarem Satz abbrechen als drueben mit "Request zu groß".
    const roh = fertig.reduce((summe, f) => summe + f.daten.length, 0);
    if (roh > 22_000_000) {
      toast(`Zusammen zu groß (${(roh / 1_048_576).toFixed(0)} MB). Bitte in zwei Schwüngen schicken.`, 'crit');
      return;
    }
    const r = await orgSchreiben('/api/fotos/neu', { auftrag, boden, notiz, einwilligung: true, fotos: fertig });
    toast(`${r.anzahl} ${r.anzahl === 1 ? 'Foto' : 'Fotos'} angekommen – ${r.produkt.text}`);
    // Erst nach dem Erfolg leeren - bei einem Fehler bleibt alles stehen.
    Object.assign(fotos, { gewaehlt: [], liste: null, vorschlag: null, auftrag: '', boden: '', notiz: '', einwilligung: false });
  } catch (err) {
    toast(`Fehler: ${err.message}`, 'crit');
  } finally {
    fotos.sendet = false; render();
  }
}

/** Fotoeingang: Formular abschicken und Eingaben merken (eigene Listener, Reihenfolge wie bisher vor dem Klick-Listener). */
export function fotosEreignisseBinden() {
  document.addEventListener('submit', e => {
    if (!e.target.closest('#fotoForm')) return;
    e.preventDefault();
    fotosAbschicken();
  });
  let bodenTimer;
  document.addEventListener('input', e => {
    const feldId = e.target.id;
    if (feldId === 'fotoAuftrag') { fotos.auftrag = e.target.value; return; }
    if (feldId === 'fotoNotiz') { fotos.notiz = e.target.value; return; }
    if (feldId === 'fotoBoden') fotos.boden = e.target.value;
    if (!e.target.closest('#fotoBoden')) return;
    const feld = e.target;
    clearTimeout(bodenTimer);
    bodenTimer = setTimeout(async () => {
      const ziel = $('#fotoProdukt');
      if (!ziel || !document.contains(feld)) return;          // Ansicht gewechselt
      const wert = feld.value.trim();
      if (wert.length < 3) { ziel.innerHTML = '&nbsp;'; return; }
      try {
        const d = await fetchEinkauf(`/api/fotos/produkt?${new URLSearchParams({ boden: wert })}`);
        if (!document.contains(feld) || feld.value.trim() !== wert) return;   // Antwort veraltet
        ziel.textContent = d.hinweis.text;
        ziel.className = d.hinweis.handle ? 'small ok' : 'small muted';
      } catch { /* Vorschlag ist Beiwerk - eine Stoerung darf das Formular nicht blockieren */ }
    }, 300);
  });
}

/** Fotoeingang: Einwilligung und Bildauswahl. Gibt true zurueck, wenn die Aenderung damit erledigt ist. */
export function fotosAenderung(e) {
  if (e.target.id === 'fotoEinwilligung') { fotos.einwilligung = e.target.checked; return true; }
  const bilder = e.target.closest('#fotoDateien');
  if (bilder) {
    const zuGross = [...bilder.files].filter(f => f.size > 10 * 1024 * 1024);
    if (zuGross.length) toast(`${zuGross.length} ${zuGross.length === 1 ? 'Bild ist' : 'Bilder sind'} größer als 10 MB und bleiben draußen`, 'crit');
    fotos.gewaehlt = [...bilder.files].filter(f => f.size <= 10 * 1024 * 1024).slice(0, 20);
    const zeile = $('#fotoGewaehlt');
    if (zeile) zeile.textContent = fotos.gewaehlt.length
      ? `${fotos.gewaehlt.length} ${fotos.gewaehlt.length === 1 ? 'Bild' : 'Bilder'} ausgewählt`
      : 'Noch nichts ausgewählt';
    return true;
  }
  return false;
}
