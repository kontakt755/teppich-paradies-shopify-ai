/**
 * Freigabe: nichts erscheint, was niemand gesehen hat.
 *
 * Der Freigabe-Agent sammelt zu jedem Entwurf, was ein Mensch wissen muss
 * (Hinweise), und verweigert die Freigabe, wo ein Risiko nicht geklaert ist
 * (Sperren). Automatische Freigabe (SOCIAL_AUTO_FREIGABE, Inhaberentscheidung
 * 01.10.2026: das System soll selbststaendig posten):
 *   1  Shop-Inhalte ohne Preisrisiko (Farben, Raumidee, Produkt der Woche, Neu im Shop)
 *   2  zusaetzlich Baustellen, Referenzen, Laden - nur mit Einwilligung und
 *      vollstaendig gesichteten Bildern (Datenschutz ok)
 * Reels laufen wie ihre Quelle mit (Inhaberentscheidung 02.10.2026: er schaut
 * nachtraeglich rein und korrigiert). Nie automatisch: Angebote (Preisangaben), alles mit Sperre oder
 * einem Hinweis, der einen Menschen braucht.
 */

import { BEITRAG_STATUS, PLATTFORMEN } from './status.mjs';
import { pruefeText } from './texte.mjs';

export class FreigabeFehler extends Error {}

/**
 * Was steht einer Veroeffentlichung entgegen?
 * `sperren` verhindern die Freigabe, `hinweise` muessen nur gelesen werden.
 */
export function pruefe({ beitrag, inhalt, medien }) {
  const sperren = []; const hinweise = [];
  const text = pruefeText(beitrag.text, { hashtags: String(beitrag.hashtags ?? '').split(/\s+/).filter(Boolean) });
  sperren.push(...text.fehler);
  hinweise.push(...text.hinweise);

  // Bedenken sperren immer - egal woher das Bild stammt.
  const bedenken = medien.filter(m => m.datenschutz === 'bedenken');
  if (bedenken.length) sperren.push(`Datenschutz-Bedenken bei ${bedenken.length} Bild(ern): ${bedenken.map(m => m.datenschutz_notiz).filter(Boolean).join('; ') || 'siehe Sichtung'}`);
  const ungeprueft = medien.filter(m => m.datenschutz === 'ungeprueft');
  if (inhalt.quelle === 'referenz' && ungeprueft.length) {
    hinweise.push(`${ungeprueft.length} Referenzbild(er) von der Website sind noch nicht auf Personen und Kennzeichen gesichtet.`);
  }
  if (inhalt.quelle === 'baustelle') {
    if (!inhalt.einwilligung) sperren.push('Keine Einwilligung des Kunden hinterlegt.');
    if (ungeprueft.length) sperren.push(`${ungeprueft.length} Bild(er) noch nicht auf Personen, Kennzeichen, Namen und Dokumente gesichtet.`);
    if (inhalt.daten?.ortVerworfen) hinweise.push('Der Monteur hatte eine Adresse angegeben – sie wurde nicht gespeichert, der Beitrag nennt keinen Ort.');
    else if (inhalt.ort && inhalt.daten?.ortBekannt === false) hinweise.push(`Ort „${inhalt.ort}“ ist nicht in der Ortsliste – bitte Schreibweise prüfen.`);
  }
  if (inhalt.typ === 'angebot') hinweise.push('Angebot mit Preis oder Rabatt – Angaben gegen den Shop prüfen (Preisangabenverordnung).');
  if (beitrag.format === 'reel') hinweise.push('Reel – bitte einmal ganz ansehen.');
  return { sperren, hinweise };
}

/**
 * Darf ein Entwurf ohne Menschen hinaus? Nur, wenn nichts Persoenliches und
 * kein Preis im Spiel ist und die Pruefung gar nichts anzumerken hatte.
 */
// Hinweise, die bei eigenen Fotos keinen Menschen brauchen: der Beitrag nennt dann einfach keinen Ort.
const HARMLOS = [/^Ort „/, /^Der Monteur hatte eine Adresse angegeben/, /^Reel – /];

export function autoFreigabeMoeglich({ beitrag, inhalt, medien }, env = process.env) {
  const stufe = env.SOCIAL_AUTO_FREIGABE;
  if (stufe !== '1' && stufe !== '2') return false;
  if (inhalt.typ === 'angebot') return false;
  const { sperren, hinweise } = pruefe({ beitrag, inhalt, medien });
  if (sperren.length) return false;
  if (inhalt.quelle === 'shopify') {
    return ['produkt_farben', 'raumidee', 'produkt_woche', 'produkt_neu'].includes(inhalt.typ) && hinweise.every(h => /^Reel – /.test(h));
  }
  if (stufe !== '2' || !['baustelle', 'referenz', 'laden'].includes(inhalt.quelle)) return false;
  // Eigene Fotos nur, wenn jedes verwendete Bild gesichtet ist - auch Referenzbilder der Website.
  if (!medien.length || medien.some(m => m.datenschutz !== 'ok')) return false;
  if (inhalt.quelle === 'baustelle' && !inhalt.einwilligung) return false;
  return hinweise.every(h => HARMLOS.some(r => r.test(h)));
}

/**
 * Gibt frei, was jetzt ohne Menschen hinaus darf. Gerechnet wird mit dem Stand
 * von jetzt, nicht dem beim Bauen des Entwurfs: eine spaeter bestaetigte
 * Einwilligung oder Sichtung zaehlt, ein spaeter gesperrtes Bild auch.
 */
export function freigebenAutomatisch(db, { env = process.env, jetzt = new Date() } = {}) {
  const frei = [];
  for (const b of db.beitraege({ status: BEITRAG_STATUS.FREIGABE })) {
    if (!b.geplant_am || new Date(b.geplant_am) <= jetzt) continue;
    const inhalt = db.inhalt(b.inhalt_id);
    const darf = autoFreigabeMoeglich({ beitrag: b, inhalt, medien: medienZuBeitrag(db, b) }, env);
    if (Boolean(b.auto_freigabe) !== darf) db.beitragAendern(b.id, { auto_freigabe: darf });
    if (!darf) continue;
    freigeben(db, b.id, { von: 'automatisch', jetzt });
    frei.push(b.id);
  }
  return frei;
}

export function freigeben(db, id, { von = null, geplantAm = null, jetzt = new Date() } = {}) {
  const beitrag = db.beitrag(id);
  if (!beitrag) throw new FreigabeFehler('Beitrag nicht gefunden');
  if (![BEITRAG_STATUS.FREIGABE, BEITRAG_STATUS.FEHLER].includes(beitrag.status)) throw new FreigabeFehler(`Beitrag ist im Status ${beitrag.status}`);
  const inhalt = db.inhalt(beitrag.inhalt_id);
  const { sperren } = pruefe({ beitrag, inhalt, medien: medienZuBeitrag(db, beitrag) });
  if (sperren.length) throw new FreigabeFehler(`Freigabe nicht möglich: ${sperren.join(' · ')}`);
  const termin = geplantAm ?? beitrag.geplant_am;
  if (!termin) throw new FreigabeFehler('Kein Termin – bitte Datum wählen');
  if (Number.isNaN(new Date(termin).getTime())) throw new FreigabeFehler('Termin ist kein gültiges Datum');
  const aus = db.beitragAendern(id, {
    status: BEITRAG_STATUS.GEPLANT, geplant_am: new Date(termin).toISOString(),
    freigabe_von: von ?? 'Inhaber', freigabe_am: jetzt.toISOString(), fehler: null, versuche: 0,
  });
  db.ereignis(von, 'beitrag-freigegeben', `beitrag:${id}`, { geplantAm: aus.geplant_am });
  return aus;
}

export function verwerfen(db, id, { von = null, grund = '' } = {}) {
  const beitrag = db.beitrag(id);
  if (!beitrag) throw new FreigabeFehler('Beitrag nicht gefunden');
  const aus = db.beitragAendern(id, { status: BEITRAG_STATUS.VERWORFEN, fehler: null });
  db.ereignis(von, 'beitrag-verworfen', `beitrag:${id}`, { grund: String(grund).slice(0, 300) });
  return aus;
}

/** Zurueck in die Freigabe - etwa um einen geplanten Beitrag noch einmal anzufassen. */
export function zurueckholen(db, id, { von = null } = {}) {
  const aus = db.beitragAendern(id, { status: BEITRAG_STATUS.FREIGABE });
  db.ereignis(von, 'beitrag-zurueckgeholt', `beitrag:${id}`);
  return aus;
}

export function bearbeiten(db, id, { text, textFacebook, geplantAm, plattformen, hashtags } = {}, { von = null } = {}) {
  const beitrag = db.beitrag(id);
  if (!beitrag) throw new FreigabeFehler('Beitrag nicht gefunden');
  if ([BEITRAG_STATUS.VEROEFFENTLICHT, BEITRAG_STATUS.ARCHIV].includes(beitrag.status)) throw new FreigabeFehler('Veröffentlichte Beiträge lassen sich hier nicht mehr ändern');
  if (beitrag.status === BEITRAG_STATUS.IN_ARBEIT) throw new FreigabeFehler('Der Beitrag wird gerade veröffentlicht');
  const felder = {};
  if (typeof text === 'string') {
    const p = pruefeText(text);
    if (!p.ok) throw new FreigabeFehler(p.fehler.join(' · '));
    felder.text = text.trim();
  }
  if (typeof textFacebook === 'string') felder.text_facebook = textFacebook.trim() || null;
  if (typeof hashtags === 'string') felder.hashtags = hashtags.trim();
  if (geplantAm) {
    if (Number.isNaN(new Date(geplantAm).getTime())) throw new FreigabeFehler('Termin ist kein gültiges Datum');
    felder.geplant_am = new Date(geplantAm).toISOString();
  }
  if (Array.isArray(plattformen)) {
    const p = plattformen.filter(x => PLATTFORMEN.includes(x));
    if (!p.length) throw new FreigabeFehler('Mindestens eine Plattform wählen');
    felder.plattformen = p;
  }
  const aus = db.beitragAendern(id, felder);
  db.ereignis(von, 'beitrag-bearbeitet', `beitrag:${id}`, { felder: Object.keys(felder) });
  return aus;
}

/**
 * Holt alle geplanten Beitraege eines Inhalts zurueck in die Freigabe - wenn
 * nachtraeglich ein Bild Bedenken bekommt oder das Material verworfen wird
 * (etwa weil ein Kunde seine Zustimmung zurueckzieht). Der Publisher prueft
 * zwar selbst noch einmal; hier geschieht es sofort und sichtbar.
 */
export function holeGeplanteZurueck(db, inhaltId, grund, { von = null } = {}) {
  const zurueck = [];
  for (const b of db.beitraegeZuInhalt(inhaltId)) {
    if (b.status !== BEITRAG_STATUS.GEPLANT) continue;
    db.beitragAendern(b.id, { status: BEITRAG_STATUS.FREIGABE, fehler: grund });
    db.ereignis(von, 'beitrag-zurueckgeholt', `beitrag:${b.id}`, { grund });
    zurueck.push(b.id);
  }
  return zurueck;
}

/** Die Quellmedien, aus denen ein Beitrag gebaut wurde (fuer die Datenschutzpruefung). */
export function medienZuBeitrag(db, beitrag) {
  const ids = new Set((beitrag.medien ?? []).flatMap(m => m.quellen ?? []));
  const alle = db.medien(beitrag.inhalt_id);
  return ids.size ? alle.filter(m => ids.has(m.id)) : alle.filter(m => m.pruefung === 'ok' || m.pruefung === 'unsicher');
}
