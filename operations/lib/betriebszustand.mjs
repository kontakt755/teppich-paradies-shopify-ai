/** Nur Zeit-/Erfolgsmetadaten der bestehenden Sicherung, Werkbank-Bruecke und Updates. */
import fs from 'node:fs';
import path from 'node:path';
import { nachziehStand } from './betrieb-nachziehen.mjs';

function stand(datei, feld, jetzt, maxStunden) {
  let roh;
  try { roh = JSON.parse(fs.readFileSync(datei, 'utf8')); }
  catch (e) { return { status: e.code === 'ENOENT' ? 'unbekannt' : 'fehler', letzterErfolg: null }; }
  const iso = roh?.[feld];
  const zeit = typeof iso === 'string' ? Date.parse(iso) : NaN;
  if (!Number.isFinite(zeit) || zeit > jetzt.getTime() + 300000) return { status: 'unbekannt', letzterErfolg: null };
  return { status: jetzt.getTime() - zeit > maxStunden * 3600000 ? 'alt' : 'ok', letzterErfolg: new Date(zeit).toISOString() };
}

const berlin = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
function ortszeit(zeit) {
  const p = Object.fromEntries(berlin.formatToParts(zeit).map(t => [t.type, t.value]));
  return { tag: `${p.year}-${p.month}-${p.day}`, minuten: Number(p.hour) * 60 + Number(p.minute) };
}

/** Taeglich 22:30 Uhr, mit 30 Minuten Luft fuer den Archivlauf. */
export function sicherungsstand(datei, jetzt) {
  const aktuell = stand(datei, 'letzterErfolg', jetzt, 48);
  if (aktuell.status !== 'ok') return aktuell;
  const heute = ortszeit(jetzt);
  const tag = heute.minuten >= 23 * 60 ? heute.tag
    : new Date(Date.parse(`${heute.tag}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const erfolg = ortszeit(new Date(aktuell.letzterErfolg));
  if (erfolg.tag < tag || (erfolg.tag === tag && erfolg.minuten < 22 * 60 + 30)) {
    return { ...aktuell, status: 'alt', grund: 'taeglicher-solltermin-verpasst', erwartetFuer: tag };
  }
  return aktuell;
}
export function betriebszustand(dir, { jetzt = new Date() } = {}) {
  const lokal = stand(path.join(dir, 'fehlermeldungen-abgleich.json'), 'aktualisiertAm', jetzt, 48);
  return {
    sicherung: sicherungsstand(path.join(dir, 'sicherungsstand.json'), jetzt),
    // aktualisiertAm belegt nur einen lokalen Rueckmeldungs-Schreibvorgang, auch per CLI.
    // Unveraenderte/fallweise unvollstaendige Einleselaeufe und Cloud-Schreibrechte sind damit nicht belegt.
    werkbank: { status: lokal.status === 'fehler' ? 'fehler' : 'unbekannt',
      letzteLokaleRueckmeldung: lokal.letzterErfolg, lokalerStatus: lokal.status, vollabgleich: 'unbekannt' },
    // Automatisches Nachziehen des Dienst-Checkouts (operations/scripts/betrieb-nachziehen.mjs).
    nachziehen: nachziehStand(dir, { jetzt }),
  };
}
