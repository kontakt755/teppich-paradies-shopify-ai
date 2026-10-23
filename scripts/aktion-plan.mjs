#!/usr/bin/env node
/**
 * Aktionskalender: welche Welle laeuft, welche steht an - und die passenden
 * Admin-Mutationen fuer eine Welle, aus EINER Quelle.
 *
 *   npm run -s aktion:plan                          # Jahresuebersicht, Exit 1 wenn eine Welle im Vorlauf ohne Prozent ist
 *   npm run -s aktion:plan -- --jahr 2027
 *   npm run -s aktion:plan -- --welle black-week    # schreibt aktion-<id>-<jahr>.json mit beiden Mutationen
 *
 * ─── Warum ───────────────────────────────────────────────────────────
 * Eine Aktion braucht zwei Eintraege mit gleichen Werten: den automatischen
 * Shopify-Rabatt (rechnet ab) und das Metaobjekt tp_aktion (zeigt an:
 * Top-Leiste, Produktseite, Karte, Rollenrechner). Von Hand laufen die
 * auseinander. Hier entstehen beide aus domains/shopify/aktionskalender.json.
 *
 * ─── Was es NICHT tut ────────────────────────────────────────────────
 * Es schreibt nichts in Shopify. Die Shopify-CLI hat keinen Rabatt-Zugriff
 * (read_discounts fehlt); die Datei wird nach Freigabe des Inhabers ueber den
 * Shopify-MCP ausgefuehrt (graphql_mutation), danach gegenpruefen. Preise und
 * Rabatte nur mit Freigabe (AGENTS.md).
 *
 * Black Week rechnet sich jedes Jahr neu: Montag vor Black Friday (Freitag
 * nach dem vierten Donnerstag im November) bis Cyber Monday.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KALENDER = path.join(ROOT, 'domains/shopify/aktionskalender.json');

export function blackFriday(jahr) {
  const ersterNov = new Date(Date.UTC(jahr, 10, 1)).getUTCDay();
  const ersterDo = 1 + ((4 - ersterNov + 7) % 7);
  return new Date(Date.UTC(jahr, 10, ersterDo + 21 + 1));
}

const tag = (d) => d.toISOString().slice(0, 10);
const plusTage = (d, n) => new Date(d.getTime() + n * 864e5);

export function zeitraum(welle, jahr) {
  if (!Number.isInteger(jahr) || jahr < 2000 || jahr > 9999) throw new Error('Jahr muss eine ganze Zahl von 2000 bis 9999 sein.');
  if (welle.id === 'black-week') {
    const bf = blackFriday(jahr);
    return { von: tag(plusTage(bf, -4)), bis: tag(plusTage(bf, 3)) };
  }
  const z = { von: `${jahr}-${welle.von}`, bis: `${jahr}-${welle.bis}` };
  for (const datum of Object.values(z)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datum) || new Date(`${datum}T00:00:00Z`).toISOString().slice(0, 10) !== datum) {
      throw new Error('Aktionsdatum ist ungueltig.');
    }
  }
  if (z.bis < z.von) throw new Error('Aktionsende liegt vor dem Start.');
  return z;
}

/** Berliner Ortszeit samt Sommerzeit; Start und Ende werden getrennt bestimmt. */
export function zeitpunktBerlin(datum, ende = false) {
  const uhr = ende ? '23:59:59' : '00:00:00';
  const lokal = Date.parse(`${datum}T${uhr}Z`);
  const zone = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Berlin', timeZoneName: 'longOffset' });
  const offset = zeit => zone.formatToParts(new Date(zeit)).find(p => p.type === 'timeZoneName').value.replace('GMT', '');
  let zeit = lokal;
  for (let i = 0; i < 3; i++) {
    const o = offset(zeit);
    const [, vorzeichen, stunden, minuten] = o.match(/^([+-])(\d{2}):(\d{2})$/);
    zeit = lokal - (vorzeichen === '+' ? 1 : -1) * (Number(stunden) * 60 + Number(minuten)) * 60e3;
  }
  return `${datum}T${uhr}${offset(zeit)}`;
}

export function status(z, heute) {
  if (heute > z.bis) return 'vorbei';
  if (heute >= z.von) return 'laeuft';
  return `in ${Math.round((Date.parse(z.von) - Date.parse(heute)) / 864e5)} Tagen`;
}

export function mutationen(welle, jahr) {
  if (welle.freigegeben !== true) throw new Error('Aktionswelle ist fachlich noch nicht freigegeben: Prozent, Kollektion und Ausnahmen klaeren.');
  if (!Number.isInteger(welle.prozent) || welle.prozent < 1 || welle.prozent > 50) throw new Error('Prozentsatz muss eine ganze Zahl von 1 bis 50 sein.');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(welle.kollektion || '')) throw new Error('Gueltiger Kollektions-Handle fehlt.');
  const z = zeitraum(welle, jahr);
  const titel = `${welle.titel} ${jahr}`;
  return {
    hinweis: `Nur Vorbereitung, keine Aktivierung: {{KOLLEKTION_GID}} fuer "${welle.kollektion}" nachschlagen und Sortiment auf bereits reduzierte Ware, Muster, Zubehoer und Auslauf pruefen. Erst den Rabatt anlegen und mit Prozent, Ziel und Berliner Zeitgrenzen zuruecklesen. Die Anzeige wird absichtlich inaktiv angelegt; erst nach passendem Rabatt und Gegenprobe von Produktseite/Rechner/Warenkorb aktivieren, danach die Topbar freischalten. Bei Fehlern keine Anzeige aktivieren.`,
    kollektion_handle: welle.kollektion,
    rabatt: {
      query: 'mutation($d: DiscountAutomaticBasicInput!) { discountAutomaticBasicCreate(automaticBasicDiscount: $d) { automaticDiscountNode { id } userErrors { field message } } }',
      variables: {
        d: {
          title: titel,
          startsAt: zeitpunktBerlin(z.von),
          endsAt: zeitpunktBerlin(z.bis, true),
          combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
          customerGets: {
            value: { percentage: welle.prozent / 100 },
            items: { collections: { add: ['{{KOLLEKTION_GID}}'] } },
          },
        },
      },
    },
    anzeige: {
      query: 'mutation($m: MetaobjectCreateInput!) { metaobjectCreate(metaobject: $m) { metaobject { id handle } userErrors { field message } } }',
      variables: {
        m: {
          type: 'tp_aktion',
          handle: `${welle.id}-${jahr}`,
          fields: [
            { key: 'titel', value: welle.titel },
            { key: 'prozent', value: String(welle.prozent) },
            { key: 'kollektion', value: '{{KOLLEKTION_GID}}' },
            { key: 'start', value: z.von },
            { key: 'ende', value: z.bis },
            { key: 'aktiv', value: 'false' },
          ],
        },
      },
    },
  };
}

function main() {
  const a = { jahr: null, welle: null };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--jahr') a.jahr = Number(argv[++i]);
    else if (argv[i] === '--welle') a.welle = argv[++i];
    else { console.error(`Unbekannte Option: ${argv[i]}`); process.exit(2); }
  }
  const kal = JSON.parse(readFileSync(KALENDER, 'utf8'));
  const heute = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
  const jahr = a.jahr ?? Number(heute.slice(0, 4));
  if (!Number.isInteger(jahr) || jahr < 2000 || jahr > 9999) throw new Error('Jahr muss eine ganze Zahl von 2000 bis 9999 sein.');

  if (a.welle) {
    const w = kal.wellen.find((x) => x.id === a.welle);
    if (!w) { console.error(`Welle "${a.welle}" steht nicht im Kalender.`); process.exit(2); }
    const entwurf = mutationen(w, jahr);
    const datei = `aktion-${w.id}-${jahr}.json`;
    writeFileSync(datei, JSON.stringify(entwurf, null, 2) + '\n', { flag: 'wx' });
    console.log(`${datei} geschrieben - nichts in Shopify angelegt.`);
    return;
  }

  let fehlt = 0;
  console.log(`Aktionskalender ${jahr} (heute ${heute})`);
  for (const w of kal.wellen) {
    const z = zeitraum(w, jahr);
    const s = status(z, heute);
    const tage = (Date.parse(z.von) - Date.parse(heute)) / 864e5;
    const imVorlauf = s === 'laeuft' || (tage > 0 && tage <= kal.vorlauf_tage);
    const pr = w.prozent ? `${w.prozent} %` : 'Prozent offen';
    const warn = imVorlauf && (w.freigegeben !== true || !w.prozent) ? '  ← Prozent, Kollektion und Ausnahmen offen' : '';
    if (warn) fehlt++;
    console.log(`  ${z.von} – ${z.bis}  ${w.titel.padEnd(22)} ${w.kollektion.padEnd(32)} ${pr.padEnd(14)} ${s}${warn}`);
  }
  if (fehlt) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main(); } catch (e) { console.error(e.message); process.exitCode = 1; }
}
