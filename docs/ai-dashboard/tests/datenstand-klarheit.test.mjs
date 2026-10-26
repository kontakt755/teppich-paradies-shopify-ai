import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const src=fs.readFileSync(new URL('../ansichten/heute.mjs',import.meta.url),'utf8');
const start=src.indexOf('function datenstandZeile('),end=src.indexOf('\n}',start);
function html(health){const c=vm.createContext({einkauf:{aktualisierung:{teile:{bestellungen:{erfolg:true,zeitpunkt:'2026-10-13'}}}},aktualisierungHealth:()=>health,
 fmtDateTime:()=> '13.10.',plural:(n,ein,mehr)=>n+' '+(n===1?ein:mehr),esc:s=>s,darfAnsicht:()=>false,aktualisierenButton:()=>''});
 vm.runInContext(src.slice(start,end+2),c);return c.datenstandZeile('laden');}
test('Unbelegter Betriebsstand wird weder als gesund noch als veraltet/Fehler dargestellt',()=>{
 const h=html([{level:'ok'},{level:'info'}]);assert.match(h,/1 Stand noch nicht belegt/);assert.ok(!h.includes('Daten aktuell'));assert.ok(!h.includes('veraltet oder mit Fehler'));assert.ok(!h.includes('heute-datenstand warn'));assert.match(h,/Bestellungen Stand 13.10./);
});
test('Belegte Störung bleibt als Warnung erkennbar, frische Quellen behalten ihren Stand',()=>{
 const h=html([{level:'warn'},{level:'info'}]);assert.match(h,/1 Datenquelle veraltet oder mit Fehler/);assert.match(h,/heute-datenstand warn/);assert.match(h,/Bestellungen Stand 13.10./);
});

test('Rueckmeldungen aus „Ideen & Fragen“ machen Heute nicht dauerhaft unbelegt (Rundgang 26.10.)',()=>{
 const h=html([{level:'ok'},{level:'info',quelle:'werkbank'}]);assert.match(h,/Daten aktuell · Bestellungen Stand 13.10./);assert.ok(!h.includes('noch nicht belegt'));
 const f=html([{level:'ok'},{level:'warn',quelle:'werkbank'}]);assert.match(f,/Daten aktuell/,'auch ein Werkbank-Fehler steht nur unter Kennzahlen');
});
