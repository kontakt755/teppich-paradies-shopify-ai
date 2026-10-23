/** Kettlerfortschritt und gemessene Packstuecke, getrennt vom Kundenversand. */
import fs from 'node:fs';
import path from 'node:path';
import { berechneVersand } from '../../docs/ai-dashboard/lib/versandkosten.mjs';
export const kettelPosition = p => !p.istMuster && !p.eigenleistung && p.ausfuehrung?.some(x => /gekettelt/i.test(x));
export function leseKettelversand(dir) {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(dir, 'kettelversand.json'), 'utf8'));
    if (d.version !== 1 || !d.auftraege || typeof d.auftraege !== 'object' || Array.isArray(d.auftraege)) throw new Error('Aufbau ungültig');
    return d;
  } catch (e) { if (e.code === 'ENOENT') return { version: 1, auftraege: {} }; throw new Error('Kettelversand-Ablage nicht lesbar: '+e.message); }
}
export function packVergleich(pack, tarif, { zielPlz, abholPlz } = {}) {
  if (!tarif) return { fehler: 'Private Versandtarife fehlen.', empfehlung: null };
  const eingabe = Object.fromEntries(tarif.felder.map(f => [f.zeile, f.wert ?? '']));
  Object.assign(eingabe, {5:pack.laenge,6:pack.breite,7:pack.hoehe,8:pack.gewicht,9:1,10:zielPlz,11:abholPlz,12:'Ja',14:pack.warenwert,15:'Rolle',17:pack.datum});
  const r = berechneVersand(eingabe, tarif);
  const erlaubt = ['GLS','GEL'].filter(x => Number.isFinite(r[x.toLowerCase()]?.netto));
  const empfehlung = erlaubt.sort((a,b) => r[a.toLowerCase()].netto-r[b.toLowerCase()].netto)[0] || null;
  return {...r, empfehlung};
}
const text = (x,n=500) => String(x||'').trim().slice(0,n);
const leer = () => ({revision:0,positionen:{},pakete:[]});
export function aendereKettelversand(dir, payload, { auftrag, statusAlle, actor, tarif, abholPlz, jetzt = new Date() }) {
  if (!actor || !auftrag || auftrag.storniert || auftrag.testbestellung) throw new Error('Gültiger Auftrag und handelnde Person erforderlich.');
  const erlaubt = new Map(auftrag.positionen.filter(kettelPosition).map(p => [p.lineItemId,p]));
  if (!erlaubt.size) throw new Error('Keine gekettelten Warenpositionen in diesem Auftrag.');
  const datei=path.join(dir,'kettelversand.json'), sperre=datei+'.lock';
  const fd=fs.openSync(sperre,'wx',0o600);
  try {
    const d=leseKettelversand(dir); const a=d.auftraege[auftrag.id] || leer();
    if (payload.revision !== a.revision) throw new Error('Stand wurde inzwischen geändert. Bitte neu öffnen.');
    const aktuell = id => statusAlle[`${auftrag.id}::${id}`];
    const pruefeId = id => {
      if (!erlaubt.has(id)) throw new Error('Position gehört nicht zum Kettelauftrag.');
      if (['raus','erledigt'].includes(aktuell(id)?.status)) throw new Error('Position ist bereits beim Kundenversand oder abgeschlossen.');
    };
    const am=jetzt.toISOString();
    if (payload.aktion==='angekommen' || payload.aktion==='fertig') {
      const id=payload.lineItemId; pruefeId(id);
      const beleg=text(payload.beleg);
      if (!beleg) throw new Error('Bitte Empfangsbeleg bzw. Bestätigung des Kettlers angeben.');
      const p=a.positionen[id] || {};
      if (payload.aktion==='fertig' && !p.angekommen) throw new Error('Zuerst den Eingang beim Kettler bestätigen.');
      if (p[payload.aktion]) throw new Error('Dieser Schritt ist bereits bestätigt.');
      a.positionen[id]={...p,[payload.aktion]:{am,von:actor,beleg}};
    } else if (payload.aktion==='paket') {
      const p=payload.paket || {};
      if(!Array.isArray(p.positionen) || p.positionen.length>200) throw new Error('Bitte gültige Teppichpositionen auswählen.');
      const ids=[...new Set(p.positionen)];
      if (!ids.length || ids.length!==(p.positionen||[]).length) throw new Error('Positionen einmalig einem Packstück zuordnen.');
      for(const id of ids) { pruefeId(id); if(!a.positionen[id]?.fertig) throw new Error('Alle Teppiche im Packstück müssen fertig gekettelt sein.'); }
      if(ids.length>1 && p.zusammenGerollt!==true) throw new Error('Gemeinsames Rollen und sichere Verpackung vor Ort bestätigen.');
      for(const k of ['laenge','breite','hoehe','gewicht','warenwert']) if(typeof p[k]!=='number'||!Number.isFinite(p[k])||p[k]<(k==='warenwert'?0:Number.MIN_VALUE)) throw new Error('Gemessene Packmaße, Bruttogewicht und Warenwert vollständig angeben.');
      if(p.laenge<p.breite||p.breite<p.hoehe) throw new Error('Packmaße absteigend angeben: Länge ≥ Breite ≥ Höhe.');
      if(p.gemessen!==true) throw new Error('Fertige Rolle einschließlich Verpackung messen und wiegen.');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(p.datum||'')||new Date(p.datum).toISOString().slice(0,10)!==p.datum) throw new Error('Gültiges Versanddatum erforderlich.');
      const id=text(p.id,80)||'pack-'+a.revision;
      if(a.pakete.some(x=>x.id!==id && x.positionen.some(x=>ids.includes(x)))) throw new Error('Ein Teppich ist bereits einem anderen Packstück zugeordnet.');
      const vorher=a.pakete.find(x=>x.id===id);
      if(vorher?.schein) throw new Error('Packstück mit vorhandenem Versandschein ist gesperrt. Vor einer Änderung den Schein im Versandportal klären.');
      const paket={id,positionen:ids,laenge:p.laenge,breite:p.breite,hoehe:p.hoehe,gewicht:p.gewicht,warenwert:p.warenwert,datum:p.datum,gemessen:true,zusammenGerollt:ids.length>1,am,von:actor};
      a.pakete=[...a.pakete.filter(x=>x.id!==id),paket];
    } else if (payload.aktion==='paketEntfernen') {
      const p=a.pakete.find(x=>x.id===payload.paketId);
      if(!p) throw new Error('Packstück fehlt.');
      p.positionen.forEach(pruefeId);
      if(p.schein) throw new Error('Vorhandenen Schein zuerst im Versandportal klären; Packstück bleibt gesperrt.');
      a.pakete=a.pakete.filter(x=>x.id!==p.id);
    } else if (payload.aktion==='schein') {
      const p=a.pakete.find(x=>x.id===payload.paketId); if(!p) throw new Error('Packstück fehlt.');
      p.positionen.forEach(pruefeId);
      if(p.schein) throw new Error('Versandschein bereits hinterlegt; keinen zweiten erstellen.');
      const r=packVergleich(p,tarif,{zielPlz:auftrag.details?.lieferadresse?.plz,abholPlz});
      const dienst=payload.dienst; if(!['GLS','GEL'].includes(dienst)||!Number.isFinite(r[dienst.toLowerCase()]?.netto)) throw new Error('Versanddienst für dieses Packstück nicht freigegeben: Tarife und Packmaße prüfen.');
      const nummer=text(payload.nummer,80); if(!nummer) throw new Error('Sendungsnummer vom tatsächlich erstellten Versandschein fehlt.');
      p.schein={dienst,nummer,am,von:actor};
    } else throw new Error('Unbekannter Kettlerschritt.');
    a.revision++;a.aktualisiertAm=am;d.auftraege[auftrag.id]=a;
    const tmp=datei+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(d,null,2),{mode:0o600});fs.renameSync(tmp,datei);
    return a;
  } finally {fs.closeSync(fd);fs.unlinkSync(sperre);}
}
