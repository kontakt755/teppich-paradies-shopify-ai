/* Social-Zentrale: eine Seite, fuenf Reiter, kein Framework. */
'use strict';

const $ = (s, w = document) => w.querySelector(s);
const esc = t => String(t ?? '').replace(/[&<>"']/g, z => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[z]));
const zeit = iso => (iso ? new Date(iso).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–');
const tag = iso => (iso ? new Date(iso).toLocaleDateString('de-DE', { weekday: 'long' }) : '');
/** ISO -> Wert fuer <input type="datetime-local"> in Ortszeit. */
const lokal = iso => { if (!iso) return ''; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

const zustand = { daten: null, reiter: location.hash.slice(1) || 'heute', bearbeite: new Set() };

function melde(text, fehler = false) {
  const m = $('#meldung'); m.textContent = text; m.hidden = false; m.classList.toggle('fehler', fehler);
  clearTimeout(melde.t); melde.t = setTimeout(() => { m.hidden = true; }, fehler ? 7000 : 3000);
}

async function api(pfad, body) {
  const r = await fetch(pfad, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  if (r.status === 401) { location.reload(); throw new Error('Anmeldung erforderlich'); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Fehler ${r.status}`);
  return d;
}

async function lade() {
  zustand.daten = await api('/api/stand');
  zeichne();
}

function plattformMarken(b) {
  return b.plattformen.map(p => `<span class="marke">${p === 'instagram' ? 'Instagram' : 'Facebook'}</span>`).join(' ');
}

function bilder(b) {
  if (b.video) return `<div class="bilder story"><video src="${esc(b.video)}" poster="${esc(b.bilder[0] ?? '')}" controls playsinline preload="metadata"></video></div>`;
  const klasse = ['bilder', b.format === 'story' ? 'story' : '', b.bilder.length > 1 ? 'mehr' : ''].join(' ');
  return `<div class="${klasse}">${b.bilder.map(u => `<img src="${esc(u)}" alt="" loading="lazy">`).join('')}</div>`;
}

function hinweise(b) {
  const s = b.sperren.length ? `<div class="hinweis sperre"><ul>${b.sperren.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
  const h = b.hinweise.length ? `<div class="hinweis"><ul>${b.hinweise.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
  const f = b.fehler ? `<div class="hinweis sperre">${esc(b.fehler)}</div>` : '';
  return f + s + h;
}

function karteFreigabe(b, darf) {
  const offen = zustand.bearbeite.has(b.id);
  const formatName = { feed: 'Beitrag', karussell: `Karussell · ${b.bilder.length} Bilder`, story: 'Story', reel: 'Reel' }[b.format];
  const kopf = `<div class="zeile"><span class="marke rot">${esc(b.inhalt.typLabel)}</span><span class="marke">${esc(formatName)}</span>${plattformMarken(b)}</div>
    <h3>${esc(b.inhalt.titel)}</h3>
    <p class="leise">Geplant: <b>${esc(zeit(b.geplantAm))}</b>${b.inhalt.eingereichtVon ? ` · von ${esc(b.inhalt.eingereichtVon)}` : ''}${b.inhalt.grund ? ` · ${esc(b.inhalt.grund)}` : ''}</p>`;
  const inhalt = offen
    ? `<label for="t${b.id}">Text</label><textarea id="t${b.id}">${esc(b.text)}</textarea>
       <label for="h${b.id}">Hashtags</label><input type="text" id="h${b.id}" value="${esc(b.hashtags)}">
       <label for="d${b.id}">Termin</label><input type="datetime-local" id="d${b.id}" value="${esc(lokal(b.geplantAm))}">
       <div style="margin-top:12px">${['instagram', 'facebook'].map(p => `<label class="wahl"><input type="checkbox" data-plattform="${p}" ${b.plattformen.includes(p) ? 'checked' : ''}> ${p === 'instagram' ? 'Instagram' : 'Facebook'}</label>`).join('')}</div>`
    : (b.format === 'story' ? '<p class="leise" style="margin-top:8px">Storys erscheinen ohne Begleittext – es zählt, was im Bild steht.</p>' : `<p class="text">${esc(b.text)}</p><p class="tags">${esc(b.hashtags)}</p>`);
  const knoepfe = !darf ? '<p class="leise">Freigeben und Ändern macht der Inhaber.</p>'
    : offen
      ? `<button class="knopf haupt" data-tat="speichern" data-id="${b.id}">Speichern</button><button class="knopf still" data-tat="abbrechen" data-id="${b.id}">Abbrechen</button>`
      : `${b.inhalt.einwilligung ? '' : `<button class="knopf" data-tat="beitrag-einwilligung" data-id="${b.id}" data-inhalt="${b.inhalt.id}">Einwilligung liegt vor</button>`}<button class="knopf haupt" data-tat="freigeben" data-id="${b.id}" ${b.sperren.length ? 'disabled' : ''}>Freigeben</button>
         <button class="knopf" data-tat="bearbeiten" data-id="${b.id}">Bearbeiten</button>
         <button class="knopf still" data-tat="verwerfen" data-id="${b.id}">Verwerfen</button>`;
  return `<article class="karte beitrag" id="b${b.id}"><div>${bilder(b)}</div><div>${kopf}${hinweise(b)}${inhalt}<div class="knoepfe">${knoepfe}</div></div></article>`;
}

const AKTION = {
  'entwurf-erstellt': 'Entwurf erstellt', 'beitrag-freigegeben': 'Beitrag freigegeben', 'beitrag-verworfen': 'Entwurf verworfen',
  'beitrag-bearbeitet': 'Entwurf bearbeitet', 'beitrag-zurueckgeholt': 'Beitrag zurück in die Freigabe', 'shop-abgleich': 'Shop abgeglichen',
  'referenzen-import': 'Referenzen übernommen', 'baustelle-eingang': 'Neue Baustellenfotos', 'baustelle-geprueft': 'Baustellenfotos geprüft',
  sichtung: 'Bild gesichtet', veroeffentlicht: 'Veröffentlicht', fehler: 'Veröffentlichung fehlgeschlagen', 'neuer-versuch': 'Veröffentlichung wird wiederholt',
  'termin-verpasst': 'Termin verpasst', 'inhalt-verworfen': 'Material nicht verwendet', 'inhalt-geaendert': 'Angaben ergänzt',
};
const AKTEUR = { redaktion: 'Redaktion', 'shop-scout': 'Shop-Scout', eingang: 'Eingang', publisher: 'Publisher', import: 'Import', system: 'System' };

function ansichtHeute(d) {
  const u = d.uebersicht;
  const geplant = u.geplant.length
    ? u.geplant.slice(0, 8).map(g => `<li><b style="font-size:16px">${esc(tag(g.geplantAm))}</b> – ${esc(g.typLabel)}${g.format === 'story' ? ' (Story)' : ''}<br><span class="leise">${esc(zeit(g.geplantAm))} · ${esc(g.titel)}</span></li>`).join('')
    : '<li class="leise">Noch nichts freigegeben.</li>';
  return `<div class="kacheln">
    <section class="kachel"><h3>Neue Inhalte</h3><ul>
      <li><b>${u.neu.baustellenbilder}</b>neue Baustellenbilder</li>
      <li><b>${u.neu.produkte}</b>neue Produktanlässe</li>
      <li><b>${u.neu.videos}</b>neue Videos</li></ul></section>
    <section class="kachel"><h3>Content vorbereitet</h3><ul>
      <li><b>${u.vorbereitet.posts}</b>Posts</li>
      <li><b>${u.vorbereitet.storys}</b>Storys</li>
      <li><b>${u.vorbereitet.reels}</b>Reels</li></ul></section>
    <section class="kachel ${u.freigabe ? 'ruf' : ''}"><h3>Freigabe erforderlich</h3><ul>
      <li><b>${u.freigabe}</b>Inhalte</li>
      ${u.fehler ? `<li><b>${u.fehler}</b>mit Fehler</li>` : ''}</ul>
      ${u.freigabe ? '<div class="knoepfe"><button class="knopf haupt" data-gehe="freigabe">Jetzt ansehen</button></div>' : ''}</section>
    <section class="kachel"><h3>Geplant</h3><ul>${geplant}</ul></section>
  </div>
  ${d.meta.bereit ? '' : '<div class="hinweis" style="margin-top:16px">Instagram und Facebook sind noch nicht verbunden. Freigegebene Beiträge warten, bis der Meta-Zugang eingerichtet ist (Anleitung: social/META-EINRICHTUNG.md).</div>'}
  <h2>Zuletzt passiert</h2>
  <div class="liste">${d.verlauf.slice(0, 10).map(e => `<div class="eintrag"><div class="mitte"><b>${esc(AKTION[e.aktion] || e.aktion)}</b><span class="leise">${esc(zeit(e.zeit))} · ${esc(AKTEUR[e.akteur] || e.akteur)}${e.objekt ? ` · ${esc(e.objekt.replace('beitrag:', 'Beitrag ').replace('inhalt:', 'Inhalt ').replace('medium:', 'Bild '))}` : ''}</span></div></div>`).join('') || '<div class="leer">Noch nichts.</div>'}</div>`;
}

function ansichtFreigabe(d) {
  const karten = [...d.fehler, ...d.freigabe];
  if (!karten.length) return '<div class="leer">Nichts freizugeben. Neue Entwürfe erscheinen hier automatisch.</div>';
  return `<div class="karten">${karten.map(b => karteFreigabe(b, d.darfFreigeben)).join('')}</div>`;
}

function ansichtPlan(d) {
  const zeilen = d.geplant.map(b => `<div class="eintrag">${b.bilder[0] ? `<img src="${esc(b.bilder[0])}" alt="">` : ''}<div class="mitte"><b>${esc(tag(b.geplantAm))}, ${esc(zeit(b.geplantAm))}</b><span class="leise">${esc(b.inhalt.typLabel)}${b.format === 'story' ? ' (Story)' : ''} · ${esc(b.inhalt.titel)}</span></div>${d.darfFreigeben ? `<button class="knopf klein still" data-tat="zurueck" data-id="${b.id}">Zurückholen</button>` : ''}</div>`).join('');
  const vorschlag = d.freigabe.filter(b => b.geplantAm).map(b => `<div class="eintrag" style="opacity:.75">${b.bilder[0] ? `<img src="${esc(b.bilder[0])}" alt="">` : ''}<div class="mitte"><b>${esc(tag(b.geplantAm))}, ${esc(zeit(b.geplantAm))}</b><span class="leise">Vorschlag, wartet auf Freigabe · ${esc(b.inhalt.typLabel)} · ${esc(b.inhalt.titel)}</span></div></div>`).join('');
  return `<h2>Freigegeben und geplant</h2><div class="liste">${zeilen || '<div class="leer">Noch nichts freigegeben.</div>'}</div>
    <h2>Vorschläge des Planers</h2><div class="liste">${vorschlag || '<div class="leer">Keine offenen Vorschläge.</div>'}</div>`;
}

function ansichtVorrat(d) {
  if (!d.vorrat.length) return '<div class="leer">Der Vorrat ist leer. Neue Baustellenfotos und Produktanlässe erscheinen hier.</div>';
  return `<p class="leise" style="margin:8px 0 12px">Material, aus dem noch kein Beitrag entstanden ist. Die Redaktion arbeitet den Vorrat täglich ab; „Entwurf erstellen“ baut sofort einen Vorschlag mit Standardtext.</p>
  <div class="liste">${d.vorrat.map(i => `<div class="karte"><div class="zeile"><span class="marke rot">${esc(i.typLabel)}</span><span class="marke">${esc(i.status)}</span><span class="marke">${esc({ baustelle: 'Baustelle', shopify: 'Shop', referenz: 'Referenz', laden: 'Laden', wissen: 'Wissen' }[i.quelle] || i.quelle)}</span></div>
    <h3>${esc(i.titel)}</h3><p class="leise">${esc([i.grund, i.eingereichtVon && `von ${i.eingereichtVon}`].filter(Boolean).join(' · '))}</p>
    <div class="daumen">${i.medien.map(m => (m.art === 'video' ? '<span class="marke">Video</span>' : `<img src="${esc(m.bild)}" alt="" loading="lazy">`)).join('')}</div>
    ${i.einwilligung ? '' : '<div class="hinweis sperre">Keine Einwilligung hinterlegt – vor dem Veröffentlichen den Auftragszettel prüfen.</div>'}
    ${d.darfFreigeben ? `<div class="knoepfe">${i.einwilligung ? '' : `<button class="knopf klein" data-tat="einwilligung" data-id="${i.id}">Einwilligung liegt vor</button>`}<button class="knopf klein" data-tat="entwurf" data-id="${i.id}">Entwurf erstellen</button><button class="knopf klein still" data-tat="inhalt-verwerfen" data-id="${i.id}">Nicht verwenden</button></div>` : ''}</div>`).join('')}</div>`;
}

function ansichtAuswertung(d) {
  const l = d.lernstand;
  const saetze = (l?.erkenntnisse ?? ['Noch keine Auswertung. Sie entsteht, sobald Beiträge veröffentlicht sind.']).map(s => `<li>${esc(s)}</li>`).join('');
  const summe = (k, feld) => k.reduce((a, x) => a + (x[feld] || 0), 0);
  const zeilen = d.veroeffentlicht.map(b => `<tr><td>${esc(zeit(b.veroeffentlichtAm))}</td><td>${esc(b.inhalt.typLabel)}<br><span class="leise">${esc(b.inhalt.titel)}</span></td>
    <td class="z">${summe(b.kennzahlen, 'reichweite')}</td><td class="z">${summe(b.kennzahlen, 'profilbesuche')}</td><td class="z">${summe(b.kennzahlen, 'linkKlicks')}</td><td class="z">${summe(b.kennzahlen, 'gespeichert')}</td><td class="z">${summe(b.kennzahlen, 'kommentare')}</td><td class="z"><b>${Math.round(summe(b.kennzahlen, 'punkte'))}</b></td></tr>`).join('');
  return `<section class="karte"><h3>Was wir gelernt haben</h3><ul style="margin:10px 0 0;padding-left:20px">${saetze}</ul>
    <p class="leise" style="margin-top:10px">Gewertet werden Shop-Klicks, Profilbesuche, gespeicherte und geteilte Beiträge und Kommentare – Likes zählen kaum.</p></section>
    <h2>Veröffentlichte Beiträge</h2>
    ${zeilen ? `<div class="rollen"><table class="tabelle"><thead><tr><th>Datum</th><th>Beitrag</th><th class="z">Reichweite</th><th class="z">Profil</th><th class="z">Klicks</th><th class="z">Gespeichert</th><th class="z">Kommentare</th><th class="z">Punkte</th></tr></thead><tbody>${zeilen}</tbody></table></div>` : '<div class="leer">Noch nichts veröffentlicht.</div>'}`;
}

function zeichne() {
  const d = zustand.daten; if (!d) return;
  const ansichten = { heute: ansichtHeute, freigabe: ansichtFreigabe, plan: ansichtPlan, vorrat: ansichtVorrat, auswertung: ansichtAuswertung };
  if (!ansichten[zustand.reiter]) zustand.reiter = 'heute';
  $('#inhalt').innerHTML = ansichten[zustand.reiter](d);
  document.querySelectorAll('#reiter button').forEach(b => (b.dataset.reiter === zustand.reiter ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  $('#zFreigabe').textContent = d.uebersicht.freigabe + d.uebersicht.fehler || '';
  $('#zVorrat').textContent = d.vorrat.length || '';
  const meta = $('#metaStatus'); meta.textContent = d.meta.bereit ? 'Meta verbunden' : 'Meta nicht verbunden'; meta.className = `marke ${d.meta.bereit ? 'gut' : 'warn'}`;
  if (d.benutzer) { $('#unterzeile').textContent = `Angemeldet: ${d.benutzer.name}`; $('#abmelden').hidden = false; }
}

async function tat(knopf) {
  const id = Number(knopf.dataset.id); const art = knopf.dataset.tat;
  if (art === 'bearbeiten') { zustand.bearbeite.add(id); return zeichne(); }
  if (art === 'abbrechen') { zustand.bearbeite.delete(id); return zeichne(); }
  knopf.disabled = true;
  try {
    if (art === 'speichern') {
      const karte = $(`#b${id}`);
      await api(`/api/beitrag/${id}/bearbeiten`, {
        text: $(`#t${id}`).value, hashtags: $(`#h${id}`).value,
        geplantAm: $(`#d${id}`).value ? new Date($(`#d${id}`).value).toISOString() : null,
        plattformen: [...karte.querySelectorAll('[data-plattform]:checked')].map(c => c.dataset.plattform),
      });
      zustand.bearbeite.delete(id); melde('Gespeichert');
    } else if (art === 'freigeben') { await api(`/api/beitrag/${id}/freigeben`, {}); melde('Freigegeben – erscheint zum geplanten Termin'); }
    else if (art === 'verwerfen') { if (!confirm('Diesen Entwurf verwerfen?')) return; await api(`/api/beitrag/${id}/verwerfen`, { grund: '' }); melde('Verworfen'); }
    else if (art === 'zurueck') { await api(`/api/beitrag/${id}/zurueck`, {}); melde('Zurück in der Freigabe'); }
    else if (art === 'entwurf') { melde('Entwurf wird gebaut …'); await api(`/api/inhalt/${id}/entwurf`, {}); melde('Entwurf liegt in der Freigabe'); }
    else if (art === 'einwilligung' || art === 'beitrag-einwilligung') {
      if (!confirm('Liegt die Einwilligung des Kunden schriftlich vor (Auftragszettel)?')) return;
      await api(`/api/inhalt/${art === 'einwilligung' ? id : Number(knopf.dataset.inhalt)}/einwilligung`, {}); melde('Einwilligung vermerkt');
    }
    else if (art === 'inhalt-verwerfen') { if (!confirm('Dieses Material nicht verwenden?')) return; await api(`/api/inhalt/${id}/verwerfen`, {}); }
    await lade();
  } catch (e) { melde(e.message, true); } finally { knopf.disabled = false; }
}

document.addEventListener('click', (e) => {
  const r = e.target.closest('[data-reiter],[data-gehe]');
  if (r) { zustand.reiter = r.dataset.reiter || r.dataset.gehe; location.hash = zustand.reiter; zeichne(); window.scrollTo(0, 0); return; }
  const k = e.target.closest('[data-tat]');
  if (k) tat(k);
});
$('#abmelden').addEventListener('click', async () => { await api('/api/logout', {}); location.reload(); });

window.addEventListener('hashchange', () => { zustand.reiter = location.hash.slice(1) || 'heute'; zeichne(); });

lade().catch(e => melde(e.message, true));
// Alle zwei Minuten frisch - aber nicht, waehrend jemand tippt.
setInterval(() => { if (!zustand.bearbeite.size && !document.hidden) lade().catch(() => {}); }, 120000);
