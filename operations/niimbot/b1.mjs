/**
 * Niimbot B1 direkt vom Mac drucken - ohne Chromes Bluetooth-Auswahlfenster (09.11.2026: Claude konnte
 * den Adressaufkleber fuer die Packstation nicht drucken, weil nur ein Mensch das Fenster bedienen kann).
 *
 * Die Bilder rendert weiter der Druckdialog im Browser (bausteine/etiketten-druck.mjs); hierher kommen
 * nur fertige Schwarzweiss-Seiten. Das Protokoll ist der B1-Ablauf aus niimbluelib 0.47.1 (B1PrintTask,
 * PacketGenerator, ImageEncoder), nachgebaut statt Fremdcode im Server auszufuehren. Bluetooth spricht
 * die kleine Swift-Bruecke (bruecke.swift, gebaut per `npm run niimbot:bauen`).
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export const KOPF = 384;          // B1: 384 Punkte quer zum Vorschub (203 dpi)
export const MAX_SEITEN = 200;
const MAX_HOEHE = 2400;           // 300 mm Etikett - reicht fuer jede Rolle
const ANTWORT = { 0x21: 0x31, 0x23: 0x33, 0x01: 0x02, 0x03: 0x04, 0x13: 0x14, 0xe3: 0xe4, 0xf3: 0xf4, 0xa3: 0xb3 };
const FEHLER = { 1: 'Deckel offen', 2: 'kein Papier', 3: 'Akku schwach', 5: 'am Drucker abgebrochen', 6: 'Datenfehler', 7: 'überhitzt', 8: 'Papierfehler', 9: 'Drucker beschäftigt', 16: 'falsches Papier', 52: 'Zeitüberschreitung beim Empfang' };

export const appPfad = (env = process.env) => env.TP_NIIMBOT_APP || path.join(homedir(), 'Library', 'Application Support', 'TeppichParadies', 'NiimbotBruecke.app');
export const verfuegbar = (env = process.env) => process.platform === 'darwin' && existsSync(path.join(appPfad(env), 'Contents', 'MacOS', 'niimbot-bruecke'));

export function paket(cmd, daten = [1]) {
  let cs = cmd ^ daten.length;
  for (const b of daten) cs ^= b;
  return Buffer.from([0x55, 0x55, cmd, daten.length, ...daten, cs, 0xaa, 0xaa]);
}

/** Sammelt Benachrichtigungen und gibt vollstaendige Pakete zurueck (eins kann auf mehrere verteilt sein). */
export function paketLeser() {
  let puffer = Buffer.alloc(0);
  return bytes => {
    puffer = Buffer.concat([puffer, bytes]);
    const pakete = [];
    for (;;) {
      const start = puffer.indexOf(Buffer.from([0x55, 0x55]));
      if (start < 0) { puffer = Buffer.alloc(0); break; }
      puffer = puffer.subarray(start);
      if (puffer.length < 4) break;
      const ende = 4 + puffer[3] + 3;
      if (puffer.length < ende) break;
      if (puffer[ende - 2] === 0xaa && puffer[ende - 1] === 0xaa) pakete.push({ cmd: puffer[2], daten: [...puffer.subarray(4, 4 + puffer[3])] });
      puffer = puffer.subarray(puffer[ende - 2] === 0xaa ? ende : 2);
    }
    return pakete;
  };
}

/**
 * Seite {breite, hoehe, bits} -> Paketliste. `bits`: Zeilen zu ceil(breite/8) Bytes, hoechstes Bit links,
 * 1 = schwarz. Die Seite wird mittig auf den Druckkopf gesetzt (wie aufDruckkopf im Dialog); gleiche
 * Zeilen werden zusammengefasst (hoechstens 255), Zeilen mit bis zu 6 Punkten gehen als Punktliste.
 */
export function seitenPakete({ breite, hoehe, bits }) {
  if (!(breite > 0 && breite <= KOPF && hoehe > 0 && hoehe <= MAX_HOEHE)) throw new Error(`Seitengröße ${breite} × ${hoehe} passt nicht auf den B1`);
  const quelle = Math.ceil(breite / 8);
  if (bits.length !== quelle * hoehe) throw new Error('Bilddaten passen nicht zur Seitengröße');
  const versatz = Math.trunc((KOPF - breite) / 2), zb = KOPF / 8;
  const zeile = y => {
    const z = new Uint8Array(zb);
    for (let x = 0; x < breite; x++) if (bits[y * quelle + (x >> 3)] & (0x80 >> (x & 7))) { const k = x + versatz; z[k >> 3] |= 0x80 >> (k & 7); }
    return z;
  };
  const anzahl = z => z.reduce((s, b) => { let n = 0; for (; b; b &= b - 1) n++; return s + n; }, 0);
  const pakete = [paket(0x03), paket(0x13, [hoehe >> 8, hoehe & 255, KOPF >> 8, KOPF & 255, 0, 1])];
  for (let y = 0; y < hoehe;) {
    const z = zeile(y);
    let wdh = 1;
    while (y + wdh < hoehe && wdh < 255 && Buffer.compare(Buffer.from(zeile(y + wdh)), Buffer.from(z)) === 0) wdh++;
    const pos = [y >> 8, y & 255], n = anzahl(z);
    if (!n) pakete.push(paket(0x84, [...pos, wdh]));
    else {
      const teil = [0, 16, 32].map(a => anzahl(z.subarray(a, a + 16)));
      if (n <= 6) {
        const punkte = [];
        for (let x = 0; x < KOPF; x++) if (z[x >> 3] & (0x80 >> (x & 7))) punkte.push(x >> 8, x & 255);
        pakete.push(paket(0x83, [...pos, ...teil, wdh, ...punkte]));
      } else pakete.push(paket(0x85, [...pos, ...teil, wdh, ...z]));
    }
    y += wdh;
  }
  pakete.push(paket(0xe3));
  return pakete;
}

/**
 * Druckt die Seiten ueber einen Transport { senden(buffer), beiPaket(fn) }. Ablauf wie B1PrintTask:
 * Dichte, Etikettenart, Druckstart, je Seite Seitenpakete, dann Status abfragen bis alle Seiten fertig
 * sind, Druckende. Gibt die Zahl der fertigen Seiten zurueck.
 */
export async function drucke(seiten, { dichte = 3, transport, pause = ms => new Promise(r => setTimeout(r, ms)), statusTakt = 300, zeitlimit = 30_000 }) {
  if (!Array.isArray(seiten) || !seiten.length || seiten.length > MAX_SEITEN) throw new Error(`1 bis ${MAX_SEITEN} Seiten erwartet`);
  const d = Math.min(5, Math.max(1, Math.trunc(Number(dichte)) || 3));
  const listen = seiten.map(seitenPakete);   // erst alles pruefen, dann drucken
  let warte = null, fehler = null;
  transport.beiPaket(p => {
    if (p.cmd === 0xdb) { fehler = new Error(`Drucker meldet: ${FEHLER[p.daten[0]] || `Fehler ${p.daten[0]}`}`); warte?.nein(fehler); return; }
    if (warte && p.cmd === warte.cmd) warte.ja(p);
  });
  const frage = (pkt, ms = 2000) => new Promise((ja, nein) => {
    if (fehler) { nein(fehler); return; }
    const t = setTimeout(() => { warte = null; nein(new Error(`Drucker antwortet nicht (Befehl 0x${pkt[2].toString(16)})`)); }, ms);
    warte = { cmd: ANTWORT[pkt[2]], ja: p => { clearTimeout(t); warte = null; ja(p); }, nein: e => { clearTimeout(t); warte = null; nein(e); } };
    transport.senden(pkt);
  });
  let fertig = 0;
  try {
    await frage(paket(0x21, [d]));
    await frage(paket(0x23, [1]));
    await frage(paket(0x01, [seiten.length >> 8, seiten.length & 255, 0, 0, 0, 0, 0]));
    for (const liste of listen) {
      for (const pkt of liste) {
        if (ANTWORT[pkt[2]]) await frage(pkt, 10_000);
        else { if (fehler) throw fehler; transport.senden(pkt); await pause(10); }
      }
    }
    const bis = Date.now() + zeitlimit * seiten.length;
    while (fertig < seiten.length) {
      if (Date.now() > bis) throw new Error('Drucker meldet den Abschluss nicht');
      const s = (await frage(paket(0xa3), 5000)).daten;
      fertig = (s[0] << 8) | s[1];
      if (s.length === 10 && s[6]) throw new Error(`Drucker meldet: ${FEHLER[s[6]] || `Fehler ${s[6]}`}`);
      if (fertig < seiten.length) await pause(statusTakt);
    }
  } catch (e) { e.fertig = fertig; throw e; } finally {
    try { await frage(paket(0xf3), 2000); } catch { /* Druckende ist nur Aufraeumen */ }
  }
  return fertig;
}

/** Startet die Bruecke, wartet auf "bereit" und liefert den Transport. */
export function verbinde({ env = process.env, name = 'B1' } = {}) {
  if (!verfuegbar(env)) return Promise.reject(new Error('Mac-Druck nicht eingerichtet (npm run niimbot:bauen)'));
  const kind = spawn(path.join(appPfad(env), 'Contents', 'MacOS', 'niimbot-bruecke'), [name], { stdio: ['pipe', 'pipe', 'pipe'] });
  const leser = paketLeser();
  let handler = () => {}, rest = '', log = '';
  kind.stderr.on('data', d => { log = (log + d).slice(-500); });
  return new Promise((ja, nein) => {
    const meldung = { 3: 'Bluetooth am Mac aus oder nicht erlaubt', 4: 'Verbinden fehlgeschlagen', 5: 'Drucker getrennt', 6: 'Drucker nicht gefunden – eingeschaltet und in der Nähe?' };
    kind.on('exit', code => nein(new Error(meldung[code] || `Bruecke beendet (${code}) ${log.trim().split('\n').pop() || ''}`)));
    kind.on('error', nein);
    kind.stdout.on('data', d => {
      const zeilen = (rest + d).split('\n'); rest = zeilen.pop();
      for (const z of zeilen) {
        if (z === 'bereit') ja({
          senden: buf => kind.stdin.write(buf.toString('hex') + '\n'),
          beiPaket: fn => { handler = fn; },
          trennen: () => new Promise(r => { if (kind.exitCode !== null) { r(); return; } kind.once('exit', r); kind.stdin.end(); setTimeout(() => kind.kill(), 3000); }),
        });
        else if (/^[0-9a-f]+$/.test(z)) for (const p of leser(Buffer.from(z, 'hex'))) handler(p);
      }
    });
  });
}

/** Seiten aus dem Dialog ({breite, hoehe, bits: base64}) pruefen und dekodieren. */
export function seitenAusJson(seiten) {
  if (!Array.isArray(seiten) || !seiten.length || seiten.length > MAX_SEITEN) throw new Error(`1 bis ${MAX_SEITEN} Seiten erwartet`);
  return seiten.map(s => ({ breite: Number(s?.breite), hoehe: Number(s?.hoehe), bits: Buffer.from(String(s?.bits || ''), 'base64') }));
}

let belegt = false;
/** Ganzer Auftrag: verbinden, drucken, trennen. Immer nur ein Auftrag gleichzeitig. */
export async function druckeAmMac(seiten, { dichte, env } = {}) {
  seiten.forEach(seitenPakete);   // Fehler im Bild melden, bevor der Drucker belegt wird
  if (belegt) throw new Error('Der Drucker druckt gerade einen anderen Auftrag.');
  belegt = true;
  try {
    const transport = await verbinde({ env });
    try { return await drucke(seiten, { dichte, transport }); } finally { await transport.trennen(); }
  } finally { belegt = false; }
}
