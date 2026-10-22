/** Kettler, Packstueck und echter Versandschein bleiben getrennte Nachweise. */
import { $, esc, toast } from '../../kern/helfer.mjs';
import { fetchEinkauf, orgSchreiben } from '../../kern/api.mjs';
import { istNurLesend } from '../../kern/sitzung.mjs';
const geld=n=>Number.isFinite(n)?new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(n):'Nicht berechenbar';
export async function oeffneKettelversand(orderId) {
  let d;
  try {d=await fetchEinkauf('/api/einkauf/kettelversand?orderId='+encodeURIComponent(orderId));} catch(e){toast(e.message,'crit');return;}
  if(!d?.verfuegbar){toast(d?.hinweis||'Kettelauftrag nicht verfügbar.','warn');return;}
  const lesend=istNurLesend();
  const stage=p=>`<section class="card"><h3>${esc(p.titel)} · ${esc(p.farbe||'')}</h3><p class="small">${(p.ausfuehrung||[]).map(esc).join(' · ')}</p>${['angekommen','fertig'].map((s,i)=>`<p><b>${i?'Ketteln fertig':'Im Teppichstudio angekommen'}:</b> ${p.stand[s]?`${esc(new Date(p.stand[s].am).toLocaleString('de-DE'))} · ${esc(p.stand[s].beleg)}`:lesend?'Offen':`<button class="btn btn-sm" type="button" data-ks-stufe="${s}" data-ks-id="${esc(p.id)}"${i&&!p.stand.angekommen?' disabled':''}>Bestätigen</button>`}</p>`).join('')}</section>`;
  const pack=p=>`<section class="card"><h3>Packstück · ${p.positionen.length} Teppich(e)</h3><p>${esc(p.laenge)} × ${esc(p.breite)} × ${esc(p.hoehe)} cm · ${esc(p.gewicht)} kg brutto${p.zusammenGerollt?' · gemeinsam gerollt':''}</p><p>GLS: ${geld(p.vergleich.gls?.netto)} · GEL: ${geld(p.vergleich.gel?.netto)} netto</p><p><b>${p.vergleich.empfehlung?'Vorschlag: '+esc(p.vergleich.empfehlung):'Versanddienst noch zu klären'}</b></p>${p.vergleich.fehler?`<p class="small">${esc(p.vergleich.fehler)}</p>`:''}${['GLS','GEL'].map(n=>{const v=p.vergleich[n.toLowerCase()];return v?.gruende?.length?`<p class="small">${n}: ${v.gruende.map(esc).join(' · ')}</p>`:'';}).join('')}${(p.vergleich.hinweise||[]).map(h=>`<p class="small">${esc(h)}</p>`).join('')}${p.schein?`<p><b>${esc(p.schein.dienst)}-Schein erstellt:</b> ${esc(p.schein.nummer)}</p><p class="small">Noch kein Nachweis der Abholung. „An Kunden raus“ erst bei tatsächlicher Übergabe buchen.</p>`:`${lesend?'':`<div class="actions">${['GLS','GEL'].filter(n=>Number.isFinite(p.vergleich[n.toLowerCase()]?.netto)).map(n=>d.portale[n]?`<a class="btn" href="${esc(d.portale[n])}" target="_blank" rel="noopener noreferrer">${n}-Schein im Portal erstellen</a>`:`<span class="small">${n}: Portalzugang noch nicht hinterlegt</span>`).join('')}</div><button type="button" class="btn" data-ks-schein="${esc(p.id)}">Erstellten Schein hinterlegen</button><button type="button" class="btn" data-ks-entfernen="${esc(p.id)}">Packstück neu planen</button>`}`}<p class="small">${p.positionen.map(id=>esc(d.positionen.find(x=>x.id===id)?.farbe||id)).join(' · ')}</p></section>`;
  const verplant=new Set(d.pakete.flatMap(p=>p.positionen));
  const offen=d.positionen.filter(p=>p.stand.fertig&&!verplant.has(p.id));
  const heute=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  $('#dialogRoot').innerHTML=`<div class="dialog-backdrop" data-close-dialog><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="ksTitel" data-dialog><h2 id="ksTitel">Kettler & Versand · ${esc(d.name)}</h2><p>Angekommen → Ketteln fertig → Packstück messen → GLS/GEL-Schein → an Versanddienst übergeben.</p>${d.positionen.map(stage).join('')||'<p>Keine gekettelten Warenpositionen.</p>'}${d.pakete.map(pack).join('')}${!lesend&&offen.length?`<form id="ksPack"><h3>Neues Packstück</h3><fieldset><legend>Welche Teppiche sind darin?</legend>${offen.map(p=>`<label style="display:block"><input name="positionen" type="checkbox" value="${esc(p.id)}"> ${esc(p.titel)} · ${esc(p.farbe)}</label>`).join('')}</fieldset><p class="small">Zwei Teppiche nur zusammenrollen, wenn Material und Einfassung dies schadlos zulassen. Gemeinsamen Rollendurchmesser und Gesamtgewicht einschließlich Verpackung messen. Keine automatische Durchmesser- oder Gewichtsschätzung.</p><div class="vs-sendung">${[['laenge','Länge (cm)'],['breite','Breite / Durchmesser (cm)'],['hoehe','Höhe / Durchmesser (cm)'],['gewicht','Bruttogewicht (kg)'],['warenwert','Warenwert im Packstück (€)']].map(([k,t])=>`<div class="field"><label for="ks-${k}">${t}</label><input id="ks-${k}" name="${k}" type="number" min="${k==='warenwert'?0:0.01}" step="any" required></div>`).join('')}<div class="field"><label for="ksDatum">Versanddatum</label><input id="ksDatum" name="datum" type="date" value="${heute}" required></div></div><p><label><input name="gemessen" type="checkbox" required> Fertiges Packstück gemessen und gewogen</label></p><p><label><input name="zusammen" type="checkbox"> Bei mehreren Teppichen: gemeinsam gerollt und sicher verpackt bestätigt</label></p><button class="btn btn-primary" type="submit">Packstück speichern und GLS/GEL vergleichen</button></form>`:''}<p><a class="btn" href="#/einkauf?tab=versandkosten">Vollständigen Versandkostenrechner öffnen</a></p><p class="small">Diese Schritte buchen keinen Versand in Shopify. Eine Paketmarke ist noch keine Abholung.</p><button type="button" class="btn" data-close-dialog>Schließen</button></div></div>`;
  const root=$('#dialogRoot');root.querySelector('[data-close-dialog].btn')?.focus();
  const speichern=async payload=>{
    try {await orgSchreiben('/api/einkauf/auftragsstatus',{aktion:'kettelversand',orderId,revision:d.revision,...payload});await oeffneKettelversand(orderId);} catch(e){toast(e.message,'crit');}
  };
  root.querySelectorAll('[data-ks-stufe]').forEach(b=>b.addEventListener('click',async()=>{
    const beleg=window.prompt(b.dataset.ksStufe==='fertig'?'Bestätigung des Kettlers (z. B. Telefonat mit Name, Datum oder Mail-ID):':'Empfangsbeleg / Lieferscheinnummer und Empfangsdatum:');
    if(!beleg?.trim())return;b.disabled=true;await speichern({kettelAktion:b.dataset.ksStufe,lineItemId:b.dataset.ksId,beleg});
  }));
  root.querySelector('#ksPack')?.addEventListener('submit',async e=>{
    e.preventDefault();const f=new FormData(e.currentTarget);const paket={positionen:f.getAll('positionen'),gemessen:f.has('gemessen'),zusammenGerollt:f.has('zusammen'),datum:f.get('datum')};
    for(const k of ['laenge','breite','hoehe','gewicht','warenwert'])paket[k]=Number(f.get(k));
    e.currentTarget.querySelector('[type=submit]').disabled=true;await speichern({kettelAktion:'paket',paket});
    root.querySelector('[type=submit]')?.removeAttribute('disabled');
  });
  root.querySelectorAll('[data-ks-entfernen]').forEach(b=>b.addEventListener('click',()=>speichern({kettelAktion:'paketEntfernen',paketId:b.dataset.ksEntfernen})));
  root.querySelectorAll('[data-ks-schein]').forEach(b=>b.addEventListener('click',async()=>{
    const dienst=window.prompt('Tatsächlich erstellter Versandschein: GLS oder GEL?')?.trim().toUpperCase();if(!dienst)return;
    const nummer=window.prompt('Sendungsnummer vom erstellten Versandschein:');if(!nummer?.trim())return;
    b.disabled=true;await speichern({kettelAktion:'schein',paketId:b.dataset.ksSchein,dienst,nummer});b.disabled=false;
  }));
}
