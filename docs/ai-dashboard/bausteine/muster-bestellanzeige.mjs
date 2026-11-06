import { esc, fmtDateTime, plural } from '../kern/helfer.mjs';
import { vorgangsLink } from '../lib/vorgangslink.mjs';

const SIEBEN_TAGE_MS = 7 * 864e5;
const ALLE_MUSTER = '#/kunden?tab=bestellungen&amp;bart=muster';

/** Ausfuehrlich je Kunde - so steht es unter Kunden › Bestellungen (#1648) und bleibt dort unveraendert. */
export function musterAutomatikHtml(a) {
  const zeilen = [];
  for (const s of a.bestellt || []) {
    const inhalt = s.positionen.map(p => [p.menge + '×', p.titel, p.farbe].filter(Boolean).join(' ')).join(' · ');
    zeilen.push(`<div class="bq-inhalt-zeile"><strong>Muster bestellt</strong> · ${esc(fmtDateTime(s.am))} · ${esc(inhalt)} · an ${esc(s.an)} · ${s.lieferziel === 'kunde' ? 'direkt zum Kunden' : 'zu uns ins Geschäft'}</div>`);
  }
  if (a.geplant) zeilen.push('<div class="bq-inhalt-zeile">Muster werden automatisch bestellt.</div>');
  const gruende = [...new Set((a.klaeren || []).map(p => [p.titel, p.farbe, p.grund].filter(Boolean).join(' · ')))];
  if (gruende.length) zeilen.push(`<div class="bq-inhalt-zeile"><strong>Muster: Klärung nötig</strong> · ${esc(gruende.join('; '))}</div>`);
  return zeilen.join('');
}

/**
 * Was die Automatik in den letzten 7 Tagen bestellt hat - alle Bestellungen, nicht nur die ersten
 * fuenf, die der fruehere Block zeigte. Gezaehlt werden Kundenbestellungen und Musterstuecke.
 */
export function musterAutomatikWoche(daten, jetzt = Date.now()) {
  const ab = jetzt - SIEBEN_TAGE_MS;
  let bestellungen = 0, muster = 0, zuletzt = null;
  for (const z of daten?.zeilen || []) {
    const mails = (z.musterAutomatik?.bestellt || []).filter(s => Date.parse(s.am) >= ab && Date.parse(s.am) <= jetzt);
    if (!mails.length) continue;
    bestellungen += 1;
    for (const s of mails) {
      for (const p of s.positionen || []) muster += Number.isInteger(p.menge) && p.menge > 0 ? p.menge : 1;
      if (!zuletzt || Date.parse(s.am) > Date.parse(zuletzt)) zuletzt = s.am;
    }
  }
  return { bestellungen, muster, zuletzt };
}

/**
 * Shop-Uebersicht, "Im Hintergrund" (Rundgang 06.11.2026, #1996): eine ruhige Zeile statt des Blocks mit
 * fuenf Kundenkarten. Dass die Automatik geklappt hat, ist der Normalfall; die ausfuehrliche Liste steht
 * einen Klick weiter unter Kunden › Bestellungen › Muster. Ohne aktive Automatik keine Zeile.
 */
export function musterAutomatikZeile(daten, jetzt = Date.now()) {
  if (!daten?.musterAutomatik?.aktiv) return '';
  const w = musterAutomatikWoche(daten, jetzt);
  const text = w.bestellungen
    ? `${plural(w.bestellungen, 'Musterbestellung', 'Musterbestellungen')} (${plural(w.muster, 'Muster', 'Muster')}) in 7 Tagen automatisch bestellt, zuletzt ${fmtDateTime(w.zuletzt)}`
    : 'In den letzten 7 Tagen nichts automatisch bestellt';
  return `<div class="heute-hg-zeile"><span class="heute-hg-name">Musterautomatik</span><span class="heute-hg-text">${esc(text)}</span><a class="heute-hg-knopf" href="${ALLE_MUSTER}">Ansehen</a></div>`;
}

/**
 * Klaerfall, der auf Heute schon als rotes To-do steht - den nicht ein zweites Mal zeigen. `rot` kommt aus den
 * roten To-dos selbst (probleme.mjs rotMuster): bis 06.11. wurde hier nach Alter geraten, und unbezahlte
 * Klaerfaelle oder solche mit faelligem Rueckruf verschwanden von beiden Stellen. Ohne `rot` fehlt nichts.
 */
function stehtSchonRot(z, k, rot) {
  if (!rot) return false;
  if (rot.auftraege?.has(z.orderId)) return true;
  return (k.lineItemIds || []).some(id => rot.positionen?.has(`${z.orderId}::${id}`));
}

/** Bestellnummer als Link in die Kundenakte (wie "Ansehen" in der Aufraeumliste). */
function bestellLink(z) {
  const ziel = z.kundenSchluessel ? vorgangsLink('kunden', { kunde: z.kundenSchluessel, auftrag: z.orderId })
    : `#/kunden?${new URLSearchParams({ tab: 'bestellungen', bfilter: 'alle', bq: z.orderName || z.orderId || '' })}`;
  return `<a href="${esc(ziel)}">${esc(z.orderName || 'Bestellung')}</a>`;
}

/**
 * Block auf der Shop-Uebersicht nur, wenn jemand hinsehen muss: Stoerung der Automatik (`hinweis`, z. B.
 * pausiert oder Sperrliste unlesbar), gleich geplante Bestellungen und Klaerfaelle - immer ausgeklappt.
 * Klaerfaelle stehen je Grund in einer Zeile mit den Bestellnummern. Was schon als rotes To-do oben steht,
 * fehlt hier. Erfolgreiche Bestellungen zaehlt nur musterAutomatikZeile().
 */
export function musterAutomatikBlock(daten, jetzt = Date.now(), { rot = null } = {}) {
  const a = daten?.musterAutomatik;
  if (!a?.aktiv && !a?.hinweis) return '';
  const jeGrund = new Map();
  const geplant = [];
  for (const z of daten.zeilen || []) {
    const m = z.musterAutomatik;
    if (!m) continue;
    if (m.geplant) geplant.push(`${z.orderName} (${plural(m.geplant, 'Muster', 'Muster')})`);
    for (const k of m.klaeren || []) {
      if (!k?.grund || stehtSchonRot(z, k, rot)) continue;
      if (!jeGrund.has(k.grund)) jeGrund.set(k.grund, new Map());
      jeGrund.get(k.grund).set(z.orderId || z.orderName, z);
    }
  }
  if (!a.hinweis && !geplant.length && !jeGrund.size) return '';
  const zeilen = [
    ...(geplant.length ? [`<div class="heute-bestellzeile"><div><strong>Wird gleich automatisch bestellt</strong><p>${esc(geplant.join(' · '))}</p></div></div>`] : []),
    ...[...jeGrund].map(([grund, auftraege]) => `<div class="heute-bestellzeile"><div><strong>${esc(grund)}</strong><p>${[...auftraege.values()].map(bestellLink).join(', ')}</p></div></div>`),
  ];
  return `<section class="heute-geschaeft" aria-labelledby="heuteMusterAutomatik"><div class="heute-geschaeft-kopf">
    <h2 id="heuteMusterAutomatik">Musterautomatik${jeGrund.size ? ': Klärung nötig' : ''}</h2>
    ${a.hinweis ? `<p class="notice warn">${esc(a.hinweis)}</p>` : ''}</div>
    ${zeilen.join('')}
    <a class="heute-weiter-link" href="${ALLE_MUSTER}">Alle Musterbestellungen ansehen →</a>
  </section>`;
}
