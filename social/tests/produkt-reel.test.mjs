import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { veroeffentlicheFaellige } from '../lib/ablauf.mjs';
import { autoFreigabeMoeglich, freigebenAutomatisch, pruefe } from '../lib/freigabe.mjs';
import { erstelleClient } from '../lib/meta.mjs';
import {
  auftragVorlage, bildName, erstelleProduktReel, hauptText, leseCsv, liveDaten, produktReelSperren,
  pruefeAuftrag, pruefeLive, ReelFehler, reelKandidaten, werbeFreigabe,
} from '../lib/produkt-reel.mjs';
import { testDb, tmpDir } from './_hilfe.mjs';

const ERLAUBT = 'Inhaber 10.10.: Shop und Werbung erlaubt';

function rechte(zeilen) {
  const nachMedium = new Map(); const nachHandle = new Map();
  for (const z of zeilen) {
    const zeile = { status: 'geprueft', bildtyp: 'raum', bearbeitet: 'nein', lizenz: ERLAUBT, ...z };
    nachMedium.set(zeile.media_id.replace(/^gid:\/\/shopify\/MediaImage\//, ''), zeile);
    if (!nachHandle.has(zeile.produkt_handle)) nachHandle.set(zeile.produkt_handle, []);
    nachHandle.get(zeile.produkt_handle).push(zeile);
  }
  return { nachMedium, nachHandle };
}

function feed(handle, extra = {}) {
  return {
    title: `${handle} Eiche Sand – Laminat 8 mm`, handle, product_type: 'Laminat', tags: [],
    options: [{ name: 'Title', position: 1, values: ['Default Title'] }],
    images: [{ id: 1, src: `https://cdn.shopify.com/s/files/1/x/${handle}-raumbild-1.jpg?v=1`, width: 5043, height: 3783, alt: 'Raum', variant_ids: [] }],
    variants: [{ id: 11, title: 'Default Title', price: '58.82', compare_at_price: null, available: true }],
    ...extra,
  };
}

const AUFTRAG = {
  handle: 'lund-eiche-sand', standbild: 'https://cdn.shopify.com/s/files/1/x/lund-eiche-sand-raumbild-1.jpg?v=1',
  ausschnitt: [1000, 0, 3026.4, 3783], zoom: [1, 1.08], anker: [2500, 3000], produktflaeche: [1200, 2800, 3300, 3700],
  varianten: { 'Default Title': '58,82' },
  belege: ['29,50 €/m²', '1 Paket = 1,994 m²', 'Klasse 33'],
  zeilen: { kicker: 'Laminat · 8 mm', name: 'Lund Eiche Sand', preis: '29,50 €/m²', preis_zusatz: '58,82 € pro Paket (1,994 m²)', merkmale: 'Klasse 33 · für Fußbodenheizung' },
};

/** Shop-Ersatz: products.js, Produktseite und Bild vom CDN. */
function scheinShop({ preis = 5882, vergleich = null, tags = [], seite = null, bot = false } = {}) {
  const aufrufe = [];
  const holen = async (url) => {
    aufrufe.push(url);
    const u = new URL(url);
    if (u.hostname === 'cdn.shopify.com') return { ok: true, status: 200, headers: new Map([['content-type', 'image/jpeg']]), arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
    if (u.pathname.endsWith('.js')) {
      if (bot) return { ok: true, status: 200, text: async () => '<!DOCTYPE html><title>Verifying your connection</title>' };
      return { ok: true, status: 200, text: async () => JSON.stringify({
        title: 'Lund Eiche Sand – Laminat 8 mm', type: 'Laminat', available: true, tags,
        variants: [{ title: 'Default Title', price: preis, compare_at_price: vergleich, available: true }],
        media: [{ id: 74219948212558, src: 'https://cdn.shopify.com/s/files/1/x/lund-eiche-sand-raumbild-1.jpg?v=1', alt: 'Raumbeispiel' }],
      }) };
    }
    return { ok: true, status: 200, text: async () => seite ?? '<html><main><script>var x = "1,00 €";</script><p>29,50&nbsp;€/m²</p><p>1 Paket = 1,994 m²</p><p>Klasse 33</p></main></html>' };
  };
  return { holen, aufrufe };
}

/** Werkzeug-Ersatz: schreibt Video und Pruefblatt, meldet das Ergebnis der Schaerfepruefung. */
const scheinWerkzeug = (ok = true) => async (modus, datei) => {
  const a = JSON.parse(fs.readFileSync(datei, 'utf8'));
  fs.writeFileSync(a.aus, Buffer.alloc(2048)); fs.writeFileSync(a.pruefblatt, 'jpg');
  return { ok, gruende: ok ? [] : ['bei 9.9 s weicher als das Standbild (0.81)'], video: a.aus, pruefblatt: a.pruefblatt,
    ganzes_video: { bilder: 276, schaerfe_min: ok ? 1.01 : 0.81, psnr_min_db: 40.5, ruckeln_max_px: 0.11 }, zeitpunkte: [] };
};

const TEXT = 'Lund Eiche Sand: Laminat mit ruhiger, heller Maserung und 8 mm Gesamtstärke. Muster gibt es kostenlos im Shop.';

test('CSV der Bildrechte: Semikolon, Anfuehrungszeichen, Zeilenumbruch im Feld, BOM', () => {
  const z = leseCsv('﻿media_id;lizenz;notiz\n1;"Shop; Werbung";"zwei\nZeilen"\r\n2;"""zitiert""";\n');
  assert.deepEqual(z, [{ media_id: '1', lizenz: 'Shop; Werbung', notiz: 'zwei\nZeilen' }, { media_id: '2', lizenz: '"zitiert"', notiz: '' }]);
});

test('Werbefreigabe: nur ausdruecklich fuer Werbung, KI-bearbeitet und umgefaerbt werden markiert', () => {
  assert.deepEqual(werbeFreigabe({ status: 'geprueft', lizenz: ERLAUBT, bearbeitet: 'nein' }), { erlaubt: true, bearbeitet: false, grund: null, lizenz: ERLAUBT });
  assert.equal(werbeFreigabe({ status: 'geprueft', lizenz: 'Freigabe Hersteller (Inhaber 2026-10-10)' }).erlaubt, false, 'Herstellerfreigabe gilt nur fuer den Shop');
  assert.equal(werbeFreigabe({ status: 'ungeklaert', lizenz: ERLAUBT }).erlaubt, false);
  assert.equal(werbeFreigabe({ status: 'geprueft', lizenz: 'eigenes KI-Bild; Bildrechte inkl. KI (Inhaber 10.10.2026)' }).bearbeitet, true);
  assert.equal(werbeFreigabe({ status: 'geprueft', lizenz: ERLAUBT, bearbeitet: 'ja – nur Boden per Maske lokal umgefaerbt (keine KI)' }).bearbeitet, true);
  assert.equal(werbeFreigabe({ status: 'geprueft', lizenz: ERLAUBT, bearbeitet: 'ja – CMYK nach sRGB umgerechnet' }).bearbeitet, false);
  assert.equal(werbeFreigabe(undefined).erlaubt, false);
  assert.equal(bildName('https://cdn.shopify.com/s/files/1/x/Lund-Raum_0a1b2c3d-1111-2222-3333-444455556666.jpg?v=9'), 'lund-raum.jpg');
});

test('Kandidaten: ohne Aktion, Auslauf und kleine Bilder; echte Fotos zuerst; Ruhezeit nach dem letzten Beitrag', () => {
  const br = rechte([
    { media_id: 'gid://shopify/MediaImage/1', produkt_handle: 'echt', datei: 'echt-raumbild-1.jpg' },
    { media_id: 'gid://shopify/MediaImage/2', produkt_handle: 'ki', datei: 'ki-raumbild-1.jpg', bearbeitet: 'ja (KI)' },
    { media_id: 'gid://shopify/MediaImage/3', produkt_handle: 'aktion', datei: 'aktion-raumbild-1.jpg' },
    { media_id: 'gid://shopify/MediaImage/4', produkt_handle: 'auslauf', datei: 'auslauf-raumbild-1.jpg' },
    { media_id: 'gid://shopify/MediaImage/5', produkt_handle: 'klein', datei: 'klein-raumbild-1.jpg' },
    { media_id: 'gid://shopify/MediaImage/6', produkt_handle: 'nurshop', datei: 'nurshop-raumbild-1.jpg', lizenz: 'Freigabe Hersteller (Inhaber 2026-10-10)' },
    { media_id: 'gid://shopify/MediaImage/7', produkt_handle: 'beworben', datei: 'beworben-raumbild-1.jpg' },
  ]);
  const liste = reelKandidaten({
    feed: [
      feed('ki'), feed('echt'),
      feed('aktion', { variants: [{ id: 1, title: 'A', price: '10.00', compare_at_price: '12.00', available: true }] }),
      feed('auslauf', { tags: ['Auslauf'] }),
      feed('klein', { images: [{ src: 'https://cdn.shopify.com/s/files/1/x/klein-raumbild-1.jpg', width: 1600, height: 1200, variant_ids: [] }] }),
      feed('nurshop'), feed('beworben'),
    ],
    bildrechte: br, stand: new Map([['beworben', { zuletzt_beworben: '2026-10-01T08:00:00Z' }]]), jetzt: new Date('2026-10-16T08:00:00Z'),
  });
  assert.deepEqual(liste.map(k => k.handle), ['echt', 'ki']);
  const serie = reelKandidaten({ feed: [feed('echt', { title: 'Arvento Eiche Natur – Parkett' }), feed('echt2', { title: 'Arvento Eiche Creme – Parkett', images: [{ src: 'https://cdn.shopify.com/s/files/1/x/echt2-raumbild-1.jpg', width: 3000, height: 2000, variant_ids: [] }] })],
    bildrechte: rechte([{ media_id: '1', produkt_handle: 'echt', datei: 'echt-raumbild-1.jpg' }, { media_id: '2', produkt_handle: 'echt2', datei: 'echt2-raumbild-1.jpg' }]) });
  assert.equal(serie.length, 1, 'je Serie ein Vorschlag');
  assert.equal(liste[1].echtesFoto, false);
  assert.equal(liste[0].bilder[0].src, 'https://cdn.shopify.com/s/files/1/x/echt-raumbild-1.jpg');
});

test('Auftragsvorschlag: Paketware mit Paket- und m²-Preis, Rollenware nur je m², Ausschnitt 4:5 im Bild', () => {
  const k = { handle: 'lund', titel: 'Lund Eiche Sand 8mm', typ: 'Laminat', bilder: [{ src: 'x', breite: 5043, hoehe: 3783, varianten: [], bearbeitet: false }], varianten: [{ id: 1, titel: 'Default Title', preis: 58.82, verfuegbar: true }] };
  const a = auftragVorlage(k, k.bilder[0], { lexikon: new Map([['lund', { betrag: 29.5, einheit: 'm2' }]]) });
  assert.equal(a.zeilen.preis, '29,50 €/m²'); assert.equal(a.zeilen.preis_zusatz, '58,82 € pro Paket (1,994 m²)');
  assert.equal(auftragVorlage({ ...k, titel: 'Arvento Eiche Natur geölt – Parkett-Landhausdiele 220 × 20,9 cm' }).zeilen.name, 'Arvento Eiche Natur geölt');
  assert.deepEqual(a.varianten, { 'Default Title': '58,82' }); assert.deepEqual(a.belege, ['29,50 €/m²', '1,994 m²']);
  const [x, y, b, h] = a.ausschnitt;
  assert.ok(x >= 0 && y >= 0 && x + b <= 5043 && h <= 3783); assert.ok(Math.abs(b / h - 0.8) < 0.001);
  assert.equal('ki_abgleich' in a, false);
  const rolle = { ...k, handle: 'arvida', varianten: [{ id: 1, titel: 'Graubraun / 400cm', preis: 44.9, verfuegbar: true }, { id: 2, titel: 'Graubraun / Wunschmaß', preis: 60.9, verfuegbar: true }] };
  const r = auftragVorlage(rolle, { ...k.bilder[0], bearbeitet: true }, { lexikon: new Map([['arvida', { betrag: 44.9, einheit: 'm2' }]]) });
  assert.equal(r.zeilen.preis, '44,90 €/m²'); assert.equal(r.zeilen.preis_zusatz, ''); assert.deepEqual(r.varianten, { 'Graubraun / 400cm': '44,90' });
  assert.equal(r.ki_abgleich, '', 'KI-Bild: Abgleich mit dem Musterfoto ist auszufuellen');
});

test('Auftrag: jeder Betrag belegt, keine Aktionssprache, Felder vollstaendig', () => {
  assert.deepEqual(pruefeAuftrag(AUFTRAG), []);
  assert.match(pruefeAuftrag({ ...AUFTRAG, zeilen: { ...AUFTRAG.zeilen, preis_zusatz: '61,00 € pro Paket' } }).join(), /61,00 € ist weder belegt/);
  assert.match(pruefeAuftrag({ ...AUFTRAG, zeilen: { ...AUFTRAG.zeilen, merkmale: 'jetzt 20 % sparen' } }).join(), /keine Aktionen/);
  assert.match(pruefeAuftrag({ ...AUFTRAG, varianten: {} }).join(), /varianten/);
  assert.match(pruefeAuftrag({ ...AUFTRAG, zoom: [1, 1.3] }).join(), /zoom/);
});

test('Live-Pruefung: Seitentext aus <main>, Preis, Vergleichspreis, Tags und Belege gegen den Shop', async () => {
  assert.equal(hauptText('<header>9,99 €</header><main><style>.a{}</style><p>29,50&nbsp;&euro;/m&sup2;</p>&#8211;<b>x</b></main>'), '29,50 €/m² – x');
  const ok = await liveDaten('lund-eiche-sand', { holen: scheinShop().holen, pauseMs: 0 });
  assert.deepEqual(pruefeLive(AUFTRAG, ok), []);
  const teurer = await liveDaten('lund-eiche-sand', { holen: scheinShop({ preis: 6150 }).holen, pauseMs: 0 });
  assert.match(pruefeLive(AUFTRAG, teurer).join(), /Preis 61,50 € statt 58,82 €/);
  const aktion = await liveDaten('lund-eiche-sand', { holen: scheinShop({ vergleich: 6900, tags: ['angebot'] }).holen, pauseMs: 0 });
  assert.match(pruefeLive(AUFTRAG, aktion).join(), /angebot.*Vergleichspreis/s);
  const ohneBeleg = await liveDaten('lund-eiche-sand', { holen: scheinShop({ seite: '<main>29,50 €/m²</main>' }).holen, pauseMs: 0 });
  assert.match(pruefeLive(AUFTRAG, ohneBeleg).join(), /Klasse 33/);
  await assert.rejects(liveDaten('lund-eiche-sand', { holen: scheinShop({ bot: true }).holen, pauseMs: 0 }), /Bot-Prüfung/);
  assert.deepEqual(pruefeLive(AUFTRAG, { fehlt: true }), ['Produkt ist nicht mehr im Shop']);
});

test('Produkt-Reel: geprueftes Video liegt in der Freigabe, echtes Foto laeuft automatisch mit, Pruefblatt bleibt lokal', async (t) => {
  const db = testDb(t, () => new Date('2026-10-16T08:00:00Z')); const dir = tmpDir(t);
  const bildrechte = rechte([{ media_id: 'gid://shopify/MediaImage/74219948212558', produkt_handle: 'lund-eiche-sand', datei: 'lund-eiche-sand-raumbild-1.jpg' }]);
  const shop = scheinShop();
  const env = { SOCIAL_AUTO_FREIGABE: '1' };
  const { beitrag, inhalt } = await erstelleProduktReel(db, { auftrag: AUFTRAG, text: TEXT }, { holen: shop.holen, werkzeug: scheinWerkzeug(), bildrechte, dir, env, jetzt: new Date('2026-10-16T08:00:00Z'), pauseMs: 0 });
  assert.equal(inhalt.typ, 'produkt_reel'); assert.equal(inhalt.status, 'CONTENT_ERSTELLT');
  assert.equal(inhalt.daten.auftrag.stand, '16.10.2026'); assert.equal(inhalt.daten.bild.mediaId, '74219948212558');
  assert.equal(beitrag.format, 'reel'); assert.equal(beitrag.vorlage, 'reel_zoom');
  assert.deepEqual(beitrag.medien.map(m => m.art), ['video', 'pruefung']);
  for (const m of beitrag.medien) assert.ok(fs.existsSync(path.join(dir, m.pfad)), m.pfad);
  assert.deepEqual(beitrag.hinweise.sperren, []);
  assert.match(beitrag.hinweise.hinweise.join(), /Preise im Video \(Stand 16\.10\.2026\)/);
  assert.equal(Boolean(beitrag.auto_freigabe), true, 'echtes Foto, Preis wird vor dem Posten live geprueft');
  assert.match(beitrag.link, /utm_content=b\d+/);
  assert.ok(shop.aufrufe.some(u => u.startsWith('https://cdn.shopify.com/') && !u.includes('width=')), 'Original in voller Aufloesung');
  await assert.rejects(erstelleProduktReel(db, { auftrag: AUFTRAG, text: TEXT }, { holen: shop.holen, werkzeug: scheinWerkzeug(), bildrechte, dir, env, jetzt: new Date('2026-10-16T09:00:00Z'), pauseMs: 0 }), /schon ein Reel/);
});

test('Produkt-Reel: kein Beitrag bei unscharfem Video, fehlender Werbefreigabe, KI-Bild ohne Musterabgleich', async (t) => {
  const db = testDb(t); const dir = tmpDir(t); const jetzt = new Date('2026-10-16T08:00:00Z');
  const zeile = { media_id: 'gid://shopify/MediaImage/74219948212558', produkt_handle: 'lund-eiche-sand', datei: 'lund-eiche-sand-raumbild-1.jpg' };
  const shop = scheinShop();
  await assert.rejects(erstelleProduktReel(db, { auftrag: AUFTRAG, text: TEXT }, { holen: shop.holen, werkzeug: scheinWerkzeug(false), bildrechte: rechte([zeile]), dir, jetzt, pauseMs: 0 }), /Schärfeprüfung nicht bestanden.*Prüfblatt/);
  await assert.rejects(erstelleProduktReel(db, { auftrag: AUFTRAG, text: TEXT }, { holen: shop.holen, werkzeug: scheinWerkzeug(), bildrechte: rechte([{ ...zeile, lizenz: 'Freigabe Hersteller (Inhaber 2026-10-10)' }]), dir, jetzt, pauseMs: 0 }), /nicht für Werbung/);
  const ki = rechte([{ ...zeile, bearbeitet: 'ja (KI)' }]);
  await assert.rejects(erstelleProduktReel(db, { auftrag: AUFTRAG, text: TEXT }, { holen: shop.holen, werkzeug: scheinWerkzeug(), bildrechte: ki, dir, jetzt, pauseMs: 0 }), /Musterfoto/);
  await assert.rejects(erstelleProduktReel(db, { auftrag: AUFTRAG, text: TEXT }, { holen: scheinShop({ preis: 6150 }).holen, werkzeug: scheinWerkzeug(), bildrechte: rechte([zeile]), dir, jetzt, pauseMs: 0 }), ReelFehler);
  assert.equal(db.inhalte().length, 0, 'nichts angelegt');
  const { beitrag } = await erstelleProduktReel(db, { auftrag: { ...AUFTRAG, ki_abgleich: 'neben Musterfoto 062 gelegt: Schlingenbild und Farbton (Lab) passen' }, text: TEXT },
    { holen: shop.holen, werkzeug: scheinWerkzeug(), bildrechte: ki, dir, jetzt, env: { SOCIAL_AUTO_FREIGABE: '2' }, pauseMs: 0 });
  assert.match(beitrag.hinweise.hinweise.join(), /KI-bearbeitet/);
  assert.equal(Boolean(beitrag.auto_freigabe), false, 'KI-Bild sieht immer ein Mensch');
});

test('Publisher: Produkt-Reel nur mit unveraendertem Shop-Preis und frischem Preisstand', async (t) => {
  const db = testDb(t, () => new Date('2026-10-16T08:00:00Z')); const dir = tmpDir(t);
  const bildrechte = rechte([{ media_id: 'gid://shopify/MediaImage/74219948212558', produkt_handle: 'lund-eiche-sand', datei: 'lund-eiche-sand-raumbild-1.jpg' }]);
  const env = { SOCIAL_AUTO_FREIGABE: '1' };
  const { beitrag } = await erstelleProduktReel(db, { auftrag: AUFTRAG, text: TEXT }, { holen: scheinShop().holen, werkzeug: scheinWerkzeug(), bildrechte, dir, env, jetzt: new Date('2026-10-16T08:00:00Z'), pauseMs: 0 });
  db.beitragAendern(beitrag.id, { geplant_am: '2026-10-17T16:00:00.000Z' });
  assert.deepEqual(freigebenAutomatisch(db, { env, jetzt: new Date('2026-10-16T09:00:00Z') }), [beitrag.id]);

  // Preis im Shop geaendert: zurueck in die Freigabe, und die automatische Freigabe plant es nicht wieder ein.
  const meta = { aufrufe: 0 };
  const client = erstelleClient({ token: 't', pageId: 'P', igUserId: 'IG', holen: async () => { meta.aufrufe += 1; throw new Error('darf nicht posten'); }, pause: async () => {} });
  const r = await veroeffentlicheFaellige(db, { client, jetzt: new Date('2026-10-17T16:05:00Z'), dir, holen: scheinShop({ preis: 6150 }).holen });
  assert.deepEqual(r.zurueck, [beitrag.id]); assert.equal(meta.aufrufe, 0);
  const zurueck = db.beitrag(beitrag.id);
  assert.equal(zurueck.status, 'FREIGABE'); assert.match(zurueck.fehler, /Preis 61,50 € statt 58,82 €/);
  const inhalt = db.inhalt(zurueck.inhalt_id);
  assert.match(pruefe({ beitrag: zurueck, inhalt, medien: db.medien(inhalt.id) }).sperren.join(), /neu bauen/);
  assert.equal(autoFreigabeMoeglich({ beitrag: zurueck, inhalt, medien: db.medien(inhalt.id) }, env), false);

  // Shop kurz nicht erreichbar: Sperre, aber nichts Bleibendes.
  const frisch = { ...inhalt, daten: { ...inhalt.daten, liveFehler: undefined } };
  const weg = await produktReelSperren(frisch, { holen: async () => { throw new Error('ECONNRESET'); }, jetzt: new Date('2026-10-17T16:00:00Z'), pauseMs: 0 });
  assert.match(weg.join(), /^Live-Prüfung nicht möglich/);
  const alt = await produktReelSperren(frisch, { holen: scheinShop().holen, jetzt: new Date('2026-10-28T16:00:00Z'), pauseMs: 0 });
  assert.match(alt.join(), /älter als 10 Tage/);
  assert.deepEqual(await produktReelSperren(frisch, { holen: scheinShop().holen, jetzt: new Date('2026-10-20T16:00:00Z'), pauseMs: 0 }), []);
});
