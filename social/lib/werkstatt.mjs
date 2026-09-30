/**
 * Werkstatt: macht aus einem Inhalt einen fertigen Entwurf.
 *
 * Ein "Bauplan" beschreibt die Folien eines Beitrags (Vorlage + Daten). Er
 * kommt entweder von der Redaktion (die Bilder gesichtet und ausgewaehlt hat)
 * oder, wenn nichts vorgegeben ist, aus `standardBauplan` - damit auch ohne
 * Redaktion ein brauchbarer Vorschlag entsteht. Gerendert wird immer hier,
 * sodass jeder Beitrag dieselbe Designsprache traegt.
 */

import path from 'node:path';
import { medienDir, medienPfad, socialDir } from './pfade.mjs';
import { autoFreigabeMoeglich, pruefe } from './freigabe.mjs';
import { INHALT_STATUS, PLATTFORMEN } from './status.mjs';
import { grundtext, hashtags, pruefeText, shopLink } from './texte.mjs';
import { RenderFehler } from './rendern.mjs';
import { baue, dezenterFilter } from './vorlagen.mjs';
import { BETRIEB } from './konfig.mjs';

export class WerkstattFehler extends Error {}

/** "Sentira Teppichboden 400cm 500cm" -> "Sentira Teppichboden": Breiten gehoeren nicht in die Ueberschrift. */
export function kurzTitel(titel) {
  return String(titel ?? '').replace(/\s+\d+\s?[x×]\s?\d+\s?cm\b/gi, '').replace(/\s+\d{2,3}\s?(cm|mm)\b/gi, '').replace(/\s{2,}/g, ' ').trim();
}

/** Quadratmeterpreis als Text - oder nichts, wenn die Einheit keine Flaeche ist. */
export function preisText(preis) {
  if (!preis || !(preis.betrag > 0) || !/^m(2|²)$/i.test(String(preis.einheit))) return null;
  return `${preis.betrag.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/m²`;
}

/** "Salbeigrün (021)" -> "Salbeigrün": die Farbnummer gehoert in den Shop, nicht ins Bild. */
export function farbName(beschriftung) {
  return String(beschriftung ?? '').replace(/\s*\(\d+\)\s*$/, '').trim();
}

function brauchbar(m) {
  return m.art === 'bild' && ['ok', 'unsicher'].includes(m.pruefung) && m.datenschutz !== 'bedenken';
}

const ref = (m, extra = {}) => ({ medium: m.id, ...extra });

/** Vorschlag fuer die Folien eines Beitrags, wenn die Redaktion nichts vorgibt. */
export function standardBauplan(inhalt, medien, format = 'feed') {
  const d = inhalt.daten ?? {};

  if (inhalt.quelle === 'shopify') {
    const bilder = d.bilder ?? [];
    if (!bilder.length) throw new WerkstattFehler('Kein taugliches Produktbild');
    const gruppe = d.gruppe || inhalt.bodenart || '';
    const name = d.serie ? d.familienName : kurzTitel(inhalt.produkt_titel || inhalt.titel);
    const kicker = { produkt_neu: d.serie ? 'Neue Serie im Shop' : 'Neu im Shop', produkt_woche: 'Produkt der Woche', raumidee: 'Wohnidee', angebot: 'Angebot' }[inhalt.typ] ?? '';
    const anzahl = d.farbAnzahl ? ` · ${d.farbAnzahl} ${d.serie ? 'Dekore' : 'Farben'}` : (d.serie && d.produkte?.length > 1 ? ` · ${d.produkte.length} Designs` : '');
    const produkt = {
      vorlage: 'produkt',
      daten: {
        bild: { quelle: bilder[0].src }, kicker, titel: name, zeile: `${gruppe}${anzahl}`,
        // Eine Wohnidee oder eine ganze Serie traegt kein Preisschild - der Preis steht im Shop.
        preis: ['angebot', 'produkt_woche', 'produkt_neu'].includes(inhalt.typ) && !d.serie ? preisText(d.preisJeEinheit) : null,
        abzeichen: inhalt.typ === 'angebot' && d.rabattProzent ? `−${d.rabattProzent} %` : null,
      },
    };
    if (format === 'story' || format === 'feed') return { format, folien: [produkt] };

    // Karussell
    const farben = (inhalt.typ === 'produkt_farben' ? d.farbBilder : d.serienBilder) ?? [];
    if (inhalt.typ === 'produkt_farben' && farben.length >= 2) {
      const titelbild = {
        vorlage: 'farben_titel',
        // Der Familienname genuegt als Ueberschrift - die Warengruppe steht in der Zeile darunter.
        daten: { bilder: farben.slice(0, 6).map(b => ({ quelle: b.src })), kicker: d.neueFarben ? 'Neue Farben' : 'Farbvorstellung', titel: d.familienName || name, zeile: `${gruppe} in ${d.farbAnzahl ?? farben.length} ${d.serie ? 'Dekoren' : 'Farben'}` },
      };
      const einzeln = farben.slice(0, 9).map((b, i, alle) => ({ vorlage: 'farbe', daten: { bild: { quelle: b.src }, name: farbName(b.beschriftung), zaehler: `${i + 1} / ${alle.length}` } }));
      return { format, folien: [titelbild, ...einzeln] };
    }
    const weitere = farben.length
      ? farben.slice(0, 9).map(b => ({ vorlage: 'farbe', daten: { bild: { quelle: b.src }, name: farbName(b.beschriftung) } }))
      : bilder.slice(1, 6).map(b => ({ vorlage: 'foto', daten: { bild: { quelle: b.src, ausschnitt: '50% 50%' }, ohneSignatur: true } }));
    return { format: weitere.length ? 'karussell' : 'feed', folien: [produkt, ...weitere] };
  }

  // Baustelle, Referenz, Laden
  const bilder = medien.filter(brauchbar);
  if (!bilder.length) throw new WerkstattFehler('Kein freigegebenes Bild vorhanden');
  const rang = { nachher: 0, detail: 2, arbeit: 3, vorher: 4 };
  const sortiert = [...bilder].sort((a, b) => (rang[a.rolle] ?? 1) - (rang[b.rolle] ?? 1) || a.reihenfolge - b.reihenfolge);
  const zeile = [inhalt.daten?.ortBekannt === false ? null : inhalt.ort, inhalt.bodenart].filter(Boolean).join(' · ') || null;

  if (format === 'story') {
    const titel = [inhalt.bodenart || 'Neuer Boden', inhalt.raum ? `im ${inhalt.raum}` : null].filter(Boolean).join(' ');
    return { format, folien: [{ vorlage: 'story_foto', daten: { bild: ref(sortiert[0]), marke: 'Von uns verlegt', markeRot: true, titel, zeile: inhalt.daten?.ortBekannt === false ? null : inhalt.ort } }] };
  }

  const folien = [];
  const vorher = bilder.find(m => m.rolle === 'vorher'); const nachher = bilder.find(m => m.rolle === 'nachher');
  if (vorher && nachher) folien.push({ vorlage: 'vorher_nachher', daten: { vorher: ref(vorher), nachher: ref(nachher), zeile } });
  for (const m of sortiert) {
    if (format === 'feed' && folien.length) break;
    if (folien.length >= 8) break;
    if (vorher && nachher && m.id === vorher.id) continue;
    folien.push({ vorlage: 'foto', daten: folien.length ? { bild: ref(m), ohneSignatur: true } : { bild: ref(m), zeile } });
  }
  return { format: folien.length > 1 ? 'karussell' : 'feed', folien };
}

/** Ersetzt {medium: id} in den Foliendaten durch die echte Bildquelle und merkt sich, welche Medien benutzt werden. */
function loeseAuf(wert, medienNachId, inhalt, quellen, dir) {
  if (Array.isArray(wert)) return wert.map(w => loeseAuf(w, medienNachId, inhalt, quellen, dir));
  if (!wert || typeof wert !== 'object') return wert;
  if ('medium' in wert) {
    const m = medienNachId.get(Number(wert.medium));
    if (!m) throw new WerkstattFehler(`Medium ${wert.medium} gehört nicht zu diesem Inhalt`);
    if (m.datenschutz === 'bedenken') throw new WerkstattFehler(`Medium ${m.id} hat Datenschutz-Bedenken und darf nicht verwendet werden`);
    quellen.add(m.id);
    const { medium, ...rest } = wert;
    return {
      quelle: m.pfad ? medienPfad(m.pfad, dir) : m.url,
      // Korrektur nur fuer eigene Fotos und nur die Helligkeit - Herstellerbilder bleiben unberuehrt.
      filter: m.pfad && inhalt.quelle === 'baustelle' ? dezenterFilter(m.helligkeit) : 'none',
      ...rest,
    };
  }
  return Object.fromEntries(Object.entries(wert).map(([k, v]) => [k, loeseAuf(v, medienNachId, inhalt, quellen, dir)]));
}

/**
 * Rendert die Folien und legt den Beitrag in der Freigabe an.
 * @param rendere  Renderfunktion (rendern.rendere) - als Argument, damit Tests ohne Browser laufen
 */
export async function erstelleEntwurf(db, { inhaltId, format = null, folien = null, text = null, textFacebook = null, plattformen = PLATTFORMEN, von = 'system' }, { rendere, dir = socialDir(), env = process.env } = {}) {
  let inhalt = db.inhalt(inhaltId);
  if (!inhalt) throw new WerkstattFehler(`Inhalt ${inhaltId} gibt es nicht`);
  const medien = db.medien(inhaltId);
  const plan = folien ? { format: format ?? (folien.length > 1 ? 'karussell' : 'feed'), folien } : standardBauplan(inhalt, medien, format ?? 'karussell');
  if (!plan.folien.length) throw new WerkstattFehler('Bauplan ohne Folien');
  if (plan.format === 'karussell' && plan.folien.length < 2) plan.format = 'feed';
  if (plan.format === 'feed' || plan.format === 'story') plan.folien = plan.folien.slice(0, 1);
  if (plan.format === 'reel') throw new WerkstattFehler('Reels entstehen über social/lib/reel.mjs');

  const wechsel = db.beitraegeZuInhalt(inhaltId).length + inhaltId;
  const beitragText = (text ?? grundtext(inhalt, wechsel)).trim();
  const ortFuerTags = inhalt.quelle === 'shopify' ? null : (inhalt.daten?.ortBekannt === false ? null : inhalt.ort);
  const tags = plan.format === 'story' ? [] : hashtags({ ort: ortFuerTags, bodenart: inhalt.bodenart || inhalt.daten?.gruppe || '', typ: inhalt.typ });
  const textPruefung = pruefeText(beitragText, { hashtags: tags });
  if (!textPruefung.ok) throw new WerkstattFehler(`Text abgelehnt: ${textPruefung.fehler.join(' · ')}`);

  const nummer = db.beitraegeZuInhalt(inhaltId).length + 1;
  const ordner = path.join(medienDir(dir), String(inhaltId), `beitrag-${nummer}`);
  const groesse = plan.format === 'story' ? 'story' : 'feed';
  const medienNachId = new Map(medien.map(m => [m.id, m]));
  const auftraege = []; const eintraege = [];
  plan.folien.forEach((folie, i) => {
    const quellen = new Set();
    const daten = loeseAuf(folie.daten, medienNachId, inhalt, quellen, dir);
    const datei = path.join(ordner, `${String(i + 1).padStart(2, '0')}.jpg`);
    auftraege.push({ ...baue(folie.vorlage, daten, groesse), datei });
    eintraege.push({ pfad: path.relative(dir, datei), art: 'bild', vorlage: folie.vorlage, quellen: [...quellen] });
  });
  try {
    await rendere(auftraege);
  } catch (e) {
    // Der Shop tauscht Produktbilder aus; die gemerkten Adressen laufen dann ins Leere.
    // Den Anlass freigeben, damit der naechste Shop-Abgleich ihn mit frischen Bildern neu anlegt.
    if (e instanceof RenderFehler && inhalt.quelle === 'shopify' && inhalt.schluessel) {
      db.inhaltAendern(inhaltId, { status: INHALT_STATUS.VERWORFEN, schluessel: `${inhalt.schluessel}:veraltet:${Date.now()}`, notiz: 'Produktbilder im Shop wurden ausgetauscht – wird beim nächsten Shop-Abgleich neu vorgeschlagen.' });
      throw new WerkstattFehler('Produktbilder im Shop haben sich geändert – der Anlass wird beim nächsten Shop-Abgleich neu angelegt.');
    }
    throw e;
  }

  const ziel = inhalt.daten?.url ?? (inhalt.produkt_handle ? `${BETRIEB.shop}/products/${inhalt.produkt_handle}` : null);
  const id = db.beitragAnlegen({
    inhalt_id: inhaltId, format: plan.format, plattformen: plattformen.filter(p => PLATTFORMEN.includes(p)),
    vorlage: plan.folien[0].vorlage, text: beitragText, text_facebook: textFacebook,
    hashtags: tags.join(' '), medien: eintraege,
  });
  const link = ziel ? shopLink(ziel, { beitragId: id, plattform: 'facebook' }) : null;
  let beitrag = db.beitragAendern(id, { link });

  if (inhalt.status === INHALT_STATUS.NEU) inhalt = db.inhaltAendern(inhaltId, { status: INHALT_STATUS.IN_PRUEFUNG });
  if (inhalt.status === INHALT_STATUS.IN_PRUEFUNG) inhalt = db.inhaltAendern(inhaltId, { status: INHALT_STATUS.CONTENT_ERSTELLT });

  const benutzt = medien.filter(m => eintraege.some(e => e.quellen.includes(m.id)));
  const urteil = pruefe({ beitrag, inhalt, medien: benutzt });
  beitrag = db.beitragAendern(id, { hinweise: urteil, auto_freigabe: autoFreigabeMoeglich({ beitrag, inhalt, medien: benutzt }, env) });
  db.ereignis(von, 'entwurf-erstellt', `beitrag:${id}`, { inhalt: inhaltId, format: plan.format, folien: plan.folien.length });
  return beitrag;
}
