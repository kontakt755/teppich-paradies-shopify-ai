import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Widerrufsformular (domains/widerruf/apps-script/Code.js) in einer VM mit nachgebauten
// Google-Diensten: Missbrauchsbremse, Sammelhinweis, Tagesgrenze, Kontingent-Reserve
// (Rundgang 2026-10-26, #59). Nur erfundene Daten unter example.invalid; nichts wird gesendet.
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CODE = readFileSync(join(root, 'domains', 'widerruf', 'apps-script', 'Code.js'), 'utf8');

function teile(datum) {
  const f = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  return Object.fromEntries(f.formatToParts(datum).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
}

function umgebung({ kontingent = 1500, start = '2026-10-26T08:05:00Z' } = {}) {
  const uhr = { jetzt: new Date(start) };
  const cache = new Map();
  const props = new Map([['PROTOKOLL_ID', 'test-protokoll']]);
  const zeilen = [];
  const mails = [];
  const quota = { rest: kontingent };
  class Uhr extends Date {
    constructor(...a) { if (a.length) super(...a); else super(uhr.jetzt.getTime()); }
    static now() { return uhr.jetzt.getTime(); }
  }
  const blatt = {
    appendRow: (r) => zeilen.push([...r]),
    getLastRow: () => zeilen.length,
    getRange: (zeile) => ({
      getCell: (_r, c) => ({ setValue: (v) => { zeilen[zeile - 1][c - 1] = v; } }),
      getSheet: () => blatt,
      getRow: () => zeile,
    }),
    getParent: () => ({ getUrl: () => 'https://docs.google.example.invalid/protokoll' }),
    deleteRow: () => {},
    setFrozenRows: () => {},
  };
  const ctx = {
    Date: Uhr,
    console: { log: () => {}, error: () => {} },
    JSON, Math, String, Number, Object,
    CacheService: { getScriptCache: () => ({ get: (k) => (cache.has(k) ? cache.get(k) : null), put: (k, v) => { cache.set(k, String(v)); } }) },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (props.has(k) ? props.get(k) : null), setProperty: (k, v) => { props.set(k, String(v)); } }) },
    SpreadsheetApp: { openById: () => ({ getSheets: () => [blatt], getId: () => 'test-protokoll' }), create: () => { throw new Error('nicht erwartet'); } },
    MailApp: {
      sendEmail: (m) => { if (quota.rest <= 0) throw new Error('Kontingent erschoepft'); quota.rest -= 1; mails.push(m); },
      getRemainingDailyQuota: () => quota.rest,
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ inhalt: s, setMimeType() { return this; } }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (_a, s) => [...crypto.createHash('sha256').update(s).digest()],
      base64EncodeWebSafe: (b) => Buffer.from(b).toString('base64url'),
      formatDate: (d, _tz, fmt) => {
        const t = teile(d);
        return fmt.replace('yyyy', t.year).replace('MM', t.month).replace('dd', t.day).replace('HH', t.hour).replace('mm', t.minute).replace('ss', t.second);
      },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(CODE, ctx);
  let lfd = 0;
  const senden = (extra = {}) => {
    lfd += 1;
    const antwort = ctx.doPost({ parameter: { bestaetigt: 'ja', name: 'Testkunde ' + lfd, bestellnummer: '#T' + lfd, email: `kunde${lfd}@example.invalid`, ...extra } });
    return JSON.parse(antwort.inhalt);
  };
  const an = (adr) => mails.filter(m => m.to === adr);
  return { uhr, mails, zeilen, quota, props, senden, an, KOPIE: 'kontakt@teppich-paradies.net' };
}

test('#59 normale Einsendung: Bestaetigung an den Kunden, Kopie an uns, Zeile im Protokoll', () => {
  const u = umgebung();
  const r = u.senden();
  assert.equal(r.ok, true);
  assert.equal(r.mail, true);
  assert.equal(u.an('kunde1@example.invalid').length, 1);
  assert.equal(u.an(u.KOPIE).length, 1);
  assert.match(u.an(u.KOPIE)[0].subject, /^Widerruf eingegangen: Bestellung #T1/);
  assert.equal(u.zeilen.length, 1);
  assert.equal(u.zeilen[0][8], 'gesendet');
});

test('#59 ueber der Stundengrenze: keine Einzelkopien mehr, genau ein Sammelhinweis je Stunde, alles protokolliert', () => {
  const u = umgebung();
  for (let i = 0; i < 40; i += 1) assert.equal(u.senden().mail, true);
  assert.equal(u.an(u.KOPIE).length, 40);
  for (let i = 0; i < 25; i += 1) {
    const r = u.senden();
    assert.equal(r.ok, true, 'angenommen - der Widerruf zaehlt');
    assert.equal(r.mail, false);
  }
  const kopien = u.an(u.KOPIE);
  assert.equal(kopien.length, 41, '40 Einzelkopien + 1 Sammelhinweis statt 25 weiterer Kopien');
  assert.match(kopien[40].subject, /Stundengrenze erreicht/);
  assert.match(kopien[40].body, /höchstens einmal je Stunde/);
  assert.match(kopien[40].body, /docs\.google\.example\.invalid\/protokoll/);
  assert.equal(u.mails.filter(m => m.to !== u.KOPIE).length, 40, 'keine Kundenmail ueber der Grenze');
  assert.equal(u.zeilen.length, 65, 'jede Einsendung steht im Protokoll');
  assert.match(u.zeilen[64][8], /^NICHT GESENDET: Stundengrenze erreicht/);

  u.uhr.jetzt = new Date('2026-10-26T09:10:00Z');   // neue Stunde: Grenze frei, Einzelmails wieder normal
  assert.equal(u.senden().mail, true);
  assert.equal(u.an(u.KOPIE).length, 42);
});

test('#59 Tagesgrenze: ueber alle Stunden hoechstens 100 Einsendungen mit Einzelmails, danach Sammelhinweis je Stunde', () => {
  const u = umgebung({ start: '2026-10-26T00:30:00Z' });
  let gesendet = 0;
  for (let h = 0; h < 4; h += 1) {
    u.uhr.jetzt = new Date(Date.parse('2026-10-26T00:30:00Z') + h * 3600000);
    for (let i = 0; i < 30; i += 1) if (u.senden().mail) gesendet += 1;
  }
  assert.equal(gesendet, 100);
  assert.equal(u.mails.filter(m => /Tagesgrenze erreicht/.test(m.subject)).length, 1, 'die vierte Stunde: ein Sammelhinweis');
  assert.match(u.mails.find(m => /Tagesgrenze erreicht/.test(m.subject)).body, /Weitere Einsendungen von heute werden nur noch im Protokoll erfasst/);
  assert.match(u.zeilen.at(-1)[8], /Tagesgrenze erreicht/);
  assert.equal(JSON.parse(u.props.get('TAGESZAEHLER')).n, 100, 'ueber der Grenze wird nicht mehr geschrieben');

  u.uhr.jetzt = new Date('2026-10-27T07:00:00Z');   // naechster Tag
  assert.equal(u.senden().mail, true);
});

test('#59 Kontingent-Reserve: bei 200 verbleibenden Mails sendet das Formular nichts mehr, protokolliert aber', () => {
  const u = umgebung({ kontingent: 201 });
  assert.equal(u.senden().mail, true, '201 -> Kundenmail geht noch (danach 200)');
  assert.equal(u.an(u.KOPIE).length, 0, 'die Kopie haette die Reserve angegriffen');
  const r = u.senden();
  assert.equal(r.ok, true);
  assert.equal(r.mail, false);
  assert.equal(u.mails.length, 1);
  assert.equal(u.quota.rest, 200, 'Reserve unangetastet');
  assert.match(u.zeilen.at(-1)[8], /Mail-Kontingent des Kontos fast aufgebraucht/);
});

test('#59 je Adresse hoechstens 3 pro Stunde (abgewiesen), Honigtopf: keine Kundenmail, Kopie innerhalb der Grenzen', () => {
  const u = umgebung();
  for (let i = 0; i < 3; i += 1) assert.equal(u.senden({ email: 'gleich@example.invalid' }).ok, true);
  const vierte = u.senden({ email: 'gleich@example.invalid' });
  assert.equal(vierte.ok, false);
  assert.equal(vierte.fehler, 'zu_viele');
  assert.equal(u.zeilen.length, 3);

  const v = umgebung();
  const r = v.senden({ website: 'http://spam.example.invalid' });
  assert.equal(r.ok, true);
  assert.equal(r.mail, false);
  assert.equal(v.an('kunde1@example.invalid').length, 0);
  assert.equal(v.an(v.KOPIE).length, 1);
  assert.match(v.an(v.KOPIE)[0].subject, /OHNE BESTÄTIGUNG AN KUNDEN/);
});
