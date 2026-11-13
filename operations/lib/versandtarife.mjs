/** Vertragspreise bleiben ausserhalb des Repositorys und des statischen Webroots. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pruefeVersandtarif } from '../../docs/ai-dashboard/lib/versandkosten.mjs';
export function versandtarifePfad(privatDir) {
  return path.join(privatDir||process.env.TP_PRIVAT_DIR||path.join(os.homedir(),'teppich-paradies-analyse'),'versandkosten','tarife.json');
}
/** Optionale Portaladressen (portale.json neben den Tarifen): nur https, nur GLS/GEL - wie im Kettelversand. */
function lesePortale(datei) {
  const portale = {};
  try {
    const p = JSON.parse(fs.readFileSync(path.join(path.dirname(datei), 'portale.json'), 'utf8'));
    for (const name of ['GLS', 'GEL']) if (typeof p?.[name] === 'string' && /^https:\/\//.test(p[name])) portale[name] = p[name];
  } catch { /* Ohne Datei gibt es keinen Portalknopf. */ }
  return portale;
}
export function leseVersandtarife(datei=versandtarifePfad()) {
  try { return {verfuegbar:true,tarif:pruefeVersandtarif(JSON.parse(fs.readFileSync(datei,'utf8'))),portale:lesePortale(datei)}; }
  catch(e){return {verfuegbar:false,hinweis:e.code==='ENOENT'?'Die privaten Versandtarife sind auf diesem Rechner noch nicht eingerichtet.':'Die privaten Versandtarife sind unvollständig oder beschädigt.'};}
}
