/**
 * Reel-Agent: aus Standbildern (und spaeter kurzen Clips) ein Hochkant-Video.
 *
 * Die Bilder kommen fertig aus der Werkstatt (Vorlage story_foto, 1080 x 1920),
 * also mit derselben Schrift und Signatur wie jeder andere Beitrag. ffmpeg
 * setzt sie nur hintereinander: jedes Bild steht gut zwei Sekunden und wird
 * dabei langsam herangezoomt. Kein Filter, keine Effekte, keine KI.
 *
 * Braucht ffmpeg (`brew install ffmpeg`). Fehlt es, meldet `ffmpegPfad` null,
 * und der Aufrufer laesst das Reel aus - der Rest des Systems laeuft weiter.
 *
 * STAND: Der Aufbau der ffmpeg-Argumente ist getestet, ein echter Lauf steht
 * aus, weil ffmpeg auf dem Betriebsrechner noch nicht installiert ist.
 */

import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { promisify } from 'node:util';

const starte = promisify(execFile);

export function ffmpegPfad(kandidaten = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg']) {
  for (const k of kandidaten) if (fs.existsSync(k)) return k;
  try { return execFileSync('/usr/bin/which', ['ffmpeg'], { encoding: 'utf8' }).trim() || null; } catch { return null; }
}

/** Reihenfolge eines Baustellen-Reels: vorher -> Arbeit -> Detail -> nachher. Das Ergebnis kommt zum Schluss. */
export function reelReihenfolge(medien) {
  const rang = { vorher: 0, arbeit: 1, detail: 2, nachher: 4 };
  return [...medien].sort((a, b) => (rang[a.rolle] ?? 3) - (rang[b.rolle] ?? 3) || a.reihenfolge - b.reihenfolge);
}

/** Lohnt ein Reel? Erst ab drei Bildern, und nur wenn es eine Entwicklung zeigt oder Bewegtbild dabei ist. */
export function reelMoeglich(medien) {
  const bilder = medien.filter(m => m.art === 'bild' && ['ok', 'unsicher'].includes(m.pruefung) && m.datenschutz === 'ok');
  const rollen = new Set(bilder.map(m => m.rolle).filter(Boolean));
  return bilder.length >= 3 && (rollen.has('vorher') && rollen.has('nachher'));
}

export function ffmpegArgumente(bilder, ziel, { sekunden = 2.4, fps = 30 } = {}) {
  if (bilder.length < 2) throw new Error('Ein Reel braucht mindestens zwei Bilder');
  const frames = Math.round(sekunden * fps);
  const args = ['-y'];
  for (const b of bilder) args.push('-loop', '1', '-t', String(sekunden), '-i', b);
  // Stumme Tonspur: manche Player zeigen Videos ohne Audiospur nicht an.
  args.push('-f', 'lavfi', '-t', String(sekunden * bilder.length), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
  const teile = bilder.map((_, i) => `[${i}:v]scale=1188:2112,zoompan=z='1+0.05*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=${fps},setsar=1[v${i}]`);
  const kette = `${teile.join(';')};${bilder.map((_, i) => `[v${i}]`).join('')}concat=n=${bilder.length}:v=1:a=0,format=yuv420p[v]`;
  args.push('-filter_complex', kette, '-map', '[v]', '-map', `${bilder.length}:a`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-r', String(fps), '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', ziel);
  return args;
}

export async function baueReel(bilder, ziel, optionen = {}) {
  const ffmpeg = optionen.ffmpeg ?? ffmpegPfad();
  if (!ffmpeg) throw new Error('ffmpeg ist nicht installiert (brew install ffmpeg) – Reel übersprungen');
  await starte(ffmpeg, ffmpegArgumente(bilder, ziel, optionen), { timeout: 5 * 60 * 1000, maxBuffer: 16 * 1024 * 1024 });
  return ziel;
}
