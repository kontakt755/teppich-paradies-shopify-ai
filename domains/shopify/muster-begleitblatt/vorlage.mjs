// A4-Begleitblatt fuer den Musterumschlag: Inhalt und HTML ohne Browser, damit Tests und
// Control Center (/api/kunden/muster-begleitblatt) dieselbe Vorlage nutzen. Kundendaten und die
// WhatsApp-Nummer kommen nur zur Laufzeit herein, nie ins Repository.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc, ORDNER as RATGEBER } from '../ratgeber-pdf/vorlage.mjs';
import { KONTAKT } from '../ratgeber-pdf/inhalte.mjs';

const ORDNER = dirname(fileURLToPath(import.meta.url));
const SHOP = 'https://www.teppich-paradies.net/products/';
const FIRMEN_WHATSAPP = '0179 2612211';
export const JE_BLATT = 3;
// Bis hierher sagt das Blatt "In Ihrer Naehe" - dieselbe Grenze wie der Verlegeservice im Shop.
const NAH_KM = 50;
const QR_PX = 76;
const QR_MIN_MODUL_MM = 0.4;

/** Ein Muster, zu dem es kein Blatt geben darf (keine Kaufseite, Farbe weg): der Grund steht im Knopf-Hinweis. */
export class BlattFehler extends Error {}

const datenUri = (datei, typ) => `data:${typ};base64,${readFileSync(join(RATGEBER, datei)).toString('base64')}`;

/** Der Dienst laeuft ohne Homebrew im PATH; deshalb die festen Orte zuerst. */
function qrencodeProgramm() {
  return ['/opt/homebrew/bin/qrencode', '/usr/local/bin/qrencode'].find(existsSync) || 'qrencode';
}

/** QR-Code als Bild-Adresse. Zu feine Module liest kein Handy zuverlaessig: lieber kein Blatt. */
export function qrBild(inhalt) {
  const svg = execFileSync(qrencodeProgramm(), ['-t', 'SVG', '-l', 'M', '-m', '0', '-o', '-', inhalt]);
  const module = Number(String(svg).match(/viewBox="0 0 (\d+)/)?.[1]);
  if (!module || QR_PX / 3.78 / module < QR_MIN_MODUL_MM) throw new BlattFehler('Der Link ist zu lang für einen lesbaren QR-Code.');
  return `data:image/svg+xml;base64,${svg.toString('base64')}`;
}

/** "Frau Helen Buchner" -> "Helen Buchner", "yvonne schwerdt" -> "Yvonne Schwerdt"; Gemischtes bleibt, wie es ist. */
export function anzeigename(name) {
  const n = String(name || '').trim().replace(/^(frau|herr)\s+/i, '');
  if (n !== n.toLowerCase() && n !== n.toUpperCase()) return n;
  return n.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, vor, b) => vor + b.toUpperCase());
}

/** "0176 12345678" -> Anzeige und Nummer fuer wa.me. Ohne Eintrag gilt die Firmennummer aus dem Shop. */
export function whatsappNummer(eintrag) {
  const anzeige = String(eintrag || FIRMEN_WHATSAPP).trim();
  const ziffern = anzeige.replace(/[\s/-]/g, '');
  if (!/^0\d{9,12}$/.test(ziffern)) throw new BlattFehler('Die WhatsApp-Nummer in den Einstellungen stimmt nicht.');
  return { anzeige, wa: `49${ziffern.slice(1)}` };
}

let gebiet = null;
/** Nah nur, wenn die ganze Postleitzahl innerhalb der Grenze liegt: "Aufmass kostenlos" ist eine Zusage. */
export function istNah(plz) {
  gebiet ??= JSON.parse(readFileSync(join(ORDNER, '../../../assets/tp-verlegegebiet-orte.json'), 'utf8'));
  const spanne = gebiet.plz[String(plz || '').trim()];
  return (typeof spanne === 'number' ? spanne : spanne?.[1] ?? Infinity) <= NAH_KM;
}

/** "4,9 aus 246" (Stand des Monatslaufs) -> Text; fehlt er, steht keine Note auf dem Blatt. Geschaetzt wird nie. */
export function bewertungText(meldung) {
  const m = String(meldung || '').match(/^(\d,\d) aus (\d+)$/);
  return m ? `${m[1]} von 5 · ${m[2]} Google-Bewertungen` : null;
}

const quellAngabe = (position, schluessel) => (position?.customAttributes || []).find(a => a.key === schluessel)?.value || null;

/**
 * Kaufseite und Farbe, die der Kunde beim Muster angesehen hat. Bricht mit BlattFehler ab statt zu
 * raten: ein QR-Code auf eine falsche Farbe oder eine tote Seite ist schlimmer als kein Blatt.
 * @param {object} m                  Muster aus der Packliste
 * @param {object} position           dieselbe Position aus dem Bestellexport
 * @param {Map<string, object>} produkte  Produkte aus dem Lexikon je Handle; Archiviertes steht dort nicht
 */
export function musterZiel(m, position, produkte) {
  const { titel, farbe } = m.bestellt;
  const bezeichnung = farbe ? `${titel} (${farbe})` : titel;
  if (titel.startsWith('Muster:')) {
    const handle = String(m.etikett?.url || '').split('/').pop();
    const p = produkte.get(handle);
    if (!p?.varianten?.some(v => v.verfuegbar)) throw new BlattFehler(`${bezeichnung} ist im Shop nicht verfügbar.`);
    return { name: titel.slice('Muster:'.length).trim(), farbe: null, typ: p.produktgruppe || '', url: `${SHOP}${handle}?utm_source=musterblatt` };
  }
  const handle = quellAngabe(position, '_Quellprodukt');
  const variante = quellAngabe(position, '_Quellvariante_ID');
  if (!handle || !variante) throw new BlattFehler(`Zu ${bezeichnung} ist die Kaufseite nicht bekannt.`);
  const p = produkte.get(handle);
  const v = p?.varianten?.find(x => String(x.id).split('/').pop() === String(variante));
  if (!v?.verfuegbar) throw new BlattFehler(`${bezeichnung} ist im Shop nicht verfügbar.`);
  if (v.farbe !== farbe && v.titel !== farbe && !String(v.titel).startsWith(`${farbe} /`)) throw new BlattFehler(`${bezeichnung} passt nicht zur Farbe im Shop.`);
  return { name: titel.replace(/^Muster /, '').trim(), farbe, typ: p.produktgruppe || '', url: `${SHOP}${handle}?variant=${encodeURIComponent(variante)}&utm_source=musterblatt` };
}

const BODEN = {
  ware: 'Ihren Boden', ort: 'der neue Belag', spalte: 'Preis und Menge', schritt: 'Menge klären und bestellen',
  schreiben: 'Ihre Farbe und Raummaße, bei Nischen gern als Skizze. Sie erhalten von uns Menge, Preis und Kontodaten',
  nah: 'Aufmaß vor Ort kostenlos, Verlegung durch unser eigenes Team, Laden in Oranienburg.', fern: 'und rechnen Ihnen die Menge gern kostenlos nach.',
};
const TEPPICH = {
  ware: 'Ihren Teppich', ort: 'der neue Teppich', spalte: 'Preis und Maß', schritt: 'Maß klären und bestellen',
  schreiben: 'Ihre Farbe und Ihr Wunschmaß. Sie erhalten von uns Preis und Kontodaten',
  nah: 'Beratung in unserem Laden in Oranienburg.', fern: 'und beraten Sie gern zum passenden Maß.',
};

const NUMMER = 'flex: none; width: 28px; height: 28px; border-radius: 50%; background: #b93841; color: #ffffff; font-size: 15px; display: flex; align-items: center; justify-content: center;';
const H2 = 'display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 700;';
const KASTEN = 'display: inline-block; width: 22px; height: 22px; border: 1.5px solid #5e5853; border-radius: 3px;';
const WHATSAPP_LOGO = 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z';

function kopfzeile(nummern, tag, logo) {
  const titel = nummern.length === 1 ? `Ihre Musterbestellung ${nummern[0]}` : `Ihre Musterbestellungen ${nummern.join(' und ')}`;
  return `<header style="display: flex; align-items: center; justify-content: space-between; padding-bottom: 14px; border-bottom: 2px solid #b93841;">
    <img src="${logo}" alt="Teppich Paradies" style="height: 50px; width: auto; display: block;">
    <div style="text-align: right; font-size: 13px; color: #5e5853;">
      <div style="font-weight: 700; color: #1f1c1b;">${esc(titel)}</div>
      <div>Bestellt am ${esc(tag)}</div>
    </div>
  </header>`;
}

function musterTabelle(muster, text, qr) {
  const zeilen = muster.map(z => {
    const unter = z.farbe ? `Farbe ${z.farbe}` : z.typ;
    return `<tr style="border-top: 1px solid #cfc4b6;">
      <td style="padding: 6px 0;"><strong style="display: block; font-size: 16px;">${esc(z.name)}</strong>${esc(unter)}</td>
      <td style="text-align: center;"><span style="${KASTEN}"></span></td>
      <td style="text-align: center;"><span style="${KASTEN}"></span></td>
      <td style="text-align: center;"><span style="${KASTEN}"></span></td>
      <td style="text-align: center;"><span style="display: inline-block; width: 22px; height: 22px; border: 2px solid #1f1c1b; border-radius: 50%;"></span></td>
      <td style="padding: 6px 0; text-align: right;"><img src="${qr(z.url)}" alt="QR-Code zur Produktseite von ${esc([z.name, z.farbe].filter(Boolean).join(', Farbe '))}" style="width: ${QR_PX}px; height: ${QR_PX}px; display: inline-block; vertical-align: middle;"></td>
    </tr>`;
  }).join('');
  return `<table style="width: 100%; border-collapse: collapse; font-size: 14px;">
    <thead><tr style="font-size: 12px; font-weight: 600; color: #5e5853; text-align: center;">
      <th scope="col" style="padding: 0 0 6px; font-weight: 600; text-align: left;">Ihr Muster</th>
      <th scope="col" style="padding: 0 4px 6px; font-weight: 600; width: 70px;">Tageslicht</th>
      <th scope="col" style="padding: 0 4px 6px; font-weight: 600; width: 70px;">Abendlicht</th>
      <th scope="col" style="padding: 0 4px 6px; font-weight: 600; width: 70px;">Passt zu Möbeln</th>
      <th scope="col" style="padding: 0 4px 6px; font-weight: 700; width: 70px; color: #1f1c1b;">Mein Favorit</th>
      <th scope="col" style="padding: 0 0 6px 8px; font-weight: 600; width: 104px; text-align: right;">${text.spalte}</th>
    </tr></thead>
    <tbody>${zeilen}</tbody>
  </table>`;
}

const FUSS = `<footer style="margin-top: 12px; padding-top: 9px; border-top: 1px solid #cfc4b6; font-size: 12px; color: #5e5853; display: flex; justify-content: space-between; gap: 12px;">
    <span>${esc(KONTAKT.firma)} · Saarlandstraße 73–81 · 16515 Oranienburg</span>
    <span>www.${esc(KONTAKT.web)}</span>
  </footer>`;
const blattRahmen = (nr, inhalt) => `<div class="blatt" data-umschlag="${esc(nr)}" style="width: 794px; height: 1123px; box-sizing: border-box; padding: 36px 48px 26px; display: flex; flex-direction: column; background: #ffffff; color: #1f1c1b; font-family: Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.42;">${inhalt}</div>`;

/**
 * Die Blaetter eines Umschlags. Ab 4 Mustern kommt ein zweites Blatt, weil auf dem ersten drei Zeilen Platz haben.
 * @param {{nummern: string[], name: string, tag: string, nah: boolean, muster: object[]}} u
 */
function blaetter(u, { whatsapp, bewertung, qr, logo }) {
  const teppich = u.muster.every(z => z.name.includes('Teppich nach Maß'));
  const text = teppich ? TEPPICH : BODEN;
  const kopf = kopfzeile(u.nummern, u.tag, logo);
  const rest = u.muster.slice(JE_BLATT);
  const waText = `Hallo, zu Musterbestellung ${u.nummern[0]} möchte ich bestellen. Farbe: , Maße: `;
  const waBild = qr(`https://wa.me/${whatsapp.wa}?text=${encodeURIComponent(waText)}`);
  const erstes = blattRahmen(u.nummern[0], `${kopf}
  <section style="padding: 16px 0 13px;">
    <div style="font-size: 22px; line-height: 1.2; font-weight: 600; color: #5e5853;">Guten Tag</div>
    <h1 style="margin: 0; font-size: 48px; line-height: 1.08; font-weight: 700; letter-spacing: -0.02em; color: #8e2a31">${esc(u.name)},</h1>
    <p style="margin: 8px 0 0; font-size: 20px; line-height: 1.25; font-weight: 700;">${u.muster.length === 1 ? 'Ihr Muster ist da.' : 'Ihre Muster sind da.'} So finden Sie in drei Schritten ${text.ware}.</p>
    <p style="margin: 5px 0 0;">Haben Sie unterwegs eine Frage? Rufen Sie einfach an, wir beraten Sie persönlich.</p>
  </section>
  <section style="padding-bottom: 16px;">
    <h2 style="margin: 0 0 9px; ${H2}"><span style="${NUMMER}">1</span>Im Raum vergleichen</h2>
    <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; font-size: 14px;">
      <div><strong style="display: block;">Auf den Boden legen</strong>Genau dort, wo ${text.ort} hinkommt.</div>
      <div><strong style="display: block;">Tagsüber und abends ansehen</strong>Farben wirken bei Tageslicht und Lampenlicht anders.</div>
      <div><strong style="display: block;">Neben Möbel halten</strong>Auch neben Türen und die Wandfarbe.</div>
    </div>
  </section>
  <section style="padding-bottom: 14px;">
    <h2 style="margin: 0 0 8px; ${H2}"><span style="${NUMMER}">2</span>Favorit ankreuzen und ansehen${rest.length ? `<span style="font-size: 13px; font-weight: 500; color: #5e5853;">Muster 1 bis ${JE_BLATT} von ${u.muster.length}, die weiteren auf Blatt 2</span>` : ''}</h2>
    ${musterTabelle(u.muster.slice(0, JE_BLATT), text, qr)}
    <p style="margin: 2px 0 0; padding-top: 7px; border-top: 1px solid #cfc4b6; font-size: 13px; color: #5e5853;">QR-Code scannen: Sie sehen genau diese Farbe mit Preis und können direkt bestellen. Ohne Handy? Nennen Sie uns am Telefon Ihre Bestellnummer. Noch nicht das Richtige dabei? Wir suchen gern weitere Farben heraus.</p>
  </section>
  <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; flex-grow: 1; min-height: 0;">
    <section>
      <h2 style="margin: 0 0 9px; ${H2}"><span style="${NUMMER}">3</span>${text.schritt}</h2>
      <p style="margin: 0; font-size: 14px;">Schreiben Sie uns ${text.schreiben} und <strong>zahlen vorab bequem per Überweisung.</strong></p>
      <div style="display: flex; align-items: flex-end; gap: 8px; margin-top: 12px; font-size: 14px; font-weight: 600;">
        <span>Länge</span><span style="flex: 1; border-bottom: 1.5px solid #5e5853;"></span><span>m</span>
        <span style="padding: 0 2px;">×</span>
        <span>Breite</span><span style="flex: 1; border-bottom: 1.5px solid #5e5853;"></span><span>m</span>
      </div>
      <div style="display: flex; align-items: center; gap: 12px; margin-top: 10px; padding: 6px 10px; background: #e8f7ee; border: 1.5px solid #25d366; border-radius: 8px;">
        <div style="flex: none; padding: 5px; background: #ffffff; border-radius: 4px;"><img src="${waBild}" alt="QR-Code zu WhatsApp mit vorbereitetem Text" style="width: ${QR_PX}px; height: ${QR_PX}px; display: block;"></div>
        <div style="font-size: 13px; line-height: 1.35;">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 3px; font-size: 15px; font-weight: 700; color: #0a6b52;">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="#25d366" style="flex: none;" aria-hidden="true"><path d="${WHATSAPP_LOGO}"></path></svg>
            Per WhatsApp bestellen
          </div>
          QR-Code scannen: WhatsApp öffnet sich, Ihr Text ist schon vorbereitet.<br>Oder an <strong>${esc(whatsapp.anzeige)}</strong> schreiben.
        </div>
      </div>
    </section>
    <section style="background: #f7f3ee; border-radius: 8px; padding: 13px 16px; display: flex; flex-direction: column;">
      <h2 style="margin: 0; font-size: 18px; font-weight: 700;">Lieber persönlich fragen?</h2>
      <div style="font-size: 25px; font-weight: 800; letter-spacing: -0.01em; margin-top: 3px;">${esc(KONTAKT.telefon)}</div>
      <div style="font-size: 13px;">${esc(KONTAKT.zeiten)}<br>${esc(KONTAKT.mail)}</div>
      ${bewertung ? `<div style="display: flex; align-items: center; gap: 6px; margin-top: 11px; font-size: 14px; font-weight: 700;">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="#d6a23d" stroke="#8a6518" stroke-width="1" aria-hidden="true"><path d="M12 2.8l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5L2.6 9.6l6.5-.9z"></path></svg>
        ${esc(bewertung)}
      </div>
      <p style="margin: 3px 0 0; font-size: 12px; line-height: 1.35; color: #5e5853;">Wir prüfen nicht, ob die Verfasser bei uns gekauft haben.</p>` : ''}
      ${u.nah
    ? `<p style="margin: 9px 0 0; font-size: 14px;"><strong>In Ihrer Nähe:</strong> ${text.nah}</p>`
    : `<p style="margin: 9px 0 0; font-size: 14px;"><strong>Wir liefern deutschlandweit</strong> ${text.fern}</p>`}
    </section>
  </div>
  ${FUSS}`);
  if (!rest.length) return erstes;
  return erstes + blattRahmen(u.nummern[0], `${kopf}
  <section style="padding: 22px 0 14px;">
    <h2 style="margin: 0 0 12px; font-size: 22px; font-weight: 700;">Ihre weiteren Muster</h2>
    ${musterTabelle(rest, text, qr)}
    <p style="margin: 2px 0 0; padding-top: 7px; border-top: 1px solid #cfc4b6; font-size: 13px; color: #5e5853;">QR-Code scannen: Sie sehen genau diese Farbe mit Preis und können direkt bestellen. Ihre Fragen und Ihre Bestellung nehmen wir wie auf Blatt 1 beschrieben gern entgegen.</p>
  </section>
  <div style="flex-grow: 1;"></div>
  ${FUSS}`);
}

/** Alle Blaetter als ein Dokument, Reihenfolge wie uebergeben (Packreihenfolge). */
export function blaetterHtml(umschlaege, { whatsapp, bewertung = null, qr = qrBild }) {
  const logo = datenUri('logo.png', 'image/png');
  const schriften = [400, 500, 700].map(w => `@font-face{font-family:'Inter';src:url(${datenUri(`inter-${w}.woff`, 'font/woff')}) format('woff');font-weight:${w};font-style:normal}`).join('');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Muster-Begleitblatt</title><style>${schriften}
@page{size:A4;margin:0}html,body{margin:0}.blatt{break-after:page}.blatt:last-child{break-after:auto}</style></head><body>${umschlaege.map(u => blaetter(u, { whatsapp, bewertung, qr, logo })).join('')}</body></html>`;
}
