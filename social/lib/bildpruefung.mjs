/**
 * Technische Bildpruefung: Groesse, Helligkeit, Schaerfe, Dubletten.
 *
 * Ohne Bildbibliothek: macOS bringt `sips` mit, das jedes Handyformat (auch
 * HEIC) lesen und als unkomprimiertes BMP ausgeben kann. Aus den rohen
 * Bildpunkten rechnet dieses Modul selbst - die Rechenteile sind reine
 * Funktionen und ohne sips testbar.
 *
 * Die Pruefung sortiert nur technisch Unbrauchbares aus. Ob ein Bild etwas
 * zeigt, das nicht veroeffentlicht werden darf, entscheidet sie NICHT - das
 * ist die Sichtung durch die Redaktion (siehe social/AGENTEN.md).
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const GRENZEN = Object.freeze({
  minLangeKante: 1080,      // darunter wird das Bild im Beitrag hochskaliert und matschig
  zuDunkel: 38,
  eherDunkel: 60,
  zuHell: 236,
  // Varianz des Laplace-Filters bei 1024 px langer Kante. Geeicht an echten
  // Referenzfotos: ein scharfes Bild eines glatten Vinylbodens liegt bei ~140,
  // ein strukturierter Teppichboden ueber 1000, ein verwackeltes Bild unter 10.
  // Glatte Boeden sind von Natur aus kantenarm - die Grenze bleibt deshalb tief.
  unscharf: 30,
  eherUnscharf: 80,
  dubletteAbstand: 6,       // Hamming-Abstand zweier 64-Bit-Hashes
});

/** Liest ein unkomprimiertes 24- oder 32-Bit-BMP. */
export function parseBmp(buf) {
  if (buf.length < 54 || buf.toString('latin1', 0, 2) !== 'BM') throw new Error('Kein BMP');
  const start = buf.readUInt32LE(10);
  const breite = buf.readInt32LE(18);
  const hoeheRoh = buf.readInt32LE(22);
  const bits = buf.readUInt16LE(28);
  if (bits !== 24 && bits !== 32) throw new Error(`BMP mit ${bits} Bit wird nicht unterstuetzt`);
  const hoehe = Math.abs(hoeheRoh);
  const bytes = bits / 8;
  const zeile = Math.ceil((breite * bytes) / 4) * 4;
  const grau = new Float32Array(breite * hoehe);
  for (let y = 0; y < hoehe; y += 1) {
    // BMP steht normalerweise auf dem Kopf (positive Hoehe = unterste Zeile zuerst).
    const quelle = start + (hoeheRoh > 0 ? hoehe - 1 - y : y) * zeile;
    for (let x = 0; x < breite; x += 1) {
      const o = quelle + x * bytes;
      grau[y * breite + x] = 0.114 * buf[o] + 0.587 * buf[o + 1] + 0.299 * buf[o + 2];
    }
  }
  return { breite, hoehe, grau };
}

export function helligkeit({ grau }) {
  let summe = 0;
  for (let i = 0; i < grau.length; i += 1) summe += grau[i];
  return summe / grau.length;
}

/** Varianz des Laplace-Filters: viel Kante = scharf, wenig = verwackelt oder unscharf. */
export function laplaceVarianz({ breite, hoehe, grau }) {
  let summe = 0; let quadrat = 0; let n = 0;
  for (let y = 1; y < hoehe - 1; y += 1) {
    for (let x = 1; x < breite - 1; x += 1) {
      const i = y * breite + x;
      const l = grau[i - breite] + grau[i + breite] + grau[i - 1] + grau[i + 1] - 4 * grau[i];
      summe += l; quadrat += l * l; n += 1;
    }
  }
  if (!n) return 0;
  const mittel = summe / n;
  return quadrat / n - mittel * mittel;
}

/** Verkleinert per Flaechenmittel - fuer den Hash genuegen 9 x 8 Punkte. */
export function verkleinere({ breite, hoehe, grau }, zielB, zielH) {
  const aus = new Float32Array(zielB * zielH);
  for (let y = 0; y < zielH; y += 1) {
    const y0 = Math.floor((y * hoehe) / zielH); const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * hoehe) / zielH));
    for (let x = 0; x < zielB; x += 1) {
      const x0 = Math.floor((x * breite) / zielB); const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * breite) / zielB));
      let s = 0; let n = 0;
      for (let yy = y0; yy < y1; yy += 1) for (let xx = x0; xx < x1; xx += 1) { s += grau[yy * breite + xx]; n += 1; }
      aus[y * zielB + x] = s / n;
    }
  }
  return { breite: zielB, hoehe: zielH, grau: aus };
}

/** Differenz-Hash: 64 Bit, stabil gegen Groesse, Kompression und leichte Helligkeitsaenderung. */
export function dHash(bild) {
  const k = verkleinere(bild, 9, 8);
  let hex = '';
  for (let y = 0; y < 8; y += 1) {
    let byte = 0;
    for (let x = 0; x < 8; x += 1) byte = (byte << 1) | (k.grau[y * 9 + x] > k.grau[y * 9 + x + 1] ? 1 : 0);
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

export function hammingAbstand(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let bits = 0;
  for (let i = 0; i < a.length; i += 2) {
    let x = parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16);
    while (x) { bits += x & 1; x >>= 1; }
  }
  return bits;
}

/** Urteil aus den Messwerten. `gruende` erklaert es in Worten, die ein Mensch versteht. */
export function bewerte({ breite, hoehe, helligkeit: hell, schaerfe }, grenzen = GRENZEN) {
  const gruende = []; let urteil = 'ok';
  const lang = Math.max(breite, hoehe);
  if (lang < grenzen.minLangeKante) { urteil = 'aussortiert'; gruende.push(`zu klein (${breite} × ${hoehe})`); }
  if (hell < grenzen.zuDunkel) { urteil = 'aussortiert'; gruende.push('zu dunkel'); }
  else if (hell > grenzen.zuHell) { urteil = 'aussortiert'; gruende.push('überbelichtet'); }
  if (schaerfe < grenzen.unscharf) { urteil = 'aussortiert'; gruende.push('unscharf oder verwackelt'); }
  if (urteil === 'ok') {
    if (hell < grenzen.eherDunkel) { urteil = 'unsicher'; gruende.push('eher dunkel'); }
    if (schaerfe < grenzen.eherUnscharf) { urteil = 'unsicher'; gruende.push('eher unscharf'); }
  }
  return { urteil, gruende };
}

/**
 * Markiert Dubletten innerhalb einer Liste und gegen bereits bekannte Bilder.
 * Von zwei gleichen Bildern bleibt das schaerfere.
 */
export function findeDubletten(neu, bekannt = [], grenze = GRENZEN.dubletteAbstand) {
  const dubletten = new Map();
  const behalten = [];
  for (const b of [...neu].sort((x, y) => (y.schaerfe ?? 0) - (x.schaerfe ?? 0))) {
    const gleich = behalten.find(a => hammingAbstand(a.dhash, b.dhash) <= grenze)
      ?? bekannt.find(a => a.id !== b.id && hammingAbstand(a.dhash, b.dhash) <= grenze);
    if (gleich) dubletten.set(b.id, gleich.id); else behalten.push(b);
  }
  return dubletten;
}

// --- sips -------------------------------------------------------------------

function sips(args) {
  return execFileSync('/usr/bin/sips', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

export function abmessungen(datei) {
  const aus = sips(['-g', 'pixelWidth', '-g', 'pixelHeight', datei]);
  const b = /pixelWidth:\s*(\d+)/.exec(aus); const h = /pixelHeight:\s*(\d+)/.exec(aus);
  if (!b || !h) throw new Error(`Bildgroesse nicht lesbar: ${path.basename(datei)}`);
  return { breite: Number(b[1]), hoehe: Number(h[1]) };
}

/** HEIC, PNG, WebP -> JPEG. Handys liefern HEIC, Browser und Meta wollen JPEG. */
export function zuJpeg(quelle, ziel) {
  sips(['-s', 'format', 'jpeg', '-s', 'formatOptions', '92', quelle, '--out', ziel]);
  return ziel;
}

/** Misst ein Bild von der Platte. Braucht macOS (sips). */
export function messe(datei) {
  const { breite, hoehe } = abmessungen(datei);
  const tmp = path.join(os.tmpdir(), `tp-social-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.bmp`);
  try {
    sips(['-s', 'format', 'bmp', '-Z', '1024', datei, '--out', tmp]);
    const bild = parseBmp(fs.readFileSync(tmp));
    return { breite, hoehe, helligkeit: helligkeit(bild), schaerfe: laplaceVarianz(bild), dhash: dHash(bild) };
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}
