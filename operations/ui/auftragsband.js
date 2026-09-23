// Auftragsband - Vanilla ES-Modul, kein Framework, kein Build.
// EIN Auftrag gross auf dem Schirm. Daten kommen ausschliesslich aus
// operations/server.mjs; hier wird nichts gerechnet und nichts geraten.

const UNGEKLAERT = 'UNGEKLAERT';

const el = id => document.getElementById(id);
const knoten = { kontext: el('kontext'), liste: el('liste'), warteschlange: el('warteschlange'), karte: el('karte'), suchergebnis: el('suchergebnis'), treffer: el('treffer'), melder: el('melder') };

const zustand = { rolle: null, reihe: [], index: -1, karte: null, von: localStorage.getItem('ops-von') || '' };

function melde(text, fehler = false) {
  knoten.melder.textContent = text;
  knoten.melder.classList.toggle('fehler', !!fehler);
}

async function hole(pfad, optionen) {
  const res = await fetch(pfad, optionen);
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { error: text }; }
  if (!res.ok) throw new Error(body && body.error ? body.error : `HTTP ${res.status}`);
  return body;
}

function datumDe(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '–' : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function zeigen(welcher) {
  for (const a of [knoten.liste, knoten.karte, knoten.suchergebnis]) a.classList.toggle('versteckt', a !== welcher);
}

function text(wert) {
  return wert === null || wert === undefined || wert === '' ? '–' : String(wert);
}

function ungeklaert(wert) {
  return wert === UNGEKLAERT ? '<span class="flag">UNGEKLAERT</span>' : esc(wert);
}

function esc(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// --- Kontext und Warteschlange ---

async function ladeKontext() {
  const k = await hole('/api/kontext');
  zustand.rolle = k.rolle;
  const quelle = k.quelle.art === 'live' ? 'live' : `Momentaufnahme vom ${datumDe(k.quelle.stand)}`;
  knoten.kontext.textContent = `Rolle ${k.rolle} · ${quelle} · ${k.anzahl} Bestellungen`;
  return k;
}

async function ladeWarteschlange() {
  const w = await hole('/api/warteschlange');
  zustand.reihe = w.auftraege;
  knoten.warteschlange.replaceChildren(...w.auftraege.map((a, i) => {
    const li = document.createElement('li');
    li.tabIndex = 0;
    li.innerHTML = `<span class="punkt p-${esc(a.ampel)}"></span><span class="wz"><b>${esc(a.name)}</b> · ${esc(a.status)}<small>${datumDe(a.datum)}${a.hinweise.length ? ' · ' + esc(a.hinweise.join(' · ')) : ''}</small></span>`;
    li.addEventListener('click', () => oeffne(i));
    li.addEventListener('keydown', e => { if (e.key === 'Enter') oeffne(i); });
    return li;
  }));
  if (!w.auftraege.length) knoten.warteschlange.innerHTML = '<li>Keine offenen Aufträge.</li>';
}

// --- Eine Auftragskarte ---

async function oeffne(index) {
  if (index < 0 || index >= zustand.reihe.length) { melde('Kein weiterer Auftrag.'); return; }
  zustand.index = index;
  const name = zustand.reihe[index].name;
  zustand.karte = await hole(`/api/auftrag/${encodeURIComponent(name)}`);
  zeichne(zustand.karte);
  zeigen(knoten.karte);
}

function bandHtml(band) {
  return `<ul class="band">${band.map(s => `<li class="${esc(s.farbe)}">${esc(s.station)}</li>`).join('')}</ul>`;
}

function positionHtml(p) {
  const bild = p.bild ? `<img src="${esc(p.bild)}" alt="">` : '<span class="platzhalter" aria-hidden="true"></span>';
  const mass = p.masspruefung && ['abweichung', 'unlesbar', 'waise'].includes(p.masspruefung.status)
    ? `<p class="warnung">Maßprüfung: ${esc(p.masspruefung.status)}${p.masspruefung.hinweis ? ' – ' + esc(p.masspruefung.hinweis) : ''}</p>` : '';
  return `<li>
    ${bild}
    <span class="pd">
      <b>${esc(p.titel)}</b> · ${esc(p.farbe)}
      <small>Großhändler-ID ${ungeklaert(p.grosshaendlerId)}${p.idGrund ? ' – ' + esc(p.idGrund) : ''} · Lieferant ${ungeklaert(p.lieferant)}</small>
      <small>Kunde: ${esc(p.kundenmenge)} · Einkauf: ${ungeklaert(p.einkaufsmenge.menge === UNGEKLAERT ? UNGEKLAERT : p.einkaufsmenge.text)}${p.einkaufsmenge.grund ? ' (' + esc(p.einkaufsmenge.grund) + ')' : ''}</small>
      <small>Route ${ungeklaert(p.route.route)} · Ampel ${esc(p.ampel)}</small>
      ${mass}
    </span>
  </li>`;
}

function zeichne(k) {
  const kunde = k.kunde;
  const adresse = a => (a.text === UNGEKLAERT ? '<span class="flag">UNGEKLAERT</span>' : esc(a.text).replace(/\n/g, '<br>'));
  knoten.karte.innerHTML = `
    <div class="auftragkopf">
      <h2>${esc(k.name)} – ${ungeklaert(kunde.name)}</h2>
      <span class="meta">${datumDe(k.datum)} · ${ungeklaert(k.bestellwert.text)} · Zahlung ${esc(k.zahlung)} · Status ${esc(k.status)} (${esc(k.statusQuelle)})</span>
    </div>

    <div class="block">${bandHtml(k.statusband)}</div>

    <div class="block">
      <h2>Kunde</h2>
      <p>${ungeklaert(kunde.telefon)} · ${ungeklaert(kunde.email)}</p>
      <div class="chips">
        <span class="chip">Beratung: <b>${esc(k.beratung.gewuenscht)}</b></span>
        <span class="chip${k.beratung.gewuenscht === 'Ja' && k.beratung.telefon === 'fehlt' ? ' schlecht' : ''}">Telefon: <b>${esc(k.beratung.telefon)}</b></span>
        <span class="chip">Verlegung: <b>${esc(k.beratung.verlegung)}</b></span>
        <span class="chip${k.checks.masspruefung === 'Problem' ? ' schlecht' : ''}">Maßprüfung: <b>${esc(k.checks.masspruefung)}</b></span>
      </div>
      <p><b>Lieferadresse</b><br>${adresse(kunde.lieferadresse)}</p>
      <p><b>Rechnungsadresse</b><br>${adresse(kunde.rechnungsadresse)}</p>
      <div class="schnell">
        ${kunde.telefon !== UNGEKLAERT ? `<a href="tel:${esc(kunde.telefon.replace(/\s/g, ''))}">Anrufen</a>` : ''}
        ${kunde.email !== UNGEKLAERT ? `<a href="mailto:${esc(kunde.email)}">E-Mail</a>` : ''}
        <button type="button" data-kopieren="adresse">Adresse kopieren</button>
        ${k.adminUrl ? `<a href="${esc(k.adminUrl)}" target="_blank" rel="noopener">Im Admin öffnen</a>` : ''}
      </div>
      <details><summary>Historie</summary><div id="historie">wird geladen …</div></details>
    </div>

    ${k.hinweise.length ? `<p class="warnung">${esc(k.hinweise.join(' · '))}</p>` : ''}

    <div class="block">
      <h2>Positionen</h2>
      <ul class="pos">${k.positionen.map(positionHtml).join('')}</ul>
    </div>

    <div class="aktionen">
      <button type="button" class="k-frei" data-aktion="freigeben">FREIGEBEN</button>
      <button type="button" class="k-spaeter" data-aktion="spaeter">SPÄTER</button>
      <button type="button" class="k-problem" data-aktion="problem">PROBLEM</button>
    </div>`;

  const hist = el('historie');
  if (hist) hist.textContent = `${k.status} – Quelle: ${k.statusQuelle}. Frühere Schritte stehen im lokalen Zustandsspeicher.`;

  knoten.karte.querySelectorAll('[data-aktion]').forEach(b => b.addEventListener('click', () => frage(b.dataset.aktion)));
  const kopf = knoten.karte.querySelector('[data-kopieren]');
  if (kopf) kopf.addEventListener('click', async () => {
    const t = k.kunde.lieferadresse.text;
    try { await navigator.clipboard.writeText(t); melde('Adresse kopiert.'); } catch { melde('Kopieren nicht möglich.', true); }
  });
}

// --- Aktionen mit Bestaetigungsschritt ---

const dialog = el('bestaetigung');

// FREIGEBEN und PROBLEM sind nicht ohne Weiteres rueckholbar: ein Tastendruck
// allein darf sie nicht ausloesen, deshalb immer der kleine Dialog.
function frage(aktion) {
  if (!zustand.karte) return;
  const titel = { freigeben: 'Auftrag freigeben', spaeter: 'Auf später legen', problem: 'Als Problem melden' }[aktion];
  el('bestaetigungstitel').textContent = titel;
  el('bestaetigungstext').textContent = `${zustand.karte.name} – ${titel}?`;
  el('von').value = zustand.von;
  el('grund').value = '';
  el('grundfeld').style.display = aktion === 'freigeben' ? 'none' : 'block';
  el('grund').required = aktion === 'problem';
  dialog.returnValue = 'abbruch';
  dialog.dataset.aktion = aktion;
  dialog.showModal();
  el('von').focus();
}

dialog.addEventListener('close', async () => {
  if (dialog.returnValue !== 'ok') return;
  const aktion = dialog.dataset.aktion;
  const von = el('von').value.trim();
  const grund = el('grund').value.trim();
  if (!von) { melde('Mitarbeitername fehlt.', true); return; }
  if (aktion === 'problem' && !grund) { melde('PROBLEM braucht einen Grund.', true); return; }
  zustand.von = von;
  localStorage.setItem('ops-von', von);
  try {
    const r = await hole(`/api/auftrag/${encodeURIComponent(zustand.karte.name)}/${aktion}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ von, grund: grund || undefined }),
    });
    melde(`${zustand.karte.name}: ${r.eintrag.status}.`);
    await ladeWarteschlange();
    const i = zustand.reihe.findIndex(a => a.name === r.naechster);
    if (i >= 0) await oeffne(i); else { zeigen(knoten.liste); zustand.index = -1; }
  } catch (err) {
    melde(err.message, true);
  }
});

// --- Suche ---

el('suchform').addEventListener('submit', async e => {
  e.preventDefault();
  const q = el('suchfeld').value.trim();
  if (!q) { zeigen(knoten.liste); return; }
  try {
    const r = await hole(`/api/suche?q=${encodeURIComponent(q)}`);
    knoten.treffer.replaceChildren(...r.treffer.map(t => {
      const li = document.createElement('li');
      li.tabIndex = 0;
      li.innerHTML = `<span class="wz"><b>${esc(t.name)}</b><small>${esc(t.treffer.join(' · '))}</small></span>`;
      const auf = async () => {
        zustand.karte = await hole(`/api/auftrag/${encodeURIComponent(t.name)}`);
        zeichne(zustand.karte); zeigen(knoten.karte);
      };
      li.addEventListener('click', auf);
      li.addEventListener('keydown', ev => { if (ev.key === 'Enter') auf(); });
      return li;
    }));
    if (!r.treffer.length) knoten.treffer.innerHTML = '<li>Kein Treffer.</li>';
    zeigen(knoten.suchergebnis);
    melde(`${r.treffer.length} Treffer.`);
  } catch (err) { melde(err.message, true); }
});

// --- Tastatur ---

document.addEventListener('keydown', e => {
  if (dialog.open) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) {
    if (e.key === 'Escape') { t.blur(); }
    return;
  }
  if (e.key === 'Escape') { zeigen(knoten.liste); return; }
  if (knoten.karte.classList.contains('versteckt')) return;
  if (e.key === 'Enter') { e.preventDefault(); frage('freigeben'); }
  else if (e.key === 's' || e.key === 'S') { frage('spaeter'); }
  else if (e.key === 'p' || e.key === 'P') { frage('problem'); }
  else if (e.key === 'ArrowRight') { oeffne(zustand.index + 1).catch(err => melde(err.message, true)); }
  else if (e.key === 'ArrowLeft') { oeffne(zustand.index - 1).catch(err => melde(err.message, true)); }
});

// --- Start ---

(async function start() {
  try {
    const k = await ladeKontext();
    if (k.bereiche.includes('auftraege_lesen')) await ladeWarteschlange();
    else knoten.warteschlange.innerHTML = `<li>Rolle ${esc(k.rolle)} sieht keine Aufträge (Bereiche: ${esc(k.bereiche.join(', '))}).</li>`;
    zeigen(knoten.liste);
  } catch (err) { melde(err.message, true); }
})();
