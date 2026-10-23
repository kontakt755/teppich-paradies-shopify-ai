/** Shop-Arbeit aus vorhandenen Bestellzeilen: keine Ablage und keine Statusaenderung. */
import { bestellArbeitsstand, bestellZahlungOffen } from './bestellarbeit.mjs';
import { beschaffungsStand, restmenge } from './beschaffung.mjs';
import { werWartet } from './todos.mjs';

const positionenVon = z => Array.isArray(z?.auftrag?.positionen) ? z.auftrag.positionen.filter(Boolean) : [];
const warenVon = z => positionenVon(z).filter(p => p.istMuster !== true);
const musterVon = z => positionenVon(z).filter(p => p.istMuster === true);
const fehlerhaft = d => Array.isArray(d?.fehler) ? d.fehler.length > 0 : Boolean(d?.fehler);

/** Gemischte Auftraege bleiben in beiden bewussten Artfiltern; unbekannte Ware bleibt kontrollierbar. */
export function bestellArtPasst(z, art = 'alle') {
  if (art === 'muster') return musterVon(z).length > 0 || (!positionenVon(z).length && z?.auftragsart === 'muster');
  if (art === 'ware') return warenVon(z).length > 0 || (!positionenVon(z).length && z?.auftragsart !== 'muster');
  return true;
}

/** Warenstand verwendet den vorhandenen positionsweisen Fortschritt, niemals den gemischten Gesamtstand. */
export function warenArbeitsstand(z = {}, { jetzt = Date.now() } = {}) {
  const waren = warenVon(z);
  const gemischt = waren.length > 0 && musterVon(z).length > 0;
  const fortschritt = z.warenFortschritt || (!gemischt && waren.length ? z.fortschritt : null);
  const mitStatus = z.positionsstatus && typeof z.positionsstatus === 'object' && !Array.isArray(z.positionsstatus);
  // Explizites null bedeutet noch kein lokaler Arbeitsschritt. Ein fehlendes Feld
  // in einer sonst gelieferten Statuskarte ist dagegen keine bestaetigte Null.
  const unklar = !waren.length || !fortschritt || fortschritt.unklar || waren.some(p => !p.lineItemId
    || (mitStatus && !Object.hasOwn(z.positionsstatus, p.lineItemId)));
  const eintraege = waren.map(p => ({ p, eintrag: mitStatus
    ? beschaffungsStand(z.positionsstatus[p.lineItemId], p.bestellSoll || p.bestellmenge) : null }));
  const fehlteile = eintraege.filter(x => x.eintrag?.beschaffung?.klaerung || restmenge(x.eintrag) > 0);
  // Auch alte lokale Abschluesse und persoenliche Uebergaben belegen keine Shopify-Buchung.
  // Nur Warenpositionen pruefen: ein Muster-Versandhinweis darf fertige Ware nicht wieder oeffnen.
  const versandOffen = z.fulfillmentstatus !== 'FULFILLED'
    && eintraege.some(({ p, eintrag: e }) => !p.eigenleistung && ['raus', 'erledigt'].includes(e?.status)
      && !['gebucht', 'bereits'].includes(e?.shopifyVersand?.status));
  const raus = (fortschritt?.minStufe || 0) >= 3;
  const warenHinweise = z.warenWasFehlt || (!gemischt ? z.wasFehlt : []) || [];
  const vorVersand = !raus && z.fulfillmentstatus !== 'FULFILLED';
  const warenKlaerung = vorVersand ? warenHinweise.filter(t => !['Noch nicht versendet', 'Noch nicht bezahlt'].includes(t)) : [];
  if (vorVersand && waren.some(p => !p.eigenleistung && p.bestellmenge?.menge === 'UNGEKLAERT')) warenKlaerung.push('Einkaufsmenge klären');
  const manuellOffen = Boolean(z.abgehakt && !raus && z.fulfillmentstatus !== 'FULFILLED' && fortschritt?.stufe !== 'erledigt');
  const archiviert = z.archiviert === true;
  const bezahlt = ['PAID', 'PARTIALLY_REFUNDED'].includes(z.zahlungsstatus);
  const finanziellAbgeschlossen = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'VOIDED'].includes(z.zahlungsstatus);
  const kontrollieren = !archiviert && Boolean(unklar || fehlteile.length || versandOffen || manuellOffen || warenKlaerung.length);
  const zahlungOffen = bestellZahlungOffen(z);
  // Archivieren ist ein bewusster Abschluss, kein nachtraeglicher Versandbeleg.
  const abgeschlossen = archiviert ? finanziellAbgeschlossen : !kontrollieren && !zahlungOffen
    && (fortschritt?.stufe === 'erledigt' || z.fulfillmentstatus === 'FULFILLED');
  const quelle = { ...z, fortschritt, fertig: abgeschlossen,
    // Eine Muster-Zeitleiste ist keine Aussage ueber den Warenanteil.
    naechsterSchritt: gemischt ? null : z.naechsterSchritt,
    wasFehlt: warenHinweise,
  };
  let arbeit = bestellArbeitsstand(quelle);
  const statusAlle = Object.fromEntries(eintraege.filter(x => x.p.lineItemId && x.eintrag)
    .map(x => [`${z.orderId}::${x.p.lineItemId}`, x.eintrag]));
  // Dieselben Handlungs-/Warteregeln wie auf Heute, hier ausschliesslich fuer Warenpositionen.
  if (!unklar && mitStatus && !abgeschlossen && z.offen) {
    const zeile = { ...quelle, auftrag: { ...z.auftrag, positionen: waren, ampel: warenKlaerung.length ? 'rot' : 'gruen' } };
    const warten = werWartet({ bestellzeilen: [zeile], statusAlle }, { jetzt: new Date(jetzt) });
    const n = [...warten.wir, ...warten.lieferant, ...warten.kunde][0];
    if (n) arbeit = { ...arbeit, naechstes: n.schritt };
  }
  if (archiviert) arbeit = { stand: 'In Shopify archiviert', naechstes: finanziellAbgeschlossen ? 'Bewusst abgeschlossen; kein Versand daraus abgeleitet' : 'Zahlungseingang prüfen' };
  else if (unklar) arbeit = { stand: 'Warenstand prüfen', naechstes: 'Warenpositionen und aktuellen Bestellstand prüfen' };
  else if (fehlteile.length) arbeit = { ...arbeit, naechstes: 'Fehlmenge / Wareneingang klären' };
  else if (versandOffen) arbeit = { ...arbeit, naechstes: 'Versandbuchung prüfen und gegebenenfalls nachholen' };
  else if (manuellOffen) arbeit = { ...arbeit, naechstes: 'Manueller Haken: Waren- und Versandstand prüfen' };
  else if (warenKlaerung.length) arbeit = { ...arbeit, naechstes: warenKlaerung.join(' · ') };
  else if (zahlungOffen && (raus || z.fulfillmentstatus === 'FULFILLED')) arbeit = { ...arbeit, naechstes: 'Zahlungseingang prüfen' };
  const zahlung = z.zahlungsstatus;
  const zahlungsRang = bezahlt ? 0 : zahlung === 'PARTIALLY_PAID' ? 1 : zahlung === 'AUTHORIZED' ? 2 : 3;
  const datum = Date.parse(z.datum);
  const tage = Number.isFinite(datum) ? Math.max(0, Math.floor((Number(jetzt) - datum) / 864e5)) : null;
  return { ...arbeit, fortschritt: fortschritt || null, waren, gemischt, unklar: Boolean(unklar),
    kontrollieren, abgeschlossen, bezahlt, zahlungOffen, zahlungsRang, tage, fehlteile: fehlteile.length };
}

/** Eine gemeinsam verwendbare Projektion fuer Waren-Startseite und bewusste Artfilter. */
export function shopBestellarbeit(daten, { jetzt = Date.now() } = {}) {
  if (daten == null) return { verfuegbar: false, laedt: true, hinweis: 'Warenbestellungen werden geladen …', zeilen: [], offen: null };
  if (!daten.verfuegbar || fehlerhaft(daten) || !Array.isArray(daten.zeilen)) return {
    verfuegbar: false, laedt: false, hinweis: daten.hinweis || 'Warenbestellungen können gerade nicht vollständig gelesen werden.', zeilen: [], offen: null,
  };
  const zeilen = daten.zeilen.filter(z => z && !z.testbestellung && !z.storniert && bestellArtPasst(z, 'ware'))
    .map(z => ({ zeile: z, ...warenArbeitsstand(z, { jetzt }) }))
    .filter(z => !z.abgeschlossen)
    .sort((a, b) => a.zahlungsRang - b.zahlungsRang || Number(b.kontrollieren) - Number(a.kontrollieren)
      || (b.tage ?? -1) - (a.tage ?? -1) || String(a.zeile.orderId).localeCompare(String(b.zeile.orderId)));
  return { verfuegbar: true, laedt: false, zeilen, offen: zeilen.length,
    bezahlt: zeilen.filter(z => z.bezahlt).length, kontrolle: zeilen.filter(z => z.kontrollieren).length };
}
