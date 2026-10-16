/**
 * Instagram-Highlights: die fuenf Bereiche unter dem Profil (Verlegung, Referenzen, Im Laden, Muster,
 * Bewertungen). Am 16.10.2026 trugen vier davon nur ihr Titelbild.
 *
 * Die Graph-API kann Highlights weder lesen noch fuellen: eine Story landet nach 24 Stunden im Archiv,
 * einem Highlight hinzufuegen kann sie nur jemand in der Instagram-App. Deshalb:
 *   - Wie voll die Bereiche sind, traegt die Redaktion einmal je Woche ein (`highlights-stand`),
 *     nachdem sie das Profil im angemeldeten Chrome angesehen hat - nur lesend.
 *   - Welche veroeffentlichte Story in welchen Bereich gehoert, weiss das System selbst.
 *   - Der Bericht nennt beides, was fehlt: Storys zum Einsortieren (Inhaber, in der App) und
 *     Storys, die es noch gar nicht gibt (Redaktion, oder Fotos vom Inhaber).
 */

import fs from 'node:fs';
import path from 'node:path';
import { socialDir } from './pfade.mjs';
import { BEITRAG_STATUS } from './status.mjs';
import { HIGHLIGHTS } from './vorlagen.mjs';

const TAG = 24 * 60 * 60 * 1000;
export const STAND_VERALTET_TAGE = 8;

export const highlightPfad = (dir = socialDir()) => path.join(dir, 'highlights.json');

/** In welchen Bereich gehoert eine Story? `daten.bereich` (von der Redaktion gesetzt) geht vor. */
export function bereichVon(inhalt) {
  if (!inhalt) return null;
  if (HIGHLIGHTS.includes(inhalt.daten?.bereich)) return inhalt.daten.bereich;
  if (inhalt.quelle === 'referenz') return 'Referenzen';
  if (inhalt.quelle === 'baustelle') return 'Verlegung';
  if (inhalt.quelle === 'laden' || inhalt.typ === 'laden') return 'Im Laden';
  return null;
}

/**
 * Wie voll ist ein Bereich? Gezaehlt werden die Storys im Highlight einschliesslich des Titelbilds -
 * eine 1 heisst also: nur das Titelbild, fuer Besucher leer.
 */
export function zustand(segmente) {
  if (!Number.isInteger(segmente)) return 'unbekannt';
  if (segmente <= 1) return 'leer';
  if (segmente < 4) return 'dünn';
  return 'ok';
}

export function liesHighlightStand(dir = socialDir()) {
  try { return JSON.parse(fs.readFileSync(highlightPfad(dir), 'utf8')); } catch { return null; }
}

/** "Verlegung=3 Referenzen=1 'Im Laden'=1" -> {Verlegung: 3, …}. Unbekannte Bereiche brechen ab. */
export function leseZaehlung(paare) {
  const werte = {};
  for (const p of paare) {
    const m = /^(.+?)=(\d+)$/.exec(String(p).trim());
    if (!m) throw new Error(`„${p}“ – erwartet Bereich=Zahl, etwa Referenzen=1`);
    const name = HIGHLIGHTS.find(h => h.toLowerCase() === m[1].trim().toLowerCase());
    if (!name) throw new Error(`Unbekannter Bereich „${m[1]}“ (${HIGHLIGHTS.join(', ')})`);
    werte[name] = Number(m[2]);
  }
  return werte;
}

export function schreibeHighlightStand(werte, { dir = socialDir(), von = 'redaktion', einsortiert = [], jetzt = new Date() } = {}) {
  const alt = liesHighlightStand(dir) ?? {};
  const stand = {
    geprueft: Object.keys(werte).length ? jetzt.toISOString() : alt.geprueft ?? null,
    von: Object.keys(werte).length ? von : alt.von ?? null,
    bereiche: { ...(alt.bereiche ?? {}), ...werte },
    // Storys, die schon in einem Highlight stecken - sie tauchen nicht mehr als Aufgabe auf.
    einsortiert: [...new Set([...(alt.einsortiert ?? []), ...einsortiert.map(Number).filter(Number.isInteger)])].sort((a, b) => a - b),
  };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(highlightPfad(dir), JSON.stringify(stand, null, 2));
  return stand;
}

const AUFGABE_REDAKTION = {
  Verlegung: 'Story aus einer gesichteten Baustelle bauen (`entwurf <id> --format story`).',
  Referenzen: 'Story aus einer Referenz bauen (`entwurf <id> --format story`, Quelle referenz).',
  'Im Laden': 'Es gibt keine Fotos aus dem Laden – der Inhaber schickt Ausstellung, Musterwand und Team über den Upload-Link oder die WhatsApp-Gruppe.',
  Muster: 'Story „So kommen Sie an Muster“ bauen: `wissen-anlegen --bereich Muster`, Vorlage tipp, nur Schritte, die so im Shop stehen.',
  Bewertungen: 'Story aus echten Google-Bewertungen bauen: `wissen-anlegen --bereich Bewertungen`, Vorlage tipp, Wortlaut unverändert, ohne Namen.',
};

const kurzDatum = iso => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Berlin' });

/**
 * Was fehlt in den Highlights? Je Bereich: Stand, passende veroeffentlichte Storys, die noch
 * einsortiert werden koennen, und was die Redaktion bauen sollte.
 */
export function highlightBericht(db, { stand = null, jetzt = new Date(), jeBereich = 5 } = {}) {
  const geprueft = stand?.geprueft ? new Date(stand.geprueft) : null;
  const alterTage = geprueft ? Math.floor((jetzt.getTime() - geprueft.getTime()) / TAG) : null;
  const einsortiert = new Set(stand?.einsortiert ?? []);
  const storys = db.beitraege({ status: [BEITRAG_STATUS.VEROEFFENTLICHT, BEITRAG_STATUS.ARCHIV] })
    .filter(b => b.format === 'story' && b.plattformen.includes('instagram') && b.ergebnis?.instagram?.id && !einsortiert.has(b.id))
    .map(b => ({ id: b.id, am: b.veroeffentlicht_am, inhalt: db.inhalt(b.inhalt_id) }))
    .sort((a, b) => String(b.am).localeCompare(String(a.am)));

  const bereiche = HIGHLIGHTS.map((name) => {
    const segmente = stand?.bereiche?.[name];
    const z = zustand(segmente);
    const passend = storys.filter(s => bereichVon(s.inhalt) === name);
    // Volle Bereiche: nur, was seit der letzten Zaehlung erschienen ist. Leere: alles, was passt.
    const kandidaten = (z === 'ok' && geprueft ? passend.filter(s => new Date(s.am) > geprueft) : passend).slice(0, jeBereich);
    return {
      name, segmente: Number.isInteger(segmente) ? segmente : null, zustand: z,
      einsortieren: kandidaten.map(s => ({ beitrag: s.id, am: s.am, titel: s.inhalt?.titel ?? '' })),
      redaktion: (z === 'leer' || z === 'dünn') && !kandidaten.length ? AUFGABE_REDAKTION[name] : null,
    };
  });
  const inhaber = bereiche.filter(b => b.einsortieren.length).map(b => `Highlight „${b.name}“ gedrückt halten → „Highlight bearbeiten“ → Storys vom ${b.einsortieren.map(s => kurzDatum(s.am)).join(', ')} auswählen (Beiträge ${b.einsortieren.map(s => `#${s.beitrag}`).join(' ')})`);
  return {
    geprueft: geprueft?.toISOString() ?? null, alterTage,
    veraltet: !geprueft || alterTage > STAND_VERALTET_TAGE,
    leer: bereiche.filter(b => b.zustand === 'leer').map(b => b.name),
    bereiche, inhaber,
  };
}

/** Kurzfassung fuer `status`: eine Zeile je Bereich, dahinter, was zu tun ist. */
export function highlightZeilen(bericht) {
  const zeilen = [];
  const kopf = bericht.geprueft ? `Stand ${kurzDatum(bericht.geprueft)}${bericht.veraltet ? ' – neu zählen' : ''}` : 'noch nie gezählt – Redaktion: highlights-stand';
  zeilen.push(`Highlights (${kopf})`);
  for (const b of bericht.bereiche) {
    const zahl = b.segmente === null ? '?' : b.segmente <= 1 ? 'leer' : `${b.segmente - 1} Storys`;
    const aufgabe = b.einsortieren.length ? ` – ${b.einsortieren.length} Story/s zum Einsortieren` : b.redaktion ? ' – Story fehlt' : '';
    zeilen.push(`  ${b.name}: ${zahl}${aufgabe}`);
  }
  return zeilen;
}
