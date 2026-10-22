// Ausschliesslich erfundene Testpreise, keine Vertragskonditionen.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {berechneVersand,istMetropole} from '../lib/versandkosten.mjs';
import {leseVersandtarife} from '../../../operations/lib/versandtarife.mjs';
const saetze={
  "GLS Energie": 0.1,
  "GLS Diesel Floater": 0.2,
  "GEL Diesel": 0.3,
  "GLS gültig von": "2020-01-01",
  "GLS gültig bis": "2099-12-31",
  "GEL gültig von": "2020-01-01",
  "GEL gültig bis": "2099-12-31",
  "USt Planung": 0.2,
  "GLS Nicht sorterfähig": 4,
  "GLS Überlänge": 4,
  "GLS Großpaket": 1,
  "GLS Übermaß": 1,
  "GLS Privat": 1,
  "GLS Insel": 1,
  "GLS Adressklärung": 1,
  "GLS Lagerung": 1,
  "GLS manuell": 1,
  "GLS Storno": 1,
  "GLS Guaranteed24": 1,
  "GLS Pick-Service": 1,
  "GLS Cash": 1,
  "GLS LQ": 1,
  "GLS PaketShop": -0.5,
  "GLS Finanzierung": 1,
  "GEL Maut je kg": 0.01,
  "GEL XXL": 0.1,
  "GEL XXL mindestens": 10,
  "GEL Avis technisch": 1,
  "GEL Avis Depot": 1,
  "GEL Avis Fahrer": 1,
  "GEL Region": 1,
  "GEL Metropole": 1,
  "GEL TVS je 1500 €": 2,
  "GEL verdeckter Schaden": 1,
  "GEL UNO": 1,
  "GEL DUO erster m³": 1,
  "GEL DUO weitere m³": 1,
  "GEL Colli UNO/DUO": 1,
  "GEL Multicolli": 1,
  "GEL Entsorgung erster m³": 1,
  "GEL Entsorgung weitere m³": 1,
  "GEL Overnight": 1,
  "GEL Fixtermin": 1,
  "GEL 12 Uhr": 1,
  "GEL Beschaffung/Querverkehr": 1,
  "GEL manuelle Erfassung": 1,
  "GEL Datenkorrektur": 1,
  "GEL Leerfahrt": 1,
  "GEL Wartezeit je 15 min": 1,
  "GEL Finanzierung": 1,
  "GEL ab 501 kg Standard": 1,
  "GEL ab 501 kg Palette": 1,
  "GLS Längenschwelle cm": 150,
  "GLS Großpaket Liter": 150,
  "GEL Volumen kg/m³": 100,
  "GLS Volumen Divisor": 10000
};
function basis(){
 const b=Object.fromEntries([5,6,7,8,9,10,11,12,13,14,15,16,17,...Array.from({length:33},(_,i)=>21+i)].map(i=>[i,0]));
 Object.assign(b,{5:200,6:20,7:20,8:15,9:1,10:'16515',11:'16515',12:'Ja',13:'Neuware',14:1500,15:'Rolle',16:'SEPA',17:'2026-10-22',21:'Standard',22:'Auto',23:'Kein',24:'Normal',25:'Ja',26:'Nein',27:'Nein',28:'Nein',29:'Normal',30:'Nein',31:'Nein',32:'Nein',33:'Nein',34:'Nein',41:'Nein',42:'Nein',45:'Nein',46:'Ungeklaert',47:'Ungeklaert',48:'Auto',49:'',50:'',51:'Nein',52:'Nein',53:'Nein'});
 const t={version:1,hinweise:[],felder:Object.keys(b).map(i=>({zeile:Number(i),label:'Testfeld',typ:typeof b[i]==='number'?'number':'text'})),saetze:{...saetze},gls:[[10,3],[20,7],[40,12]],gel:[[10,10,8],[20,20,16],[40,40,32],[100,60,48],[150,80,64],[500,100,80]],inseln:{plz:{'18528':'Rügen','17440':'Usedom','25946':'Amrum'},namen:['Amrum'],matrix:[[20,30],[1000,50],[1500,null]]}};
 return {b,t};
}
function rechne(change={},satz={}){const {b,t}=basis();return berechneVersand({...b,...change},t,satz);}
test('Grundfracht, Zuschlaege, Energie und Diesel werden einmal addiert',()=>{
 const x=rechne();assert.equal(x.gls.netto,15.6);assert.equal(x.gel.netto,30.1);assert.equal(x.gls.teile[23],0);assert.equal(x.gls.teile[24],4);assert.equal(x.gls.brutto,18.72);
});
test('Volumengewicht und Mehrcolli veraendern den passenden Tarif',()=>{
 const x=rechne({5:150,6:40,7:30,8:5,9:4});assert.equal(x.gls.gewicht,18);assert.equal(x.gel.gewicht,72);assert.equal(x.gel.teile[36],4);
});
test('GLS Gurtmass / Gewicht und GEL XXL-Terminkombination sperren Gesamtsumme',()=>{
 assert.equal(rechne({6:30,7:30}).gls.netto,null);
 const x=rechne({5:400,23:'Fixtermin'});assert.equal(x.gls.netto,null);assert.equal(x.gel.netto,null);assert(x.gel.gruende.some(g=>g.includes('nicht kombinierbar')));
});
test('Inselprozentsatz, gemischte PLZ und fehlende Staffel sind keine Nullpreise',()=>{
 assert(Math.abs(rechne({10:'18528',8:40,9:4,21:'DUO'}).gel.teile[32]-55)<0.00001);
 assert.equal(rechne({10:'17440'}).gel.netto,null);
 assert.equal(rechne({10:'17440',48:'Festland'}).gel.teile[32],0);
 assert.equal(rechne({10:'25946',12:'Nein',8:600,9:2,53:'Ja'}).gel.netto,null);
 assert.equal(rechne({48:'Sonstige Insel'}).gls.netto,null);
 assert.equal(rechne({48:'Sonstige Insel',49:-2,50:0}).gls,null);
});
test('Privat ab 60 kg, DUO-Avis und ungeklaerte Sonderkosten werden geprueft',()=>{
 assert.equal(rechne({8:60}).gel.netto,null);assert.equal(rechne({21:'DUO',22:'Fahrer'}).gel.netto,null);
 assert.equal(rechne({42:'Ja'}).gel.netto,null);assert.equal(rechne({23:'12 Uhr'}).gel.netto,null);
});
test('Zeitgueltigkeit und manuelle Zuschlaege werden lokal geprueft',()=>{
 assert.equal(rechne({}, {'GEL gültig bis':'2026-10-21'}).gel.netto,null);
 assert.equal(rechne({}, {'GEL Diesel':-.1}).gel,null);assert.equal(rechne({}, {'GEL Diesel':NaN}).gel,null);
 const a=rechne(),b=rechne({44:10});assert.equal(Math.round((b.gel.netto-a.gel.netto)*100),1300);
});
test('Metropole zaehlt genaue PLZ-Bereiche, beide Enden brauchen Bestaetigung',()=>{
 assert(istMetropole('10115'));assert(!istMetropole('01067'));assert(!istMetropole('21150'));
 assert.equal(rechne({10:'10115',11:'10115'}).gel.netto,null);assert.equal(rechne({10:'10115',11:'10115',47:'Zweimal'}).gel.teile[31],2);
});
test('Leere, ungueltige und negative Eingaben ergeben keine plausible Summe',()=>{
 for(const c of [{8:''},{10:'ABCDE'},{10:'1e004'},{9:1.5},{5:0},{43:-1},{17:'2026-02-30'}])assert(rechne(c).fehler,JSON.stringify(c));
 assert.equal(rechne({10:'01067'}).fehler,undefined);
});
test('Private Datei: fehlend/beschaedigt/unvollstaendig bleibt sichtbar unverfuegbar',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'versandtarife-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const datei=path.join(dir,'tarife.json');
 assert.equal(leseVersandtarife(datei).verfuegbar,false);fs.writeFileSync(datei,'{');assert.equal(leseVersandtarife(datei).verfuegbar,false);
 fs.writeFileSync(datei,JSON.stringify({version:1}));assert.equal(leseVersandtarife(datei).verfuegbar,false);
 const {t:tarif}=basis();fs.writeFileSync(datei,JSON.stringify(tarif));assert.equal(leseVersandtarife(datei).verfuegbar,true);
 delete tarif.saetze['GLS Überlänge'];assert(berechneVersand(basis().b,tarif).fehler);
});

test('Defekte benoetigte Strukturen werden vor der API-Freigabe abgelehnt',()=>{
 for(const aendern of [t=>delete t.hinweise,t=>t.hinweise=[null],t=>t.inseln.namen=null,t=>t.inseln.matrix[0]=[20],t=>t.felder[0].optionen='Ja',t=>t.saetze['GEL Diesel']=-.1]){
  const {b,t}=basis();aendern(t);assert(berechneVersand(b,t).fehler);
 }
});
test('Tarifdaten und angepasste Zeitraeume brauchen echte Kalendertage und richtige Reihenfolge',()=>{
 for(const [von,bis] of [['2026-00-00','2026-99-99'],['2026-02-30','2026-12-31'],['2026-11-01','2026-10-01']]){
  const {b,t}=basis();t.saetze['GEL gültig von']=von;t.saetze['GEL gültig bis']=bis;assert(berechneVersand(b,t).fehler);
  assert(rechne({}, {'GEL gültig von':von,'GEL gültig bis':bis}).fehler);
 }
});

test('Jede Grundpreisspalte muss endlich und nichtnegativ sein',()=>{
 for(const [table,spalte] of [['gls',1],['gel',1],['gel',2]])for(const wert of [-100,Infinity,'fehlt']){
  const {b,t}=basis();t[table][1][spalte]=wert;assert(berechneVersand(b,t).fehler);
 }
 const {b,t}=basis();t.gls[1][1]=0;assert.equal(berechneVersand(b,t).fehler,undefined);
});
