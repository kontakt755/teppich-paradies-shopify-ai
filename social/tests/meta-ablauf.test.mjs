import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { holeKennzahlen, importiereReferenzen, planeOffene, shopAbgleich, sichereDatenbank, veroeffentlicheFaellige } from '../lib/ablauf.mjs';
import { oeffne } from '../lib/db.mjs';
import { erkenntnisse, lernstand, punkte, vereinheitliche } from '../lib/auswertung.mjs';
import { erstelleClient, MetaFehler, ordneFehler, seitenZugang, veroeffentliche } from '../lib/meta.mjs';
import { setzeEnvWerte } from '../lib/zugang.mjs';
import { feedProdukt, testDb, tmpDir } from './_hilfe.mjs';

/** Meta-Ersatz: beantwortet Graph-Aufrufe und merkt sie sich. */
function scheinMeta({ igFehler = null } = {}) {
  const aufrufe = []; let n = 0;
  const holen = async (url, init) => {
    const u = new URL(url); const pfad = u.pathname.replace(/^\/v[\d.]+/, '');
    if (u.hostname === 'rupload.facebook.com') {
      aufrufe.push({ methode: init.method, pfad: u.pathname, kopf: init.headers, bytes: init.body.length });
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    }
    const body = init.body instanceof URLSearchParams ? Object.fromEntries(init.body) : (init.body ? Object.fromEntries([...init.body.entries()].filter(([, v]) => typeof v === 'string')) : Object.fromEntries(u.searchParams));
    aufrufe.push({ methode: init.method, pfad, body });
    const ok = daten => ({ ok: true, status: 200, json: async () => daten });
    if (igFehler && pfad === '/IG/media_publish') return { ok: false, status: 400, json: async () => ({ error: igFehler }) };
    if (init.method === 'GET' && u.searchParams.get('fields') === 'images') return ok({ images: [{ source: `https://cdn.fb/${pfad.slice(1)}.jpg`, width: 1080 }, { source: 'https://cdn.fb/klein.jpg', width: 320 }] });
    if (init.method === 'GET' && u.searchParams.get('fields') === 'status_code') return ok({ status_code: 'FINISHED' });
    if (init.method === 'GET' && pfad.endsWith('/insights')) return ok({ data: [{ name: 'reach', values: [{ value: 400 }] }, { name: 'saved', values: [{ value: 5 }] }, { name: 'profile_visits', values: [{ value: 9 }] }] });
    if (init.method === 'GET') return ok({ permalink: `https://instagram.com/p/${pfad.slice(1)}`, permalink_url: `https://facebook.com/${pfad.slice(1)}`, likes: { summary: { total_count: 3 } }, comments: { summary: { total_count: 1 } } });
    n += 1;
    return ok({ id: `id${n}`, post_id: `post${n}` });
  };
  return { holen, aufrufe, posts: () => aufrufe.filter(a => a.methode === 'POST').map(a => a.pfad) };
}

const client = (meta, extra = {}) => erstelleClient({ token: 't', pageId: 'PAGE', igUserId: 'IG', holen: meta.holen, pause: async () => {}, ...extra });

function beitragMitDatei(t, db, dir, { bilder = 1, format = 'feed', geplant = '2026-10-01T07:00:00.000Z', plattformen = ['instagram', 'facebook'] } = {}) {
  const { id } = db.inhaltAnlegen({ quelle: 'shopify', typ: 'raumidee', titel: 'Amara', produkt_handle: 'amara', einwilligung: true, daten: { produkte: ['amara', 'amara-2'] } });
  db.inhaltAendern(id, { status: 'IN_PRUEFUNG' }); db.inhaltAendern(id, { status: 'CONTENT_ERSTELLT' });
  const medien = [];
  for (let i = 1; i <= bilder; i += 1) {
    const rel = path.join('medien', String(id), 'beitrag-1', `0${i}.jpg`);
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), 'jpg');
    medien.push({ pfad: rel, art: 'bild', quellen: [] });
  }
  const b = db.beitragAnlegen({ inhalt_id: id, format, plattformen, text: 'Ein ruhiger Boden in Eiche für das Wohnzimmer. Im Shop ansehen.', hashtags: '#a #b #c #d', link: 'https://www.teppich-paradies.net/products/amara?utm_source=facebook', medien, geplant_am: geplant });
  db.beitragAendern(b, { status: 'GEPLANT' });
  return b;
}

test('Meta-Fehler werden eingeordnet: voruebergehend, Zugang, endgueltig', () => {
  assert.equal(ordneFehler(400, { error: { code: 4, message: 'limit' } }).voruebergehend, true);
  assert.equal(ordneFehler(503, {}).voruebergehend, true);
  assert.equal(ordneFehler(400, { error: { code: 190, message: 'token' } }).zugang, true);
  assert.equal(ordneFehler(400, { error: { code: 100, message: 'param' } }).voruebergehend, false);
});

test('Karussell: Fotos unveroeffentlicht ablegen, Instagram bekommt deren Adressen, Facebook die IDs', async (t) => {
  const dir = tmpDir(t); const datei = path.join(dir, 'a.jpg'); fs.writeFileSync(datei, 'x');
  const meta = scheinMeta();
  const r = await veroeffentliche(client(meta), { beitrag: { format: 'karussell', plattformen: ['instagram', 'facebook'] }, dateien: [{ datei, art: 'bild' }, { datei, art: 'bild' }], texte: { instagram: 'IG', facebook: 'FB' } });
  assert.equal(r.fertig, true);
  assert.deepEqual(meta.posts(), ['/PAGE/photos', '/PAGE/photos', '/IG/media', '/IG/media', '/IG/media', '/IG/media_publish', '/PAGE/feed']);
  const kind = meta.aufrufe.find(a => a.pfad === '/IG/media' && a.body.is_carousel_item);
  assert.equal(kind.body.image_url, 'https://cdn.fb/id1.jpg', 'groesste Fassung des abgelegten Fotos');
  assert.equal(meta.aufrufe.find(a => a.pfad === '/PAGE/photos').body.published, 'false');
  const eltern = meta.aufrufe.find(a => a.body.media_type === 'CAROUSEL');
  assert.equal(eltern.body.caption, 'IG'); assert.equal(eltern.body.children, 'id3,id4');
  const feed = meta.aufrufe.find(a => a.pfad === '/PAGE/feed');
  assert.equal(feed.body.message, 'FB'); assert.equal(feed.body['attached_media[1]'], '{"media_fbid":"id2"}');
  assert.match(r.ergebnis.instagram.permalink, /instagram/);
});

test('Wiederholung postet nicht doppelt: was draussen ist, bleibt draussen', async (t) => {
  const dir = tmpDir(t); const datei = path.join(dir, 'a.jpg'); fs.writeFileSync(datei, 'x');
  const kaputt = scheinMeta({ igFehler: { code: 2, message: 'temporarily unavailable', is_transient: true } });
  const auftrag = { beitrag: { format: 'feed', plattformen: ['facebook', 'instagram'] }, dateien: [{ datei, art: 'bild' }], texte: { instagram: 'IG', facebook: 'FB' } };
  const erster = await veroeffentliche(client(kaputt), auftrag);
  assert.equal(erster.fertig, false); assert.ok(erster.ergebnis.facebook.id); assert.equal(erster.fehler.instagram.voruebergehend, true);
  const heil = scheinMeta();
  const zweiter = await veroeffentliche(client(heil), { ...auftrag, bisher: erster.ergebnis });
  assert.equal(zweiter.fertig, true);
  assert.equal(heil.posts().includes('/PAGE/feed'), false, 'Facebook wird nicht noch einmal gepostet');
  assert.equal(zweiter.ergebnis.facebook.id, erster.ergebnis.facebook.id);
});

test('Trockenlauf und fehlender Zugang rufen Meta nie auf', async () => {
  const meta = scheinMeta();
  const c = client(meta, { trocken: true });
  await c.fotoAblegen('/nicht/da.jpg');
  assert.equal(meta.aufrufe.length, 0);
  await assert.rejects(erstelleClient({ token: null, pageId: 'P', holen: meta.holen }).graph('GET', '/me'), MetaFehler);
  await assert.rejects(client(meta).instagram({ format: 'reel', text: 'x', fotos: [] }), /ohne Videodatei/);
});

test('Reel: Video geht direkt an Instagram (resumable) und an die Seite, die Einzelbilder bleiben lokal', async (t) => {
  const dir = tmpDir(t); const video = path.join(dir, 'reel.mp4'); fs.writeFileSync(video, Buffer.alloc(2048));
  const rahmen = path.join(dir, 'rahmen-01.jpg'); fs.writeFileSync(rahmen, 'x');
  const meta = scheinMeta();
  const r = await veroeffentliche(client(meta), { beitrag: { format: 'reel', plattformen: ['instagram', 'facebook'] }, dateien: [{ datei: video, art: 'video' }, { datei: rahmen, art: 'rahmen' }], texte: { instagram: 'IG', facebook: 'FB' } });
  assert.equal(r.fertig, true, JSON.stringify(r.fehler));
  assert.deepEqual(meta.posts(), ['/IG/media', '/ig-api-upload/v24.0/id1', '/IG/media_publish', '/PAGE/videos']);
  const container = meta.aufrufe.find(a => a.pfad === '/IG/media');
  assert.equal(container.body.media_type, 'REELS'); assert.equal(container.body.upload_type, 'resumable'); assert.equal(container.body.caption, 'IG');
  const upload = meta.aufrufe.find(a => a.pfad.startsWith('/ig-api-upload/'));
  assert.equal(upload.kopf.Authorization, 'OAuth t'); assert.equal(upload.kopf.offset, '0'); assert.equal(upload.kopf.file_size, '2048'); assert.equal(upload.bytes, 2048);
  assert.equal(meta.aufrufe.find(a => a.pfad === '/PAGE/videos').body.description, 'FB');
});

test('Publisher ohne Zugang: nichts veroeffentlicht, nichts veraendert', async (t) => {
  const db = testDb(t); const dir = tmpDir(t);
  const b = beitragMitDatei(t, db, dir);
  const r = await veroeffentlicheFaellige(db, { env: {}, jetzt: new Date('2026-10-01T08:00:00Z'), dir });
  assert.deepEqual(r.uebersprungen, [b]); assert.match(r.hinweis, /Kein Meta-Zugang/);
  assert.equal(db.beitrag(b).status, 'GEPLANT');
});

test('Publisher: veroeffentlicht Faelliges, merkt die Bewerbung je Produkt, hoechstens ein Feed-Beitrag je Lauf', async (t) => {
  const db = testDb(t); const dir = tmpDir(t);
  const a = beitragMitDatei(t, db, dir); const zweiter = beitragMitDatei(t, db, dir, { geplant: '2026-10-01T07:30:00.000Z' });
  const spaeter = beitragMitDatei(t, db, dir, { geplant: '2026-10-03T07:00:00.000Z' });
  const meta = scheinMeta();
  const r = await veroeffentlicheFaellige(db, { client: client(meta), jetzt: new Date('2026-10-01T08:00:00Z'), dir });
  assert.equal(r.veroeffentlicht.length, 1); assert.deepEqual(r.uebersprungen, [zweiter]);
  const fertig = db.beitrag(a);
  assert.equal(fertig.status, 'VEROEFFENTLICHT'); assert.ok(fertig.ergebnis.instagram.id && fertig.ergebnis.facebook.id);
  assert.equal(db.beitrag(spaeter).status, 'GEPLANT');
  assert.equal(db.produktStand().get('amara-2').zuletzt_beworben, '2026-10-01T08:00:00.000Z');
  const feed = meta.aufrufe.find(x => x.pfad === '/PAGE/feed');
  assert.match(feed.body.message, /utm_source=facebook\n\n#a #b #c$/, 'Facebook: Link und hoechstens drei Hashtags');
  assert.match(meta.aufrufe.find(x => x.pfad === '/IG/media').body.caption, /#a #b #c #d$/);
});

test('Publisher: verpasster Termin geht zurueck in die Freigabe, fehlende Datei und Zugangsfehler enden als Fehler', async (t) => {
  const db = testDb(t); const dir = tmpDir(t);
  const alt = beitragMitDatei(t, db, dir, { geplant: '2026-09-28T07:00:00.000Z' });
  const r1 = await veroeffentlicheFaellige(db, { client: client(scheinMeta()), jetzt: new Date('2026-10-01T08:00:00Z'), dir });
  assert.deepEqual(r1.zurueck, [alt]); assert.equal(db.beitrag(alt).status, 'FREIGABE'); assert.match(db.beitrag(alt).fehler, /Termin verpasst/);

  const ohneDatei = beitragMitDatei(t, db, dir);
  fs.rmSync(path.join(dir, db.beitrag(ohneDatei).medien[0].pfad));
  await veroeffentlicheFaellige(db, { client: client(scheinMeta()), jetzt: new Date('2026-10-01T08:00:00Z'), dir });
  assert.equal(db.beitrag(ohneDatei).status, 'FEHLER');

  const b = beitragMitDatei(t, db, dir, { plattformen: ['instagram'] });
  const r3 = await veroeffentlicheFaellige(db, { client: client(scheinMeta({ igFehler: { code: 190, message: 'Token abgelaufen' } })), jetzt: new Date('2026-10-01T08:00:00Z'), dir });
  assert.equal(db.beitrag(b).status, 'FEHLER'); assert.match(r3.hinweis, /Token prüfen/);
});

test('Publisher: voruebergehende Fehler werden bis zu dreimal wiederholt', async (t) => {
  const db = testDb(t); const dir = tmpDir(t);
  const b = beitragMitDatei(t, db, dir, { plattformen: ['instagram'] });
  const lauf = () => veroeffentlicheFaellige(db, { client: client(scheinMeta({ igFehler: { code: 2, message: 'kurz weg', is_transient: true } })), jetzt: new Date('2026-10-01T08:00:00Z'), dir });
  await lauf(); assert.equal(db.beitrag(b).status, 'GEPLANT'); assert.equal(db.beitrag(b).versuche, 1);
  await lauf(); await lauf();
  assert.equal(db.beitrag(b).status, 'FEHLER'); assert.equal(db.beitrag(b).versuche, 3);
});

test('Shop-Abgleich: legt Anlaesse an, zweiter Lauf erzeugt keine Dubletten, leerer Feed aendert nichts', async (t) => {
  const db = testDb(t);
  const roh = [feedProdukt(), feedProdukt({ title: 'Sentira Teppichboden 400cm', handle: 'sentira', product_type: 'Teppichboden', tags: ['stark-reduziert'], variants: [{ id: 2, price: '53.90', compare_at_price: '72.90', available: true }] })];
  const opt = { roh, jetzt: new Date('2026-10-01T08:00:00Z'), preise: new Map([['sentira', { betrag: 13.48, einheit: 'm2' }]]), nachfrage: new Map() };
  const r = await shopAbgleich(db, opt);
  assert.equal(r.produkte, 2); assert.equal(r.neu.length, 2);
  const angebot = db.inhalte({ quelle: 'shopify' }).find(i => i.typ === 'angebot');
  assert.equal(angebot.produkt_handle, 'sentira'); assert.deepEqual(angebot.daten.preisJeEinheit, { betrag: 13.48, einheit: 'm2' });
  assert.equal(db.medien(angebot.id)[0].datenschutz, 'ok');
  assert.equal((await shopAbgleich(db, opt)).neu.length, 0);
  assert.equal(db.produktStand().size, 2);
  await assert.rejects(shopAbgleich(db, { ...opt, roh: [] }), /leer/);
});

test('Referenzen werden uebernommen, zu kleine Bilder aussortiert, Entwuerfe bekommen Termine', (t) => {
  const db = testDb(t, () => new Date('2026-09-30T12:00:00Z'));
  const bild = (w, h) => ({ image: { url: `https://cdn.shopify.com/${w}.jpg`, width: w, height: h, altText: 'alt' } });
  const knoten = [{ handle: 'treppe', displayName: 'Treppe', fields: [{ key: 'titel', value: 'Treppe' }, { key: 'belag', value: 'Teppichboden Velours' }, { key: 'kategorie', value: 'Treppen' }, { key: 'titelbild', reference: bild(1800, 4000) }, { key: 'bilder', references: { nodes: [bild(600, 800)] } }] }];
  assert.equal(importiereReferenzen(db, knoten).length, 1);
  assert.equal(importiereReferenzen(db, knoten).length, 0);
  const i = db.inhalte({ quelle: 'referenz' })[0];
  assert.equal(i.status, 'IN_PRUEFUNG'); assert.equal(i.daten.kategorie, 'Treppen'); assert.equal(i.raum, null);
  assert.deepEqual(db.medien(i.id).map(m => m.pruefung), ['ok', 'aussortiert']);
  const b = db.beitragAnlegen({ inhalt_id: i.id, format: 'feed', plattformen: ['instagram'], text: 'x', medien: [] });
  const plan = planeOffene(db, { jetzt: new Date(2026, 8, 30, 14, 0), dir: tmpDir(t) });
  assert.equal(plan[0].id, b); assert.equal(new Date(db.beitrag(b).geplant_am).getDay(), 4);
});

test('Auswertung: Klicks und Profilbesuche wiegen schwer, Likes kaum; wenige Beitraege bleiben neutral', async (t) => {
  assert.ok(punkte({ link_klicks: 5 }) > punkte({ likes: 90 }));
  assert.deepEqual(vereinheitliche({ reach: 400, saved: 5, profile_visits: 9, replies: 2 }), { reichweite: 400, aufrufe: null, likes: null, kommentare: 2, geteilt: null, gespeichert: 5, profilbesuche: 9, link_klicks: null });
  const zeilen = [...Array(4).fill({ typ: 'kundenprojekt', punkte: 90 }), ...Array(4).fill({ typ: 'produkt_woche', punkte: 30 }), { typ: 'tipp', punkte: 500 }];
  const stand = lernstand(zeilen);
  assert.equal(stand.typ.tipp.faktor, 1, 'ein einzelner Ausreisser zaehlt nicht');
  assert.ok(stand.typ.kundenprojekt.faktor > 0.8 && stand.typ.produkt_woche.faktor < 0.4);
  assert.match(erkenntnisse(stand).join(' '), /vorläufig/);
  assert.match(erkenntnisse(lernstand([])).join(), /Noch keine/);

  const db = testDb(t); const dir = tmpDir(t);
  const b = beitragMitDatei(t, db, dir);
  const meta = scheinMeta();
  await veroeffentlicheFaellige(db, { client: client(meta), jetzt: new Date('2026-10-01T08:00:00Z'), dir });
  const r = await holeKennzahlen(db, { client: client(meta), jetzt: new Date('2026-10-02T08:00:00Z'), dir });
  assert.equal(r.gemessen, 2);
  const ig = db.letzteKennzahlen().find(k => k.plattform === 'instagram');
  assert.equal(ig.profilbesuche, 9); assert.equal(ig.punkte, punkte({ reichweite: 400, gespeichert: 5, profilbesuche: 9 }));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'lernstand.json'), 'utf8')).beitraege, 1);
  await holeKennzahlen(db, { client: client(meta), jetzt: new Date('2026-11-15T08:00:00Z'), dir });
  assert.equal(db.beitrag(b).status, 'ARCHIV');
});

test('Sicherung: der Abzug ist eine vollstaendige, eigenstaendige Datenbank', (t) => {
  const dir = tmpDir(t);
  const db = oeffne(path.join(dir, 'social.db')); t.after(() => db.schliessen());
  db.inhaltAnlegen({ quelle: 'shopify', typ: 'raumidee', titel: 'Amara' });
  const ziel = sichereDatenbank(db, { dir });
  sichereDatenbank(db, { dir });   // zweiter Lauf ueberschreibt, statt zu scheitern
  const kopie = oeffne(ziel); t.after(() => kopie.schliessen());
  assert.equal(kopie.inhalte()[0].titel, 'Amara');
});

test('Meta einrichten: Seiten-Token und IDs aus dem Systemnutzer-Token, Tokens nie in Meldungen', async () => {
  const antwort = (daten, ok = true, status = 200) => async (url) => { antwort.url = url; return { ok, status, json: async () => daten }; };
  const seite = { id: 'P1', name: 'Teppich Paradies Oranienburg', access_token: 'SEITEN-GEHEIM', instagram_business_account: { id: 'IG1', username: 'teppich.paradies' } };
  const z = await seitenZugang({ systemToken: 'SYS', holen: antwort({ data: [seite] }) });
  assert.deepEqual(z, { pageId: 'P1', name: 'Teppich Paradies Oranienburg', pageToken: 'SEITEN-GEHEIM', igUserId: 'IG1', igName: 'teppich.paradies' });
  assert.match(antwort.url, /\/me\/accounts\?/);

  const zwei = antwort({ data: [seite, { ...seite, id: 'P2', name: 'Alte Seite', access_token: 'X-GEHEIM' }] });
  await assert.rejects(seitenZugang({ systemToken: 'SYS', holen: zwei }), (e) => /Mehrere Seiten/.test(e.message) && !/GEHEIM/.test(e.message));
  assert.equal((await seitenZugang({ systemToken: 'SYS', seite: 'P2', holen: zwei })).pageToken, 'X-GEHEIM');
  await assert.rejects(seitenZugang({ systemToken: 'SYS', holen: antwort({ data: [] }) }), /keine Facebook-Seite/);
  await assert.rejects(seitenZugang({ systemToken: 'SYS', holen: antwort({ error: { code: 190, message: 'Invalid OAuth access token' } }, false, 400) }), (e) => e.zugang === true);
  await assert.rejects(seitenZugang({ systemToken: null }), /META_SYSTEM_TOKEN fehlt/);
  const ohneIg = await seitenZugang({ systemToken: 'SYS', holen: antwort({ data: [{ ...seite, instagram_business_account: undefined }] }) });
  assert.equal(ohneIg.igUserId, null);
});

test('Einstellungsdatei: Werte ersetzen oder anhaengen, Kommentare bleiben, nur fuer den Besitzer lesbar', (t) => {
  const dir = tmpDir(t); const datei = path.join(dir, 'zugang.env');
  fs.writeFileSync(datei, '# Kopf\nMETA_SYSTEM_TOKEN=abc\n#PAUSE META_PAGE_ID=alt\nMETA_PAGE_ID=alt\n', { mode: 0o644 });
  setzeEnvWerte(datei, { META_PAGE_ID: '123', META_PAGE_TOKEN: 'tok' });
  assert.equal(fs.readFileSync(datei, 'utf8'), '# Kopf\nMETA_SYSTEM_TOKEN=abc\n#PAUSE META_PAGE_ID=alt\nMETA_PAGE_ID=123\nMETA_PAGE_TOKEN=tok\n');
  assert.equal(fs.statSync(datei).mode & 0o777, 0o600);
  assert.throws(() => setzeEnvWerte(datei, { META_PAGE_ID: 'a\nBOESE=1' }), /Ungueltig/);
});
