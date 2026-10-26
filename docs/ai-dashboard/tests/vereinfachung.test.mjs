import './_testumgebung.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { betriebszustand } from '../../../operations/lib/betriebszustand.mjs';
import { vorgangsLink, filtereAuftrag } from '../lib/vorgangslink.mjs';
import { musterKaufLinks, sichereMusterLinks } from '../lib/muster-kauf-links.mjs';
import { fuelleText } from '../lib/muster-nachfassen.mjs';
import { montageAus } from '../../../scripts/laden-zahlen.mjs';
const quelle = { istMuster: true, handle: 'muster-test-boden', sku: 'M-TEST-1', farbe: 'Grau' };
const produkt = { handle: 'test-boden', titel: 'Testboden', status: 'ACTIVE', onlineStoreUrl: 'https://www.teppich-paradies.net/products/test-boden', varianten: [{ id: 'gid://shopify/ProductVariant/123', sku: 'TEST-1', farbe: 'Grau', verfuegbar: true }] };
test('Vorgangssprung erhält echte IDs unverändert und begrenzt die ganze Einkaufsansicht ohne den Quellspeicher zu filtern', () => {
  const id = 'gid://shopify/Order/123'; const href = vorgangsLink('einkauf', { auftrag: id, af: 'bestellt' });
  assert.equal(new URLSearchParams(href.split('?')[1]).get('auftrag'), id);
  assert.match(href, /von=heute/);
  const d = { auftraege: [{ id }, { id: 'anders' }], gruppen: [{ positionen: [{ orderId: id }, { orderId: 'anders' }] }], musterGruppen: [] };
  assert.equal(filtereAuftrag(d, id).gruppen[0].positionen.length, 1); assert.equal(d.gruppen[0].positionen.length, 2);
  assert.equal(filtereAuftrag(d, 'nicht vorhanden').auftraege.length, 0);
});
test('Musterlinks: genaue aktive Variante, dedupliziert; archivierte, fehlende, mehrdeutige oder unbekannte Quellen fallen weg', () => {
  const r = musterKaufLinks([quelle, quelle], [produkt]); assert.equal(r.length, 1); assert.match(r[0].url, /test-boden\?variant=123$/);
  for (const p of [{ ...produkt, status: 'ARCHIVED' }, { ...produkt, status: null }, { ...produkt, varianten: [] }, { ...produkt, varianten: [...produkt.varianten, { ...produkt.varianten[0], id: '124' }] }]) assert.deepEqual(musterKaufLinks([quelle], [p]), []);
  assert.deepEqual(sichereMusterLinks([{ ...r[0], url: 'https://example.invalid/kunden?email=privat' }]), []);
});
test('Bestehender manueller Nachfasstext erhält Auswahl, aber keinen privaten Akten-/Trackinglink und sendet nichts', () => {
  const links = musterKaufLinks([quelle], [produkt]);
  const r = fuelleText({ betreff: 'Ihre Muster', text: 'Guten Tag {Anrede} {Nachname},\nWir beraten gern.\n{Name}' }, { kundenname: 'Testkunde', absender: 'Team', produkte: links });
  assert.match(r.text, /Ihr gewähltes Produkt:\n/); assert.doesNotMatch(r.text, /Böden/); assert.match(r.text, /Testboden · Grau/); assert.match(r.text, /variant=123/); assert.ok(!r.text.includes('#/kunden'));
  assert.ok(!fuelleText({ text: 'Hallo' }, { produkte: [] }).text.includes('Böden'));
});
test('v49-Laufzeiten sind optionale echte Integer; fehlend/unzulässig wird niemals 0', () => {
  assert.deepEqual(montageAus({ letzterLaufMin: 0, laufzeitHeuteSek: 15 }), { letzterLaufMin: 0, laufzeitHeuteSek: 15 });
  assert.equal(montageAus({ letzterLaufMin: -1, laufzeitHeuteSek: '15' }), null);
  assert.deepEqual(montageAus({ einsaetzeHeute: 2 }), { einsaetzeHeute: 2 });
});

test('Musterlinks benötigen eine belegte öffentliche Produktadresse und bekannte Verfügbarkeit', () => {
  for (const onlineStoreUrl of [undefined, null, '', 'https://example.invalid/products/test-boden', 'https://www.teppich-paradies.net/products/anderer-boden', 'https://privat@www.teppich-paradies.net/products/test-boden', 'https://www.teppich-paradies.net/products/test-boden?email=privat', 'https://www.teppich-paradies.net/products/test-boden#privat']) {
    assert.deepEqual(musterKaufLinks([quelle], [{ ...produkt, onlineStoreUrl }]), []);
  }
  for (const verfuegbar of [undefined, null, false, 'true', 1]) {
    assert.deepEqual(musterKaufLinks([quelle], [{ ...produkt, varianten: [{ ...produkt.varianten[0], verfuegbar }] }]), []);
  }
  const ohnePublikation = { ...produkt, shopUrl: produkt.onlineStoreUrl }; delete ohnePublikation.onlineStoreUrl;
  assert.deepEqual(musterKaufLinks([quelle], [ohnePublikation]), [], 'berechnetes shopUrl ist kein Veröffentlichungsnachweis');
});
test('Musterlinks wählen die belegte Quellvariante genau, halten Farben auseinander und begrenzen auf drei', () => {
  const varianten = [1992,1993,1994,1995].map((id, i) => ({ id:`gid://shopify/ProductVariant/${id}`, sku:`TEST-${i+1}`, farbe:['Grau','Beige','Blau','Grün'][i], verfuegbar:true }));
  const ps = varianten.map(v => ({ ...quelle, musterQuelle:{produktHandle:'test-boden',quellvariante:v.id} }));
  const r = musterKaufLinks([ps[0],ps[1],ps[0],ps[2],ps[3]], [{...produkt,varianten}]);
  assert.deepEqual(r.map(p => p.farbe), ['Grau','Beige','Blau']);
  assert.deepEqual(r.map(p => p.url.split('variant=')[1]), ['1992','1993','1994']);
  assert.deepEqual(musterKaufLinks([{...quelle,musterQuelle:{produktHandle:'test-boden',quellvariante:'9999'}}], [{...produkt,varianten}]), []);
});
test('Werkbank: eine frische lokale Rückmeldung beweist weder Vollabgleich noch automatische Schreibrechte', t => {
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'tp-health-quellgrenze-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
  const jetzt=new Date('2026-10-13T10:00:00Z'), f=path.join(d,'fehlermeldungen-abgleich.json');
  const leer=betriebszustand(d,{jetzt});assert.equal(leer.werkbank.status,'unbekannt');assert.equal(leer.werkbank.letzteLokaleRueckmeldung,null);
  fs.writeFileSync(f,JSON.stringify({aktualisiertAm:'2026-10-13T09:00:00Z',stand:{'F-TEST':{status:'uebernommen',werkbankId:'F-TEST'}},sensibleInhalte:'nur erfunden'}));
  const r=betriebszustand(d,{jetzt});assert.equal(r.werkbank.status,'unbekannt');assert.equal(r.werkbank.lokalerStatus,'ok');assert.equal(r.werkbank.vollabgleich,'unbekannt');
  assert.equal(r.werkbank.letzteLokaleRueckmeldung,'2026-10-13T09:00:00.000Z');assert.equal(r.werkbank.letzterErfolg,undefined);
  assert.ok(!JSON.stringify(r).includes('sensibleInhalte'));
  fs.writeFileSync(f,'{kaputt');assert.equal(betriebszustand(d,{jetzt}).werkbank.status,'fehler');
  fs.writeFileSync(f,JSON.stringify({aktualisiertAm:'2099-01-01T00:00:00Z'}));assert.equal(betriebszustand(d,{jetzt}).werkbank.letzteLokaleRueckmeldung,null);
});
test('Health-Oberfläche beschreibt Werkbank neutral und lässt belegten Sicherungserfolg unverändert', () => {
  const source=fs.readFileSync(new URL('../bausteine/aktualisierung.mjs',import.meta.url),'utf8');
  const a=source.indexOf('export function aktualisierungHealth()'),b=source.indexOf('\n}\n',a);
  const fn=source.slice(a,b+2).replace('export ','');
  const ctx={einkauf:{aktualisierung:{verfuegbar:true,manuellVerfuegbar:true,teile:{},betrieb:{
    sicherung:{status:'ok',letzterErfolg:'2026-10-13T08:00:00Z'},
    werkbank:{status:'unbekannt',letzteLokaleRueckmeldung:'2026-10-13T09:00:00Z',lokalerStatus:'ok',vollabgleich:'unbekannt'}
  }}},fmtDateTime:s=>s};
  const rows=vm.runInNewContext(fn+';aktualisierungHealth()',ctx);
  assert.equal(rows[0].level,'ok');assert.match(rows[0].title,/letzter Erfolg/);
  assert.equal(rows[1].level,'info');assert.match(rows[1].title,/letzte lokale Rückmeldung/);assert.doesNotMatch(rows[1].title,/Erfolg/);assert.match(rows[1].detail,/noch nicht belegt/);
  ctx.einkauf.aktualisierung.betrieb.werkbank={status:'fehler',letzteLokaleRueckmeldung:null,lokalerStatus:'fehler',vollabgleich:'unbekannt'};
  const kaputt=vm.runInNewContext(fn+';aktualisierungHealth()',ctx);assert.equal(kaputt[1].level,'warn');assert.match(kaputt[1].title,/nicht lesbar/);
});
test('Systemzustand: automatische Dashboard-Updates melden sich nur, wenn sie haken', () => {
  const source=fs.readFileSync(new URL('../bausteine/aktualisierung.mjs',import.meta.url),'utf8');
  const a=source.indexOf('export function aktualisierungHealth()'),b=source.indexOf('\n}\n',a);
  const fn=source.slice(a,b+2).replace('export ','');
  const zeile=s=>vm.runInNewContext(fn+';aktualisierungHealth()',{einkauf:{aktualisierung:{verfuegbar:true,manuellVerfuegbar:true,teile:{},betrieb:{nachziehen:s}}},fmtDateTime:x=>x})[0];
  const ok=zeile({status:'ok',zuletztNachgezogen:'2026-10-26T10:00:00Z'});assert.equal(ok.level,'ok');assert.match(ok.title,/aktuell · zuletzt übernommen 2026-10-26T10:00:00Z/);
  const haengt=zeile({status:'fehler',art:'konflikt',grund:'Neue Version passt nicht (Konflikt in docs/ai-dashboard/app.js)'});
  assert.equal(haengt.level,'warn');assert.equal(haengt.title,'Dashboard-Update hängt: die neue Version passt nicht zum laufenden Stand');assert.match(haengt.detail,/bisherigen Stand weiter/);
  assert.doesNotMatch(haengt.title+haengt.detail,/docs\/|dashboard:test|git /,'keine Pfade, Befehle oder Fehlertexte in der Ansicht');
  assert.match(zeile({status:'fehler',art:'neu-und-unbekannt'}).title,/unerwarteter Fehler$/);
  assert.equal(zeile({status:'alt',zuletztGeprueft:'2026-10-26T07:00:00Z'}).level,'warn');
  assert.match(zeile({status:'wartet',wartetSeit:'x',grund:'Eingabe im Dashboard vor 30 s (muster-packen.json)'}).detail,/nächste Versuch kommt von selbst/);
  assert.doesNotMatch(zeile({status:'wartet',wartetSeit:'x',grund:'Eingabe (muster-packen.json)'}).detail,/\.json/);
  assert.equal(zeile({status:'unbekannt'}),undefined,'nie eingerichtet: keine Zeile, auch kein „noch nicht belegt“ auf Heute');
});

test('Unlesbare optionale Kaufquellen brechen den vorhandenen Bestellablauf nicht', () => {
  assert.deepEqual(musterKaufLinks([quelle], null), []);
  assert.deepEqual(musterKaufLinks(null, [produkt]), []);
  assert.deepEqual(musterKaufLinks([quelle], [null,{...produkt,varianten:{}}]), []);
  assert.equal(musterKaufLinks([quelle], [null,{...produkt,varianten:[null,produkt.varianten[0]]}]).length,1);
});
