import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alsCsv, ausCsv, auswerten, bildtypAusName, dateiname, nameNachSchema, quelleVermutet, zeilenAusProdukten, zusammenfuehren,
} from '../lib/bildrechte.mjs';

const produkt = (handle, media) => ({ handle, title: handle, productType: 'Teppichboden', media: { nodes: media } });
const bild = (id, url, width = 2000, alt = 'Alt') => ({ id, alt, image: { url, width, height: 1500 } });

test('Dateiname ohne Pfad, Query und Shopify-UUID', () => {
  assert.equal(dateiname('https://cdn.shopify.com/s/files/1/x/files/kaskade-sand-071-raumansicht_36408d2f-f12a-4ee4-a16d-873812345678.jpg?v=1'), 'kaskade-sand-071-raumansicht.jpg');
  assert.equal(dateiname('https://cdn/x/serena_taupe_raum_01.jpg?v=2'), 'serena_taupe_raum_01.jpg');
});

test('Bildtyp nur aus Schema oder belegtem Altmuster, sonst leer', () => {
  assert.equal(bildtypAusName('serena_taupe_detail_02.jpg'), 'detail');
  assert.equal(bildtypAusName('velory_grau_rest_sp-0007_01.jpg'), 'rest');
  assert.equal(bildtypAusName('larissa-teppichboden-taupe-260-raumansicht.jpg'), 'raum');
  assert.equal(bildtypAusName('products_442562.jpg'), '');
});

test('Herkunft nur als Vermutung aus dem Namen - nie ein Rechte-Status', () => {
  assert.match(quelleVermutet('products_442562.jpg'), /Export Lieferant/);
  assert.equal(quelleVermutet('irgendwas.jpg'), '');
  const [z] = zeilenAusProdukten([produkt('a', [bild('m1', 'https://x/products_1.jpg')])]);
  assert.equal(z.status, 'ungeklaert');
  assert.equal(z.lizenz, '');
});

test('Namensschema', () => {
  assert.ok(nameNachSchema('serena_taupe_raum_01.jpg'));
  assert.ok(nameNachSchema('velory_grau_rest_sp-0007_01.jpg'));
  assert.ok(!nameNachSchema('Serena Taupe.jpg'));
  assert.ok(!nameNachSchema('products_442562.jpg'));
});

test('Videos und Medien ohne Bild werden uebersprungen, Position zaehlt nur Bilder', () => {
  const z = zeilenAusProdukten([produkt('a', [{ id: 'v1' }, bild('m1', 'https://x/a_b_raum_01.jpg'), bild('m2', 'https://x/a_b_detail_02.jpg')])]);
  assert.deepEqual(z.map((x) => [x.media_id, x.position]), [['m1', '1'], ['m2', '2']]);
});

test('Zusammenfuehren behaelt Handspalten, neue Bilder ungeklaert, Verschwundene mit Notiz', () => {
  const alt = [
    { media_id: 'm1', status: 'geprueft', lizenz: 'Haendlernutzung', quelle: 'Lieferant A', bildtyp: 'raum', notiz: '' },
    { media_id: 'weg', status: 'geprueft', lizenz: 'eigenes Foto', notiz: '' },
  ];
  const neu = zeilenAusProdukten([produkt('a', [bild('m1', 'https://x/products_1.jpg'), bild('m2', 'https://x/b.jpg')])]);
  const z = zusammenfuehren(alt, neu);
  const m1 = z.find((x) => x.media_id === 'm1');
  assert.equal(m1.status, 'geprueft');
  assert.equal(m1.lizenz, 'Haendlernutzung');
  assert.equal(m1.bildtyp, 'raum', 'von Hand gesetzter Bildtyp bleibt, wenn der Name keinen hergibt');
  assert.equal(z.find((x) => x.media_id === 'm2').status, 'ungeklaert');
  const weg = z.find((x) => x.media_id === 'weg');
  assert.match(weg.notiz, /nicht mehr in Shopify/);
  assert.equal(weg.lizenz, 'eigenes Foto');
  const zweimal = zusammenfuehren(z, neu).find((x) => x.media_id === 'weg');
  assert.equal(zweimal.notiz.match(/nicht mehr in Shopify/g).length, 1);
});

test('gepflegte Statuswerte ueberleben den naechsten Abruf', () => {
  const neu = ['f', 'n', 'e', 'd'].map((media_id) => ({ media_id, status: 'ungeklaert' }));
  const alt = [
    { media_id: 'f', status: 'freigegeben' }, { media_id: 'n', status: 'nein' },
    { media_id: 'e', status: 'entfernt' }, { media_id: 'd', status: 'entfernt (Dublette)' },
  ];
  assert.deepEqual(zusammenfuehren(alt, neu).map((z) => z.status), ['freigegeben', 'nein', 'entfernt', 'entfernt (Dublette)']);
});

test('auswerten: freigegeben ist entschieden, entfernt zaehlt nicht mit', () => {
  const a = auswerten([
    { media_id: '1', status: 'freigegeben', alt: 'x', breite: '2000' },
    { media_id: '2', status: 'ungeklaert', alt: 'x', breite: '2000' },
    { media_id: '3', status: 'entfernt', alt: '', breite: '100' },
    { media_id: '4', status: 'nein', alt: 'x', breite: '2000' },
  ]);
  assert.deepEqual({ b: a.bilder, u: a.ungeklaert, g: a.gesperrt, k: a.zuKlein, o: a.ohneAlt, e: a.entfernt }, { b: 3, u: 1, g: 1, k: 0, o: 0, e: 1 });
});

test('ungueltiger Status wird ungeklaert', () => {
  const neu = zeilenAusProdukten([produkt('a', [bild('m1', 'https://x/a.jpg')])]);
  assert.equal(zusammenfuehren([{ media_id: 'm1', status: 'ok' }], neu)[0].status, 'ungeklaert');
});

test('Auswertung zaehlt nur Abweichungen', () => {
  const z = zeilenAusProdukten([produkt('a', [bild('m1', 'https://x/a_b_raum_01.jpg', 800, ''), bild('m2', 'https://x/products_2.jpg')])]);
  z[0].status = 'geprueft';
  const a = auswerten(z);
  assert.deepEqual({ bilder: a.bilder, ungeklaert: a.ungeklaert, zuKlein: a.zuKlein, ohneAlt: a.ohneAlt, schema: a.nameNichtNachSchema }, { bilder: 2, ungeklaert: 1, zuKlein: 1, ohneAlt: 1, schema: 1 });
});

test('CSV hin und zurueck, auch mit Semikolon, Anfuehrungszeichen und Zeilenumbruch', () => {
  const z = zeilenAusProdukten([produkt('a;b', [bild('m1', 'https://x/a.jpg', 2000, 'Serena "Taupe"\nRaum')])]);
  const zurueck = ausCsv('﻿' + alsCsv(z));
  assert.equal(zurueck.length, 1);
  assert.equal(zurueck[0].produkt_handle, 'a;b');
  assert.equal(zurueck[0].alt, 'Serena "Taupe"\nRaum');
  assert.equal(zurueck[0].status, 'ungeklaert');
});

// --- Pruefliste fuer das Control Center ---
import { prueflisten, istEntfernt } from '../lib/bildrechte.mjs';

const z = (felder) => ({ produkt_handle: 'a', produkt_titel: 'A', produkttyp: 'Teppichboden', position: '1', datei: 'a.jpg', breite: '2000', hoehe: '2000', alt: 'Alt', status: 'geprueft', notiz: '', quelle_vermutet: '', ...felder });

test('Pruefliste: entfernte Bilder zaehlen nirgends mit', () => {
  assert.equal(istEntfernt(z({ status: 'entfernt' })), true);
  assert.equal(istEntfernt(z({ status: 'entfernt (Dublette)' })), true);
  assert.equal(istEntfernt(z({ notiz: 'nicht mehr in Shopify' })), true);
  const r = prueflisten([z({ status: 'entfernt', breite: '500', alt: '' }), z({ status: 'ungeklaert' })]);
  assert.deepEqual(r.zaehler, { ungeklaert: 1, 'zu-klein': 0, 'ohne-alt': 0 });
});

test('Pruefliste: ungeklaert ist nur, was so markiert ist oder keinen Status hat', () => {
  const r = prueflisten([z({ status: 'ungeklaert' }), z({ status: '' }), z({ status: 'freigegeben' }), z({ status: 'geprueft' }), z({ status: 'gesperrt' })]);
  assert.equal(r.zaehler.ungeklaert, 2, 'freigegeben/geprueft/gesperrt sind dokumentierte Entscheidungen');
});

test('Pruefliste: zu klein nur mit erfasster Breite, Luecke wird gezaehlt', () => {
  const r = prueflisten([z({ breite: '1199' }), z({ breite: '1200' }), z({ breite: '' })], { liste: 'zu-klein' });
  assert.equal(r.zaehler['zu-klein'], 1);
  assert.equal(r.breiteUnbekannt, 1);
  assert.equal(r.items[0].breite, 1199);
});

test('Pruefliste: Warengruppen der gewaehlten Liste, Filter, Sortierung und Seiten', () => {
  const zeilen = [
    ...Array.from({ length: 30 }, (_, i) => z({ produkt_titel: `T${String(i).padStart(2, '0')}`, alt: '' })),
    z({ produkttyp: 'Sockelleisten', alt: '' }),
    z({ produkttyp: '', alt: '' }),
  ];
  const r = prueflisten(zeilen, { liste: 'ohne-alt' });
  assert.deepEqual(r.gruppen, [{ gruppe: 'Teppichboden', anzahl: 30 }, { gruppe: 'ohne Warengruppe', anzahl: 1 }, { gruppe: 'Sockelleisten', anzahl: 1 }]);
  assert.equal(r.count, 32);
  assert.equal(r.pages, 2);
  assert.equal(r.items.length, 25);
  const s2 = prueflisten(zeilen, { liste: 'ohne-alt', gruppe: 'Teppichboden', page: 9 });
  assert.equal(s2.page, 2, 'zu grosse Seite landet auf der letzten');
  assert.deepEqual(s2.items.map((e) => e.titel), ['T25', 'T26', 'T27', 'T28', 'T29']);
  assert.equal(prueflisten(zeilen, { liste: 'ohne-alt', gruppe: 'gibt-es-nicht' }).gruppe, '', 'unbekannte Gruppe = alle');
  assert.equal(prueflisten(zeilen, { liste: 'quatsch' }).liste, 'ungeklaert');
});

test('Pruefliste: Eintraege tragen keine Lizenz- oder Quellenangaben', () => {
  const [e] = prueflisten([z({ status: 'ungeklaert', quelle: 'Lieferant A', lizenz: 'x', beleg: 'y' })]).items;
  assert.deepEqual(Object.keys(e).sort(), ['breite', 'datei', 'gruppe', 'handle', 'hinweis', 'hoehe', 'position', 'titel']);
});
