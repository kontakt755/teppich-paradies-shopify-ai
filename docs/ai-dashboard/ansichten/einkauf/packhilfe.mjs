/** Vorschläge bleiben von den gemessenen Packdaten und ihren Bestätigungen getrennt. */
import { esc } from '../../kern/helfer.mjs';
import { berechnePackhilfe } from '../../lib/packhilfe.mjs';

const zahl = wert => {
  const s = String(wert ?? '').trim().replace(',', '.');
  return s && /^\d+(?:\.\d+)?$/.test(s) && Number.isFinite(Number(s)) ? Number(s) : null;
};
const format = n => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(n);
// Auf 10 g aufrunden, ohne binaere Rundungsreste wie 7,300000000000001 als 7,31 kg auszugeben.
export const packgewicht = n => n === null ? null : Math.ceil(Number((n * 100).toPrecision(14))) / 100;
const feld = (id, text, wert, extra = '') => `<div class="field"><label for="${id}">${text}</label><input id="${id}" data-kh-eingabe ${extra} type="text" inputmode="decimal" value="${esc(wert ?? '')}" autocomplete="off"></div>`;

export function packhilfeHtml(positionen) {
  return `<section class="ks-hilfe" aria-labelledby="khTitel"><h4 id="khTitel">Gewicht & Rollenmaße berechnen</h4><p class="small">Die kürzeste Rollenachse wird vorgeschlagen. Alle Packwerte unten bleiben änderbar.</p>${positionen.map((p, i) => {
    const h = p.packhilfe || {};
    return `<div data-kh-position="${esc(p.id)}" class="ks-material" hidden><b>${esc(p.farbe || p.titel)}</b>${h.breiteCm&&h.laengeCm?`<span class="small"> · ${esc(h.breiteCm)} × ${esc(h.laengeCm)} cm</span>`:''}<div class="vs-sendung">${feld(`kh-${i}-gewicht`, 'Gesamtgewicht (g/m²)', h.gewichtGm2, 'data-kh-feld="gewichtGm2"')}${feld(`kh-${i}-dicke`, 'Gesamtdicke (mm)', h.dickeMm, 'data-kh-feld="dickeMm"')}</div><p class="small">${h.quellen?.gewicht ? 'Gewicht aus Artikeldaten. ' : 'Gesamtgewicht fehlt im Artikel. '}${h.quellen?.dicke ? 'Dicke aus Artikeldaten.' : 'Gesamtdicke fehlt im Artikel.'} Herstellerangabe verwenden; Florgewicht und Florhöhe reichen nicht.</p><details><summary>Teppichmaße & Stückzahl ändern</summary><div class="vs-sendung">${feld(`kh-${i}-breite`, 'Teppichbreite (cm)', h.breiteCm, 'data-kh-feld="breiteCm"')}${feld(`kh-${i}-laenge`, 'Teppichlänge (cm)', h.laengeCm, 'data-kh-feld="laengeCm"')}${feld(`kh-${i}-menge`, 'Anzahl Teppiche', h.menge, 'data-kh-feld="menge"')}<div class="field"><label for="kh-${i}-form">Form</label><select id="kh-${i}-form" data-kh-eingabe data-kh-feld="form">${[['','Bitte wählen'],['rechteck','Rechteck'],['oval','Oval'],['rund','Rund']].map(([v,t])=>`<option value="${v}"${h.form===v?' selected':''}>${t}</option>`).join('')}</select></div></div></details></div>`;
  }).join('')}<div class="vs-sendung">${feld('khVerpackung', 'Verpackungsgewicht (kg)', null, 'data-kh-option="verpackungKg" placeholder="Folie, Hülse, Schutz …"')}</div><details><summary>Rollenkern & Verpackungszugabe ändern</summary><div class="vs-sendung">${feld('khKern', 'Kerndurchmesser (cm)', 0, 'data-kh-option="kernCm"')}${feld('khZugabe', 'Zugabe außen insgesamt (cm)', 2, 'data-kh-option="zugabeCm"')}</div><p class="small">Vorschlag: ohne Kern, 2 cm Zugabe je Außenmaß. Falls eine Hülse verwendet wird, ihren Durchmesser und ihr Gewicht ergänzen.</p></details><p data-kh-ergebnis role="status" aria-live="polite"></p><p class="small" data-kh-fehlt></p><button class="btn btn-sm" type="button" data-kh-uebernehmen>Berechnete Packwerte übernehmen</button><p class="small">Rechnerischer Vorschlag für enges Rollen. Material, Kettelung und Verpackung können mehr Platz brauchen. Fertige Rolle vor dem Speichern messen und wiegen.</p></section>`;
}

/** Automatik aktualisiert nur eigene Werte; eine bewusste manuelle Korrektur bleibt erhalten. */
export function aktualisierePackwerte(aktuell, vorschlag, automatisch, erzwingen = false) {
  const werte = { ...aktuell }, auto = { ...automatisch };
  for (const k of ['laenge', 'breite', 'hoehe', 'gewicht']) {
    if (erzwingen || aktuell[k] === '' || aktuell[k] === automatisch[k]) {
      werte[k] = vorschlag[k] == null ? '' : String(vorschlag[k]);
      auto[k] = werte[k];
    }
  }
  return { werte, automatisch: auto };
}

export function verbindePackhilfe(form, positionen) {
  if (!form) return;
  let automatisch = {};
  const q = s => form.querySelector(s);
  const packfelder = ['laenge', 'breite', 'hoehe', 'gewicht'];
  const bestaetigungZurueck = () => { q('[name=gemessen]').checked = false; q('[name=zusammen]').checked = false; };
  const berechnen = (erzwingen = false) => {
    const ids = new Set([...form.querySelectorAll('[name=positionen]:checked')].map(e => e.value));
    q('[name=zusammen]').required = ids.size > 1;
    const liste = positionen.filter(p => ids.has(p.id)).map(p => {
      const el = [...form.querySelectorAll('[data-kh-position]')].find(e => e.dataset.khPosition === p.id);
      const h = { id: p.farbe || p.titel };
      for (const e of el.querySelectorAll('[data-kh-feld]')) h[e.dataset.khFeld] = e.dataset.khFeld === 'form' ? e.value : zahl(e.value);
      return h;
    });
    for (const e of form.querySelectorAll('[data-kh-position]')) e.hidden = !ids.has(e.dataset.khPosition);
    const optionen = {};
    for (const e of form.querySelectorAll('[data-kh-option]')) optionen[e.dataset.khOption] = zahl(e.value);
    const r = berechnePackhilfe(liste, optionen);
    const ergebnis = [];
    if (r.flaecheM2 !== null) ergebnis.push(`${format(r.flaecheM2)} m²`);
    if (r.produktgewichtKg !== null) ergebnis.push(`${format(r.produktgewichtKg)} kg Teppich`);
    if (r.bruttogewichtKg !== null) ergebnis.push(`${format(r.bruttogewichtKg)} kg inkl. Verpackung`);
    if (r.rollenachseCm !== null) ergebnis.push(`Rollenachse mindestens ${format(r.rollenachseCm)} cm`);
    if (r.durchmesserCm !== null) ergebnis.push(`Ø inkl. Zugabe ca. ${format(r.durchmesserCm)} cm`);
    q('[data-kh-ergebnis]').textContent = ergebnis.join(' · ') || 'Teppiche für dieses Packstück auswählen.';
    const hinweise = [];
    if (liste.length) {
      if (r.flaecheM2 === null) hinweise.push('Teppichmaße, Form und Stückzahl prüfen.');
      if (r.produktgewichtKg === null) hinweise.push('Für das Gewicht: Gesamtgewicht (g/m²) je Teppich ergänzen.');
      if (optionen.verpackungKg === null) hinweise.push('Verpackungsgewicht ergänzen oder Bruttogewicht unten selbst eintragen.');
      if (r.durchmesserCm === null) hinweise.push('Für den Durchmesser: Gesamtdicke, Kern und Zugabe prüfen.');
    }
    q('[data-kh-fehlt]').textContent = hinweise.join(' ');
    q('[data-kh-uebernehmen]').disabled = !liste.length;
    const vorschlag = { laenge: r.laengeCm, breite: r.breiteCm, hoehe: r.hoeheCm, gewicht: packgewicht(r.bruttogewichtKg) };
    const aktuell = Object.fromEntries(packfelder.map(k => [k, q(`[name=${k}]`).value]));
    const neu = aktualisierePackwerte(aktuell, vorschlag, automatisch, erzwingen);
    automatisch = neu.automatisch;
    for (const k of packfelder) q(`[name=${k}]`).value = neu.werte[k];
  };
  form.addEventListener('input', e => {
    if (e.target.matches('[data-kh-eingabe]')) { bestaetigungZurueck(); berechnen(); }
    else if (e.target.matches('[name=laenge],[name=breite],[name=hoehe],[name=gewicht]')) bestaetigungZurueck();
  });
  form.addEventListener('change', e => {
    if (e.target.matches('[name=positionen]')) {
      // Neue Zusammenstellung: auch alte manuelle Packwerte sind nicht mehr belastbar.
      for (const k of packfelder) q(`[name=${k}]`).value = '';
      q('[name=warenwert]').value = '';
      automatisch = {}; bestaetigungZurueck(); berechnen();
    } else if (e.target.matches('select[data-kh-eingabe]')) { bestaetigungZurueck(); berechnen(); }
  });
  q('[data-kh-uebernehmen]').addEventListener('click', () => { bestaetigungZurueck(); berechnen(true); });
  berechnen();
}
