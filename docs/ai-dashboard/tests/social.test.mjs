import './_testumgebung.mjs'; // setzt TP_PRIVAT_DIR auf ein leeres Testverzeichnis - muss vor allem anderen laufen
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { kampagnenLink, kampagnenName, zielAdresse } from '../lib/kampagnenlink.mjs';

// ---------------------------------------------------------------------------
// Kampagnen-Links (reines Frontend)
// ---------------------------------------------------------------------------

test('Kampagnenname wird klein, ohne Umlaute und mit Bindestrichen', () => {
  assert.equal(kampagnenName('  Frühjahr Aktion 2027! '), 'fruehjahr-aktion-2027');
  assert.equal(kampagnenName('Größe & Maß'), 'groesse-mass');
  assert.equal(kampagnenName('---'), '');
});

test('Kampagnen-Link setzt Quelle, Medium, Kampagne und Inhalt', () => {
  const r = kampagnenLink({ ziel: '/pages/muster', kanal: 'instagram', art: 'story', kampagne: 'Herbst 2026' });
  const u = new URL(r.link);
  assert.equal(u.origin + u.pathname, 'https://www.teppich-paradies.net/pages/muster');
  assert.equal(u.searchParams.get('utm_source'), 'instagram');
  assert.equal(u.searchParams.get('utm_medium'), 'social');
  assert.equal(u.searchParams.get('utm_campaign'), 'herbst-2026');
  assert.equal(u.searchParams.get('utm_content'), 'story');

  assert.equal(new URL(kampagnenLink({ kanal: 'newsletter', kampagne: 'x' }).link).searchParams.get('utm_medium'), 'email');
  assert.equal(new URL(kampagnenLink({ kanal: 'aufsteller', kampagne: 'x' }).link).searchParams.get('utm_medium'), 'print');
  assert.equal(new URL(kampagnenLink({ kanal: 'facebook', art: 'anzeige', kampagne: 'x' }).link).searchParams.get('utm_medium'), 'paid');
});

test('Kampagnen-Link: nur eigene Domain, vorhandene UTM werden ersetzt, Kampagne ist Pflicht', () => {
  assert.ok(kampagnenLink({ ziel: 'https://example.com/', kampagne: 'x' }).fehler);
  assert.ok(kampagnenLink({ ziel: 'https://teppich-paradies.net.example.com/', kampagne: 'x' }).fehler);
  assert.ok(kampagnenLink({ ziel: '/', kampagne: '' }).fehler);
  const r = kampagnenLink({ ziel: 'teppich-paradies.net/products/abc?variant=1&utm_source=alt#oben', kampagne: 'neu' });
  const u = new URL(r.link);
  assert.equal(u.host, 'www.teppich-paradies.net');
  assert.equal(u.searchParams.get('variant'), '1');
  assert.deepEqual(u.searchParams.getAll('utm_source'), ['instagram']);
  assert.equal(u.hash, '');
  assert.equal(zielAdresse('http://www.teppich-paradies.net/').url.protocol, 'https:');
});

// ---------------------------------------------------------------------------
// Upload-Link: Geheimnis nur vom Server, nie fuer Rolle "lesen"
// ---------------------------------------------------------------------------

async function withServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try { return await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(r => server.close(r)); }
}

test('Upload-Links: lesen 403, Mitarbeiter sieht und kopiert, nur Inhaber legt an', async () => {
  const { schreibeBenutzer, benutzerAnlegen } = await import('../../../operations/lib/benutzer.mjs');
  const privat = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-dashboard-social-'));
  process.env.TP_PRIVAT_DIR = privat;
  process.env.TP_DASHBOARD_PASSWORT = 'notzugang-testpasswort';
  process.env.TP_DASHBOARD_HOST = '192.168.2.224';
  process.env.SOCIAL_UPLOAD_BASIS_URL = 'https://upload.beispiel.test:8443';
  let liste = benutzerAnlegen([], { name: 'Lena Lesend', kuerzel: 'lena', passwort: 'platzhalter-lesen-1', rolle: 'lesen' });
  liste = benutzerAnlegen(liste, { name: 'Mona Mitarbeiter', kuerzel: 'mona', passwort: 'platzhalter-mitarbeiter-1', rolle: 'mitarbeiter' });
  schreibeBenutzer(liste, path.join(privat, 'benutzer.json'));

  const mod = await import('../../../scripts/serve-dashboard.mjs?case=social-links');
  delete process.env.TP_DASHBOARD_PASSWORT;
  delete process.env.TP_DASHBOARD_HOST;

  try {
    await withServer(mod.requestHandler, async base => {
      const anmelden = async (name, passwort) => {
        const r = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, passwort }) });
        assert.equal(r.status, 200);
        return r.headers.get('set-cookie').split(';')[0];
      };
      const keksLesen = await anmelden('lena', 'platzhalter-lesen-1');
      const keksMona = await anmelden('mona', 'platzhalter-mitarbeiter-1');
      const keksChef = await anmelden('irgendwer', 'notzugang-testpasswort');
      const holen = keks => fetch(`${base}/api/social/zugaenge`, { headers: { cookie: keks } });
      const anlegen = (keks, name) => fetch(`${base}/api/social/link-neu`, {
        method: 'POST', headers: { 'content-type': 'application/json', cookie: keks }, body: JSON.stringify({ name }),
      });

      assert.equal((await holen(keksLesen)).status, 403, 'Rolle "lesen" bekommt den Link auch lesend nicht');
      const leer = await holen(keksMona);
      assert.equal(leer.status, 200);
      assert.deepEqual(await leer.json(), { basisVorhanden: true, zugaenge: [] });

      assert.equal((await anlegen(keksLesen, 'Team')).status, 403);
      assert.equal((await anlegen(keksMona, 'Team')).status, 403, 'Mitarbeiter duerfen keinen neuen Zugang oeffnen');
      assert.equal((await anlegen(keksChef, '')).status, 400);

      const neu = await anlegen(keksChef, 'Team');
      assert.equal(neu.status, 200);
      const j = await neu.json();
      assert.equal(j.zugaenge.length, 1);
      assert.match(j.zugaenge[0].link, /^https:\/\/upload\.beispiel\.test:8443\/u\/[A-Za-z0-9_-]{20,}$/);
      const tageBis = (Date.parse(j.zugaenge[0].bis) - Date.now()) / 86400000;
      assert.ok(tageBis > 179 && tageBis <= 180, `der Link gilt 180 Tage (${tageBis})`);

      // Der Mitarbeiter sieht denselben Link; der Klartext liegt nur im Privatordner, Rechte 600.
      const mona = await (await holen(keksMona)).json();
      assert.equal(mona.zugaenge[0].link, j.zugaenge[0].link);
      const datei = path.join(privat, 'social', 'upload-links.json');
      assert.equal(fs.statSync(datei).mode & 0o777, 0o600);

      // Sperren im Dashboard: nur Inhaber, danach ist der Zugang weg und der Klartext geloescht.
      const sperren = (keks, name) => fetch(`${base}/api/social/sperren`, {
        method: 'POST', headers: { 'content-type': 'application/json', cookie: keks }, body: JSON.stringify({ name }),
      });
      assert.equal((await sperren(keksLesen, 'Team')).status, 403);
      assert.equal((await sperren(keksMona, 'Team')).status, 403);
      assert.equal((await fetch(`${base}/api/social/sperren`, { headers: { cookie: keksChef } })).status, 405);
      const gesperrt = await sperren(keksChef, 'Team');
      assert.equal(gesperrt.status, 200);
      assert.deepEqual((await gesperrt.json()).zugaenge, []);
      assert.deepEqual((await (await holen(keksMona)).json()).zugaenge, []);
      assert.deepEqual(JSON.parse(fs.readFileSync(datei, 'utf8')).links, []);
      assert.equal((await sperren(keksChef, 'Team')).status, 404, 'nichts mehr aktiv');

      // Gesperrt per Kommandozeile -> hier verschwindet der Link ebenso.
      await anlegen(keksChef, 'Bodenleger');
      const { zugangSperren } = await import('../../../social/lib/eingang.mjs');
      zugangSperren('Bodenleger', { datei: path.join(privat, 'social', 'upload-zugaenge.json') });
      assert.deepEqual((await (await holen(keksMona)).json()).zugaenge, []);

      // Abgelaufen (alter Eintrag ohne Ablaufdatum, vor ueber 180 Tagen angelegt): taucht nicht mehr auf.
      const zDatei = path.join(privat, 'social', 'upload-zugaenge.json');
      const alt = JSON.parse(fs.readFileSync(zDatei, 'utf8'));
      alt.zugaenge.push({ name: 'Altlink', tokenHash: '0'.repeat(64), aktiv: true, angelegt: '2025-01-01T08:00:00.000Z' });
      fs.writeFileSync(zDatei, JSON.stringify(alt));
      assert.deepEqual((await (await holen(keksMona)).json()).zugaenge, []);
    });
  } finally {
    delete process.env.SOCIAL_UPLOAD_BASIS_URL;
  }
});
