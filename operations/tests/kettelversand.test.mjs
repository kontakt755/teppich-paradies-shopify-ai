import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { aendereKettelversand, leseKettelversand, packVergleich } from '../lib/kettelversand.mjs';
const auftrag={id:'auftrag-test',details:{lieferadresse:{plz:'16515'}},positionen:['a','b'].map(lineItemId=>({lineItemId,ausfuehrung:['Einfassung: Gekettelt']}))};
const config={auftrag,statusAlle:{},actor:'Testperson',jetzt:new Date('2026-10-22T12:00:00Z')};
function umgebung(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kettelversand-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
const paket={positionen:['a','b'],laenge:180,breite:20,hoehe:20,gewicht:12,warenwert:250,datum:'2026-10-22',gemessen:true,zusammenGerollt:true};
function bereit(dir){let revision=0;for(const lineItemId of ['a','b'])for(const aktion of ['angekommen','fertig'])aendereKettelversand(dir,{revision:revision++,aktion,lineItemId,beleg:'Testquittung'},config);return revision;}
test('Eingang und Ketteln brauchen eigene Belege und bleiben getrennt vom Versand',t=>{
 const dir=umgebung(t);
 assert.throws(()=>aendereKettelversand(dir,{revision:0,aktion:'fertig',lineItemId:'a',beleg:'ja'},config),/Zuerst/);
 assert.throws(()=>aendereKettelversand(dir,{revision:0,aktion:'angekommen',lineItemId:'a'},config),/Beleg|Bestätigung/);
 const a=aendereKettelversand(dir,{revision:0,aktion:'angekommen',lineItemId:'a',beleg:'Lieferschein-Test'},config);
 assert(a.positionen.a.angekommen);assert(!a.positionen.a.fertig);assert.deepEqual(a.pakete,[]);
 assert(!fs.existsSync(path.join(dir,'auftragsstatus.json')));
 assert.throws(()=>aendereKettelversand(dir,{revision:0,aktion:'fertig',lineItemId:'a',beleg:'ja'},config),/inzwischen/);
});
test('Gemeinsame Rolle braucht fertige Teppiche und ausdrückliche Packbestätigung',t=>{
 const dir=umgebung(t);assert.throws(()=>aendereKettelversand(dir,{revision:0,aktion:'paket',paket},config),/fertig/);
 const revision=bereit(dir);
 for(const p of [{...paket,gemessen:false},{...paket,zusammenGerollt:false},{...paket,gewicht:0},{...paket,positionen:['a','fremd']}])assert.throws(()=>aendereKettelversand(dir,{revision,aktion:'paket',paket:p},config));
 const a=aendereKettelversand(dir,{revision,aktion:'paket',paket},config);assert.equal(a.pakete.length,1);assert.equal(a.pakete[0].gewicht,12);assert(a.pakete[0].zusammenGerollt);
 assert.throws(()=>aendereKettelversand(dir,{revision:a.revision,aktion:'paket',paket:{...paket,positionen:['a']}},config),/anderen Packstück/);
 assert.equal(leseKettelversand(dir).auftraege[auftrag.id].pakete.length,1);
});
test('Keine erfundene Marke bei fehlenden Tarifen; versendete und stornierte Aufträge gesperrt',t=>{
 const dir=umgebung(t);const revision=bereit(dir);const a=aendereKettelversand(dir,{revision,aktion:'paket',paket},config);
 assert.throws(()=>aendereKettelversand(dir,{revision:a.revision,aktion:'schein',paketId:a.pakete[0].id,dienst:'GLS',nummer:'test'},config),/nicht freigegeben/);
 assert.equal(leseKettelversand(dir).auftraege[auftrag.id].pakete[0].schein,undefined);
 assert.throws(()=>aendereKettelversand(dir,{revision:5,aktion:'angekommen',lineItemId:'a',beleg:'ja'},{...config,auftrag:{...auftrag,storniert:true}}),/Gültiger/);
 assert.throws(()=>aendereKettelversand(dir,{revision:5,aktion:'angekommen',lineItemId:'a',beleg:'ja'},{...config,statusAlle:{'auftrag-test::a':{status:'raus'}}}),/bereits/);
 assert.equal(packVergleich(paket,null).empfehlung,null);
});
test('Beschädigte Ablage und parallele Schreiber werden nicht überschrieben',t=>{
 const dir=umgebung(t);const file=path.join(dir,'kettelversand.json');fs.writeFileSync(file,'kaputt');
 assert.throws(()=>aendereKettelversand(dir,{revision:0,aktion:'angekommen',lineItemId:'a',beleg:'ja'},config),/nicht lesbar/);assert.equal(fs.readFileSync(file,'utf8'),'kaputt');
 fs.writeFileSync(file+'.lock','belegt');assert.throws(()=>aendereKettelversand(dir,{},config));
});

import {basis} from './kettelversand-tarif-fixture.mjs';
import {createApi} from '../../scripts/dashboard-api.mjs';
test('Gemessene Packmaße und Gewicht wählen GLS/GEL über den vorhandenen Rechner',()=>{
 const {b,t}=basis();for(const f of t.felder)f.wert=b[f.zeile];
 const opts={zielPlz:'16515',abholPlz:'16515'};
 const klein=packVergleich(paket,t,opts);assert.equal(klein.empfehlung,'GLS');
 const gross=packVergleich({...paket,laenge:250},t,opts);assert.equal(gross.gls.netto,null);assert.equal(gross.empfehlung,'GEL');
 const schwer=packVergleich({...paket,gewicht:41},t,opts);assert.equal(schwer.gls.netto,null);assert.equal(schwer.empfehlung,'GEL');
 const alt=packVergleich(paket,{...t,saetze:{...t.saetze,'GLS gültig bis':'2020-01-01','GEL gültig bis':'2020-01-01'}},opts);assert.equal(alt.empfehlung,null);
});
test('Echter Schein wird getrennt erfasst und sperrt Packstückänderungen',tst=>{
 const dir=umgebung(tst),{b,t}=basis();for(const f of t.felder)f.wert=b[f.zeile];
 const cfg={...config,tarif:t,abholPlz:'16515'};
 const revision=bereit(dir);const a=aendereKettelversand(dir,{revision,aktion:'paket',paket},cfg);
 const z=aendereKettelversand(dir,{revision:a.revision,aktion:'schein',paketId:a.pakete[0].id,dienst:'GLS',nummer:'TEST-123'},cfg);
 assert.equal(z.pakete[0].schein.nummer,'TEST-123');assert(!fs.existsSync(path.join(dir,'auftragsstatus.json')));
 assert.throws(()=>aendereKettelversand(dir,{revision:z.revision,aktion:'paket',paket:{...paket,id:a.pakete[0].id}},cfg),/gesperrt/);
 assert.throws(()=>aendereKettelversand(dir,{revision:z.revision,aktion:'schein',paketId:a.pakete[0].id,dienst:'GLS',nummer:'NOCHMAL'},cfg),/bereits/);
});
test('Dashboard-API liefert neuen Dialog und erzwingt Leserolle',async t=>{
 const dir=umgebung(t),api=createApi({privatDirPath:dir,gh:async()=>''});
 api._lieferantenKontext=()=>({modell:{auftraege:[auftrag]},statusAlle:{},stammdaten:{absender:{kettelservice:{plz:'16515'}}}});
 const r=api.einkaufKettelversand({orderId:auftrag.id});assert.equal(r.positionen.length,2);assert.equal(r.revision,0);
 await assert.rejects(()=>api.einkaufAuftragsstatusSetzen({aktion:'kettelversand',kettelAktion:'angekommen',orderId:auftrag.id,revision:0,lineItemId:'a',beleg:'Test'},{name:'Leser',rolle:'lesen'}),/lesen/);
 assert.throws(()=>api.einkaufKettelversand({orderId:'fremd'}),/nicht gefunden/);
});

import {SICHERUNGSPFADE} from '../scripts/sicherung.mjs';
test('Kettlernachweise und Packstücke sind in der Datensicherung enthalten',()=>assert(SICHERUNGSPFADE.includes('kettelversand.json')));
