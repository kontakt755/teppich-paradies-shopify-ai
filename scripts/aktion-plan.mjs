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
  if (welle.id === 'black-week') {
    const bf = blackFriday(jahr);
    return { von: tag(plusTage(bf, -4)), bis: tag(plusTage(bf, 3)) };
  }
  return { von: `${jahr}-${welle.von}`, bis: `${jahr}-${welle.bis}` };
}

export function status(z, heute) {
  if (heute > z.bis) return 'vorbei';
  if (heute >= z.von) return 'laeuft';
  return `in ${Math.round((Date.parse(z.von) - Date.parse(heute)) / 864e5)} Tagen`;
}

export function mutationen(welle, jahr) {
  const z = zeitraum(welle, jahr);
  const titel = `${welle.titel} ${jahr}`;
  return {
    hinweis: `Nach Freigabe ueber den Shopify-MCP ausfuehren: zuerst {{KOLLEKTION_GID}} fuer "${welle.kollektion}" nachschlagen und einsetzen, dann beide Mutationen, dann gegenpruefen (Produktseite, Warenkorb).`,
    kollektion_handle: welle.kollektion,
    rabatt: {
      query: 'mutation($d: DiscountAutomaticBasicInput!) { discountAutomaticBasicCreate(automaticBasicDiscount: $d) { automaticDiscountNode { id } userErrors { field message } } }',
      variables: {
        d: {
          title: titel,
          // Ende einschliesslich: bis 23:59:59 Berliner Zeit (Winterzeit +01:00)
          startsAt: `${z.von}T00:00:00+01:00`,
          endsAt: `${z.bis}T23:59:59+01:00`,
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
            { key: 'aktiv', value: 'true' },
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
  const heute = tag(new Date());
  const jahr = a.jahr || Number(heute.slice(0, 4));

  if (a.welle) {
    const w = kal.wellen.find((x) => x.id === a.welle);
    if (!w) { console.error(`Welle "${a.welle}" steht nicht im Kalender.`); process.exit(2); }
    if (!(w.prozent > 0 && w.prozent <= 50)) {
      console.error(`Welle "${w.id}" hat keinen Prozentsatz (1-50). Erst Inhaber-Freigabe, dann in aktionskalender.json eintragen.`);
      process.exit(1);
    }
    const datei = `aktion-${w.id}-${jahr}.json`;
    writeFileSync(datei, JSON.stringify(mutationen(w, jahr), null, 2) + '\n');
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
    const warn = imVorlauf && !w.prozent ? '  ← Freigabe noetig' : '';
    if (warn) fehlt++;
    console.log(`  ${z.von} – ${z.bis}  ${w.titel.padEnd(22)} ${w.kollektion.padEnd(32)} ${pr.padEnd(14)} ${s}${warn}`);
  }
  if (fehlt) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
