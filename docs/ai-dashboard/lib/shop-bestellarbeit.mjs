/** Shop-Arbeit aus vorhandenen Bestellzeilen: keine Ablage und keine Statusaenderung. */
import { bestellArbeitsstand, bestellZahlungOffen } from './bestellarbeit.mjs';
import { beschaffungsStand, restmenge } from './beschaffung.mjs';
import { werWartet } from './todos.mjs';
import { kalendertage } from './kalendertage.mjs';
import { zeilenAblauf, teilstandText, warenAmpel, tageBeimLieferanten } from './auftrags-ablauf.mjs';
import { lieferantName as lieferantAnzeige } from './einkauf-lieferanten.mjs';

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

const seitText = t => (t === 0 ? 'seit heute' : t === 1 ? 'seit 1 Tag' : `seit ${t} Tagen`);

/**
 * Warenstand verwendet den vorhandenen positionsweisen Fortschritt, niemals den gemischten Gesamtstand.
 * Zusaetzlich (#1996, 06.11.2026) aus derselben Rechnung wie "Je Auftrag" (zeilenAblauf):
 *   teilstand  "Teillieferung: 1 von 2 Warenartikeln da – fehlt noch: …" oder ''
 *   ampel      rote Ampel der Ware (warenAmpel) oder null
 * @param opt.lieferantName  Kennung -> Anzeigename fuer den Teilstand (Stammdaten der Ansicht); ohne
 *                           Stammdaten der neutrale Ersatz "Lieferant A" wie in "Je Auftrag" und den To-dos
 */
export function warenArbeitsstand(z = {}, { jetzt = Date.now(), lieferantName = id => lieferantAnzeige(id) } = {}) {
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
  // wartet: 'lieferant' | 'kunde', wenn gerade andere dran sind (Rundgang 29.10., T4) - solche
  // Zeilen stehen hinter denen mit eigenem Schritt und bekommen nicht den Hauptknopf.
  let wartet = null;
  let liefertermin = null;
  if (!unklar && mitStatus && !abgeschlossen && z.offen) {
    const zeile = { ...quelle, auftrag: { ...z.auftrag, positionen: waren, ampel: warenKlaerung.length ? 'rot' : 'gruen' } };
    const warten = werWartet({ bestellzeilen: [zeile], statusAlle }, { jetzt: new Date(jetzt) });
    const n = [...warten.wir, ...warten.lieferant, ...warten.kunde][0];
    if (n) arbeit = { ...arbeit, naechstes: n.schritt };
    if (!warten.wir.length) wartet = warten.lieferant.length ? 'lieferant' : warten.kunde.length ? 'kunde' : null;
    if (wartet === 'lieferant') liefertermin = n.liefertermin || null;
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
  const tage = kalendertage(z.datum, Number(jetzt));
  // Jede Pruef-/Zahlungsaufgabe von oben ist unser Schritt, auch wenn der Lieferant noch liefert.
  if (archiviert || unklar || kontrollieren || zahlungOffen) wartet = null;
  const lage = !archiviert && !unklar && !abgeschlossen && z.offen ? zeilenAblauf(z, new Date(jetzt)) : null;
  const teilstand = lage ? teilstandText(lage.ab, lage.e, { lieferantName }) : '';
  // Wartet nur auf den Lieferanten: der Stand ("Beim Lieferanten bestellt") steht schon in der Zeile -
  // vorher wiederholte der naechste Schritt ihn ("Ware bestellt"). Ein Teilstand sagt mehr; ein
  // bestaetigter Termin bleibt "Ware kommt bis …" wie auf Heute und in den To-dos.
  if (wartet === 'lieferant') {
    const warten = liefertermin ? arbeit.naechstes : `wartet auf Lieferant · ${seitText(tageBeimLieferanten(lage?.ab, new Date(jetzt)) ?? 0)}`;
    arbeit = { ...arbeit, naechstes: teilstand ? (liefertermin ? `${teilstand} · ${arbeit.naechstes}` : teilstand) : warten };
  }
  return { ...arbeit, wartet, liefertermin: wartet === 'lieferant' ? liefertermin : null, fortschritt: fortschritt || null, waren, gemischt, unklar: Boolean(unklar),
    kontrollieren, abgeschlossen, bezahlt, zahlungOffen, zahlungsRang, tage, fehlteile: fehlteile.length,
    teilstand, ampel: lage ? warenAmpel(lage.ab, lage.e) : null };
}

/** Eine gemeinsam verwendbare Projektion fuer Waren-Startseite und bewusste Artfilter. */
export function shopBestellarbeit(daten, { jetzt = Date.now(), lieferantName } = {}) {
  if (daten == null) return { verfuegbar: false, laedt: true, hinweis: 'Warenbestellungen werden geladen …', zeilen: [], offen: null };
  if (!daten.verfuegbar || fehlerhaft(daten) || !Array.isArray(daten.zeilen)) return {
    verfuegbar: false, laedt: false, hinweis: daten.hinweis || 'Warenbestellungen können gerade nicht vollständig gelesen werden.', zeilen: [], offen: null,
  };
  const zeilen = daten.zeilen.filter(z => z && !z.testbestellung && !z.storniert && bestellArtPasst(z, 'ware'))
    .map(z => ({ zeile: z, ...warenArbeitsstand(z, { jetzt, lieferantName }) }))
    .filter(z => !z.abgeschlossen)
    .sort((a, b) => a.zahlungsRang - b.zahlungsRang || Number(Boolean(a.wartet)) - Number(Boolean(b.wartet))
      || Number(b.kontrollieren) - Number(a.kontrollieren)
      || (b.tage ?? -1) - (a.tage ?? -1) || String(a.zeile.orderId).localeCompare(String(b.zeile.orderId)));
  return { verfuegbar: true, laedt: false, zeilen, offen: zeilen.length,
    bezahlt: zeilen.filter(z => z.bezahlt).length, kontrolle: zeilen.filter(z => z.kontrollieren).length };
}
