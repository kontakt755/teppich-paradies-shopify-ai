/** Vertragspreise bleiben ausserhalb des Repositorys und des statischen Webroots. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pruefeVersandtarif } from '../../docs/ai-dashboard/lib/versandkosten.mjs';
export function versandtarifePfad(privatDir) {
  return path.join(privatDir||process.env.TP_PRIVAT_DIR||path.join(os.homedir(),'teppich-paradies-analyse'),'versandkosten','tarife.json');
}
export function leseVersandtarife(datei=versandtarifePfad()) {
  try { return {verfuegbar:true,tarif:pruefeVersandtarif(JSON.parse(fs.readFileSync(datei,'utf8')))}; }
  catch(e){return {verfuegbar:false,hinweis:e.code==='ENOENT'?'Die privaten Versandtarife sind auf diesem Rechner noch nicht eingerichtet.':'Die privaten Versandtarife sind unvollständig oder beschädigt.'};}
}
