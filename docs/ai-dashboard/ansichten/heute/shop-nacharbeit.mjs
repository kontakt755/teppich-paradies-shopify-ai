/**
 * Nacharbeit aus bestehenden Shopdaten. Links lesen oder oeffnen vorhandene Arbeitswege.
 *
 * Seit 07.11.2026 (Inhaber, w-284) stehen die automatischen Nachfrage-Mails nicht mehr hier, sondern
 * unter Kunden › Kunden nach Produkt fragen (ansichten/kunden/muster-anrufe.mjs): zwei Wege zum selben
 * Ziel mit verwechselbaren Woertern ("0 Nachfragen fällig" hier, "Kunden nach Produkt fragen 24" im Menue).
 * Hier bleibt nur, was jemand ansehen muss - Versandfehler des letzten Laufs, Postfach-Suche kaputt,
 * Hinweise aus dem Postfach, faellige Mails ohne laufenden Versand. Der ruhige Normalstand ist dort.
 * Der Aufklapper "Bewertungen: bestehenden Ablauf prüfen" ist ersatzlos weg (er pruefte nichts).
 * Ohne Inhalt faellt der Block ganz weg.
 */
import { esc, plural } from '../../kern/helfer.mjs';
import { musterNachfassen, versandLaeuft } from '../../lib/muster-nachfassen.mjs';
import { NACHFRAGE_MAILS_HREF } from '../../lib/nachfrage-mails.mjs';

/** Nur echte Warnungen zu den Nachfrage-Mails - der Normalstand steht unter Kunden nach Produkt fragen. */
function nachfrageWarnungen(nach, texte) {
  if (!texte || texte.fehler || texte.verfuegbar === false) return '';
  const link = text => `<a href="${esc(NACHFRAGE_MAILS_HREF)}">${text}</a>`;
  const zeilen = [];
  const offen = nach?.offen?.length || 0;
  if (offen && versandLaeuft(texte) === false) zeilen.push(`${plural(offen, 'Nachfrage-Mail ist', 'Nachfrage-Mails sind')} fällig, der automatische Versand läuft aber nicht. ${link('Ansehen')}`);
  if (texte.versand?.letzterLauf?.fehler) zeilen.push(`Der letzte Lauf der Nachfrage-Mails meldet Fehler. ${link('Ansehen')}`);
  if (texte.abgleichFehler) zeilen.push(`Die Postfach-Suche vor den Nachfrage-Mails ist fehlgeschlagen. Solange das so ist, geht keine Nachfrage raus. ${link('Ansehen')}`);
  if (texte.antwortHinweise?.length) zeilen.push(`${plural(texte.antwortHinweise.length, 'Hinweis', 'Hinweise')} aus dem Postfach zu Nachfrage-Mails. ${link('Lesen')}`);
  return zeilen.map(z => `<p class="notice warn">${z}</p>`).join('');
}

export function shopNacharbeitBlock({ bestellungen = null, nachfassen = null, texte = null } = {}) {
  const zeilen = bestellungen?.verfuegbar ? (bestellungen.zeilen || []).filter(z => !z.testbestellung && !z.storniert) : [];
  const bestellLink = z => `#/kunden?tab=bestellungen&bfilter=alle&bq=${encodeURIComponent(z.orderName || '')}`;
  const versandPruefen = zeilen.filter(z => z.shopifyVersandVermerk === 'nachholen' || z.versandHinweis);
  const unterwegs = zeilen.filter(z => {
    const raus = z.fulfillmentstatus === 'FULFILLED' || (z.fortschritt?.minStufe || 0) >= 3;
    const empfang = (z.verlauf || []).some(s => s.schritt === 'kunde_hat_muster' && s.zustand === 'erledigt');
    const tracking = z.auftrag?.sendungen || [];
    const zugestellt = tracking.length && tracking.every(s => String(s.status).toUpperCase() === 'DELIVERED');
    return raus && !empfang && !zugestellt && !z.zeitleisteAbgeschlossen;
  });
  const stopp = new Map((texte?.abgemeldet || []).map(e => [String(e.email || '').toLowerCase(), { am: e.am }]));
  const nach = nachfassen || (bestellungen?.verfuegbar && texte ? musterNachfassen(zeilen, { abgemeldet: stopp }) : null);
  const faelle = liste => liste.slice(0, 3).map(z => `<li><a href="${esc(bestellLink(z))}">${esc(z.orderName || 'Bestellung')} prüfen</a></li>`).join('');
  const quellfehler = !bestellungen ? '<p role="status">Bestellungen werden geladen …</p>'
    : bestellungen.fehler || bestellungen.verfuegbar === false ? '<p class="notice warn">Bestellungen sind nicht verfügbar. Bitte die zugehörige Arbeitsliste prüfen.</p>' : '';
  const inhalt = [
    quellfehler || (versandPruefen.length ? `<div class="notice warn"><strong>${plural(versandPruefen.length, 'Versandbuchung braucht', 'Versandbuchungen brauchen')} Prüfung.</strong><ul>${faelle(versandPruefen)}</ul><a href="#/kunden?tab=bestellungen&amp;bfilter=pruefen">Alle Versandkontrollen →</a></div>` : ''),
    unterwegs.length ? `<details class="shop-nacharbeit-zeile"><summary>${plural(unterwegs.length, 'Bestellung ist', 'Bestellungen sind')} versandt, Empfang noch nicht belegt</summary><ul>${faelle(unterwegs)}</ul><p><a href="#/kunden?tab=bestellungen&amp;bfilter=fertig">Versandte Bestellungen ansehen →</a></p></details>` : '',
    nachfrageWarnungen(nach, texte),
  ].join('');
  if (!inhalt) return '';
  return `<section class="shop-nacharbeit" aria-labelledby="shopNacharbeit"><h2 id="shopNacharbeit">Versand &amp; Kunden nachfassen</h2>
    ${inhalt}
  </section>`;
}
