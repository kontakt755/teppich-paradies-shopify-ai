import { esc } from '../../kern/helfer.mjs';
import { state } from '../../kern/zustand.mjs';
import { fetchEinkauf } from '../../kern/api.mjs';
import { render } from '../../kern/render.mjs';
import { berechneVersand, BETRAGSZEILEN } from '../../lib/versandkosten.mjs';

let tarif=null,hinweis='',laden=false,generation=0;
let werte={},saetze={};
export function verwirfVersandtarif(){generation++;tarif=null;hinweis='';laden=false;}
const geld=v=>v===null?'Nicht berechenbar':new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(v);
const heute=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function verwerfeVersandkosten(){generation++;tarif=null;hinweis='';laden=false;werte={};saetze={};}
if(typeof window!=='undefined')window.addEventListener('tp-sitzung-beendet',verwerfeVersandkosten);
async function lade(){
  if(laden)return;laden=true;const token=generation;
  const daten=await fetchEinkauf('/api/einkauf/versandtarife');
  if(token!==generation)return;
  laden=false;tarif=daten?.verfuegbar?daten.tarif:null;hinweis=daten?.hinweis||'Versandtarife nicht verfügbar.';
  if(tarif&&!Object.keys(werte).length){werte=Object.fromEntries(tarif.felder.map(f=>[f.zeile,f.wert??'']));werte[17]=heute();}
  if(state.route.view==='einkauf'&&state.route.params.get('tab')==='versandkosten')render();
}
function feld(f){
  const id='vk-'+f.zeile,value=werte[f.zeile]??'';
  const select=f.optionen?`<select id="${id}" data-vk-feld="${f.zeile}" data-focus-erhalten>${f.optionen.map(o=>`<option${o===value?' selected':''}>${esc(o)}</option>`).join('')}</select>`:null;
  const attr=f.typ==='number'?'inputmode="decimal" min="0" step="any"':f.zeile===10||f.zeile===11?'inputmode="numeric" maxlength="5" pattern="[0-9]{5}"':'';
  return `<div class="field"><label for="${id}">${esc(f.label)}</label>${select||`<input id="${id}" type="${f.typ==='date'?'date':f.typ==='number'?'number':'text'}" value="${esc(value)}" ${attr} data-vk-feld="${f.zeile}" data-focus-erhalten>`}<span class="small muted">${esc(f.hinweis||'')}</span></div>`;
}
function ergebnis(){
  const result=berechneVersand(werte,tarif,saetze);
  if(result.fehler)return `<div class="notice warn" role="status">${esc(result.fehler)}</div>`;
  const karte=(name,v)=>`<section class="card vk-ergebnis"><h3>${name}</h3><p class="vk-preis">${geld(v.netto)}</p>${v.netto===null?`<ul class="vk-gruende">${v.gruende.map(g=>`<li>${esc(g)}</li>`).join('')}</ul>`:`<p class="small muted">netto · ${geld(v.brutto)} Brutto-Planung</p>`}<p class="small">Abrechnungsgewicht: ${esc(v.gewicht.toLocaleString('de-DE',{maximumFractionDigits:2}))} kg${name==='GLS'?' je Paket':''}</p></section>`;
  const rows=Object.keys(BETRAGSZEILEN).filter(k=>result.gls.teile[k]||result.gel.teile[k]);
  return `<div class="vk-vergleich" aria-live="polite">${karte('GLS',result.gls)}${karte('GEL',result.gel)}</div>
    <p class="small muted">${esc(result.gebiet)} · GEL: ${result.xxl?'XXL':'Standard'} · Avis: ${esc(result.avis)}</p>
    ${result.hinweise.length?`<div class="notice warn"><ul>${result.hinweise.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}
    <details class="card"><summary>Kosten aufschlüsseln</summary><p class="small muted">Bei „Nicht berechenbar“ sind die Detailwerte unvollständig und keine Gesamtkosten.</p><div class="table-wrap"><table><thead><tr><th>Kostenbestandteil</th><th>GLS netto</th><th>GEL netto</th></tr></thead><tbody>${rows.map(k=>`<tr><td>${esc(BETRAGSZEILEN[k])}</td><td>${geld(result.gls.teile[k])}</td><td>${geld(result.gel.teile[k])}</td></tr>`).join('')}</tbody></table></div></details>`;
}
function tarifstand(){
  const keys=['GLS Energie','GLS Diesel Floater','GEL Diesel','GLS gültig von','GLS gültig bis','GEL gültig von','GEL gültig bis'];
  return `<details class="card"><summary>Tarifstand und Dieselwerte</summary><p><button class="btn btn-sm" data-vk-neu-laden>Gespeicherte Tarife neu laden</button></p><p class="small muted">Vertragsbasis ${esc(tarif.stand)}. Änderungen gelten nur für diesen Vergleich auf diesem Gerät. Diesel und Gültigkeitszeitraum gemeinsam aktualisieren.</p><div class="vk-felder">${keys.map(key=>{const date=key.includes('gültig'),value=saetze[key]??tarif.saetze[key];return `<div class="field"><label for="vk-satz-${keys.indexOf(key)}">${esc(key)}${date?'':' (%)'}</label><input id="vk-satz-${keys.indexOf(key)}" type="${date?'date':'number'}" value="${esc(date?value:Math.round(value*100000)/1000)}" ${date?'':'min="0" max="100" step="0.1"'} data-vk-satz="${esc(key)}" data-focus-erhalten></div>`;}).join('')}</div></details>`;
}
export function viewVersandkosten(){
  if(!tarif){if(!hinweis&&!laden)void lade();return `<section class="card"><h2>Versandkosten vergleichen</h2><p role="status">${esc(laden?'Private Versandtarife werden geladen …':hinweis)}</p>${!laden?'<button class="btn" data-vk-neu-laden>Erneut laden</button>':''}</section>`;}
  return `<section class="card"><h2>Versandkosten vergleichen</h2><p>Verpackte Maße, Gewicht und Ziel eingeben. GLS und GEL werden direkt gegenübergestellt.</p><div class="vk-felder">${tarif.felder.filter(f=>f.zeile<21).map(feld).join('')}</div><p class="small muted">Anzahl gilt für identische Packstücke. Für Rollen: Durchmesser als Breite und Höhe eingeben.</p></section>
    <section id="vk-ergebnisse">${ergebnis()}</section>
    <details class="card"><summary>Zusatzleistungen und Sonderfälle</summary><div class="vk-felder">${tarif.felder.filter(f=>f.zeile>=21).map(feld).join('')}</div></details>
    ${tarifstand()}<details class="card"><summary>Grundlagen und offene Tarifangaben</summary><p class="small muted">Interne Kostenplanung. Brutto pauschal mit Umsatzsteuer; Versicherungsbestandteile gegen die Rechnung prüfen.</p><dl class="vk-hinweise">${tarif.hinweise.map(([titel,text])=>`<dt>${esc(titel)}</dt><dd>${esc(text)}</dd>`).join('')}</dl></details>`;
}
export function versandkostenEingabe(e){
  const el=e.target.closest?.('[data-vk-feld],[data-vk-satz]');if(!el)return false;
  if(el.dataset.vkFeld)werte[el.dataset.vkFeld]=el.value;
  else{const key=el.dataset.vkSatz;saetze[key]=key.includes('gültig')?el.value:el.value===''?NaN:Number(el.value)/100;}
  const ziel=document.getElementById('vk-ergebnisse');if(ziel&&tarif)ziel.innerHTML=ergebnis();return true;
}
export function versandkostenKlick(e){
  if(!e.target.closest?.('[data-vk-neu-laden]'))return false;
  tarif=null;hinweis='';saetze={};void lade();render();return true;
}
