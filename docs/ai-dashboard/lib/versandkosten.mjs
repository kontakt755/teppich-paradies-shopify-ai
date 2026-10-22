/** Interner Kostenvergleich. Vertragssaetze kommen ausschliesslich aus privater Konfiguration. */
export const BETRAGSZEILEN = {
  22: 'Grundfracht', 23: 'Nicht sorterfähig', 24: 'Überlänge', 25: 'Großpaket', 26: 'XXL',
  27: 'Privatadresse', 28: 'Avis', 29: 'Maut', 30: 'Gebietszuschlag', 31: 'Metropole', 32: 'Insel',
  33: 'Transportversicherung', 34: 'Verdeckter Schaden', 35: 'UNO / DUO', 36: 'Colli-Zuschläge',
  37: 'Verpackungsentsorgung', 38: 'Terminservice', 39: 'Beschaffung / Querverkehr',
  40: 'Abholservice', 41: 'Nachnahme', 42: 'LQ', 43: 'PaketShop-Rabatt', 44: 'Manuelle Erfassung',
  45: 'Adress-/Datenkorrektur', 46: 'Wartezeit', 47: 'Leerfahrt', 48: 'Einlagerung',
  49: 'Abholstorno', 50: 'Retoure', 51: 'Bestätigte Extras', 53: 'Energie', 54: 'Diesel', 55: 'Finanzierung',
};
const rund = x => Math.round((x + Number.EPSILON) * 100) / 100;
const sum = a => a.reduce((v, n) => v + n, 0);
const istDatum=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export function istMetropole(plz) {
  const n = Number(plz);
  return [[10115,14199],[20095,21149],[22041,22769],[50667,51149],[80331,81929]].some(([a,b])=>n>=a&&n<=b);
}
export function pruefeVersandtarif(t) {
  if (!t || t.version !== 1 || !Array.isArray(t.felder) || !t.saetze || !Array.isArray(t.gls) || !Array.isArray(t.gel) || !t.inseln || !Array.isArray(t.hinweise)) throw new Error('Tarifdatei unvollständig.');
  if(t.hinweise.some(zeile=>!Array.isArray(zeile)||zeile.length!==2||zeile.some(v=>typeof v!=='string')))throw new Error('Tarifhinweise ungültig.');
  if(t.felder.some(f=>!f||!Number.isInteger(f.zeile)||typeof f.label!=='string'||!['number','date','text'].includes(f.typ)||(f.optionen&&(!Array.isArray(f.optionen)||!f.optionen.length||f.optionen.some(v=>typeof v!=='string')))))throw new Error('Eingabefelder ungültig.');
  for (const r of [5,6,7,8,9,10,11,12,13,14,15,16,17,...Array.from({length:33},(_,i)=>i+21)]) {
    if (!t.felder.some(f=>f.zeile===r)) throw new Error('Eingabefelder unvollständig.');
  }
  for (const [key,v] of Object.entries(t.saetze)) {
    if (key.includes('gültig')) { if (!istDatum(v)) throw new Error('Tarifdatum ungültig.'); }
    else if (!Number.isFinite(v)||(v<0&&key!=='GLS PaketShop')) throw new Error('Tarifsatz ungültig.');
  }
  for(const name of ['GLS','GEL'])if(!istDatum(t.saetze[name+' gültig von'])||!istDatum(t.saetze[name+' gültig bis'])||t.saetze[name+' gültig von']>t.saetze[name+' gültig bis'])throw new Error('Tarifzeitraum ungültig.');
  for(const key of ['GLS Energie','GLS Diesel Floater','GEL Diesel'])if(!Number.isFinite(t.saetze[key])||t.saetze[key]<0||t.saetze[key]>1)throw new Error('Dieselsatz ungültig.');
  for (const [table,spalten] of [[t.gls,2],[t.gel,3]]) {
    if(!table.length||table.some((row,i)=>!Array.isArray(row)||row.length!==spalten||!Number.isFinite(row[0])||row[0]<=0||(i&&row[0]<=table[i-1][0])||row.slice(1).some((v,j)=>!(spalten===3&&j===1&&v===null)&&(!Number.isFinite(v)||v<0))))throw new Error('Gewichtstabelle ungültig.');
  }
  const ins=t.inseln;
  if(!ins.plz||typeof ins.plz!=='object'||!Array.isArray(ins.namen)||!ins.namen.length||ins.namen.some(v=>typeof v!=='string')||!Array.isArray(ins.matrix)||!ins.matrix.length)throw new Error('Inselverzeichnis unvollständig.');
  if(Object.entries(ins.plz).some(([plz,gebiet])=>!/^\d{5}$/.test(plz)||typeof gebiet!=='string'||![...ins.namen,'Rügen','Fehmarn','Usedom'].includes(gebiet)))throw new Error('Insel-PLZ ungültig.');
  if(ins.matrix.some((row,i)=>!Array.isArray(row)||row.length!==ins.namen.length+1||!Number.isFinite(row[0])||(i&&row[0]<=ins.matrix[i-1][0])||row.slice(1).some(v=>v!==null&&(!Number.isFinite(v)||v<0))))throw new Error('Inselmatrix ungültig.');
  return t;
}

export function berechneVersand(eingabe, tarif, anpassung = {}) {
  const fehler = text => ({ fehler: text, gls: null, gel: null });
  try { pruefeVersandtarif(tarif); } catch { return fehler('Die privaten Versandtarife fehlen oder sind beschädigt.'); }
  for(const [key,value] of Object.entries(anpassung)) {
    if(!['GLS Energie','GLS Diesel Floater','GEL Diesel','GLS gültig von','GLS gültig bis','GEL gültig von','GEL gültig bis'].includes(key))return fehler('Unbekannte Tarifanpassung.');
    if(!key.includes('gültig')&&(!Number.isFinite(value)||value<0||value>1))return fehler('Energie-/Dieselwerte bitte zwischen 0 und 100 % eingeben.');
  }
  const b = r => eingabe[r], n = r => b(r)===''||b(r)===null||b(r)===undefined ? NaN : Number(String(b(r)).replace(',','.'));
  const ja = r => b(r)==='Ja';
  const r = key => {
    const value = Object.hasOwn(anpassung,key) ? anpassung[key] : tarif.saetze[key];
    if (key.includes('gültig')) { if (!istDatum(value)) throw new Error('Zeitraum fehlt'); return value; }
    if (!Number.isFinite(value)) throw new Error('Tarifsatz fehlt'); return value;
  };
  const [l,w,h,kg,anz,wert] = [5,6,7,8,9,14].map(n);
  if (![l,w,h,kg,anz,wert].every(Number.isFinite)||Math.min(l,w,h,kg,anz)<=0||wert<0||anz!==Math.floor(anz)||anz>100||l<w||w<h) return fehler('Bitte verpackte Maße, Gewicht, Anzahl und Warenwert prüfen. Länge ≥ Breite ≥ Höhe.');
  if (![10,11].every(i=>/^\d{5}$/.test(String(b(i)))&&Number(b(i))>=1000)) return fehler('Ziel- und Abhol-PLZ bitte fünfstellig eingeben.');
  const datum=String(b(17)||'');
  if (!istDatum(datum)) return fehler('Bitte ein gültiges Versanddatum eingeben.');
  for (const feld of tarif.felder) {
    if (feld.optionen && !feld.optionen.includes(b(feld.zeile))) return fehler('Bitte die Auswahl bei „'+feld.label+'“ prüfen.');
    if (feld.typ==='number' && feld.zeile>=35 && ![49,50].includes(feld.zeile) && (!Number.isFinite(n(feld.zeile))||n(feld.zeile)<0)) return fehler('Bitte „'+feld.label+'“ als nichtnegative Zahl eingeben.');
  }
  for (const i of [35,36,38,39,40]) if (n(i)!==Math.floor(n(i))) return fehler('Anzahlen bitte als ganze Zahlen eingeben.');
  for(const i of [49,50]) if(b(i)!==''&&b(i)!==null&&b(i)!==undefined&&(!Number.isFinite(n(i))||n(i)<0))return fehler('Bestätigte Inselpreise bitte als nichtnegative Zahl eingeben.');
  try {
    for(const name of ['GLS','GEL'])if(r(name+' gültig von')>r(name+' gültig bis'))return fehler('Der Tarifzeitraum endet vor seinem Beginn.');
    const liter=l*w*h/1000, m3=liter*anz/1000;
    const gebiet=b(48)!=='Auto'?b(48):(tarif.inseln.plz[String(b(10))]||'Festland');
    const glsGewicht=kg<=30?Math.max(kg,Math.min(30,l*w*h/r('GLS Volumen Divisor'))):kg;
    const gelGewicht=Math.max(kg*anz,m3*r('GEL Volumen kg/m³'),b(15)==='Palette'&&gebiet!=='Festland'?167:0);
    const palette=b(15)==='Palette';
    const xxl=palette ? h>225||w>120||(w<=80?l>225:l>205) : l>320||w>120||h>225||l*w>20000;
    const avis=b(22)!=='Auto'?b(22):b(21)!=='Standard'||(ja(12)&&xxl)?'Depot':ja(12)&&['Overnight','Fixtermin'].includes(b(23))?'Fahrer':ja(12)?'Technisch':'Kein';
    const g={},e={},gr=[],er=[],hinweise=[];
    for (const key of Object.keys(BETRAGSZEILEN)) { g[key]=0;e[key]=0; }
    const stufe=(table,gewicht,col=1)=>table.find(row=>row[0]>=gewicht)?.[col];
    const grundG=glsGewicht>40?0:stufe(tarif.gls,glsGewicht)*anz;
    const grundE=gelGewicht>500 ? tarif.gel.at(-1)[palette?2:1]+(gelGewicht-500)*r(palette?'GEL ab 501 kg Palette':'GEL ab 501 kg Standard') : stufe(tarif.gel,palette?Math.max(101,gelGewicht):gelGewicht,palette?2:1);
    if (![grundG,grundE].every(Number.isFinite)) return fehler('Für dieses Gewicht fehlt ein Grundtarif.');
    g[22]=grundG;e[22]=grundE;
    g[23]=b(15)==='Rolle'&&l<=r('GLS Längenschwelle cm')?r('GLS Nicht sorterfähig')*anz:0;
    g[24]=l>r('GLS Längenschwelle cm')?r('GLS Überlänge')*anz:0;
    g[25]=liter>r('GLS Großpaket Liter')?r('GLS Großpaket')*anz:0;
    e[26]=xxl?Math.max(grundE*r('GEL XXL'),r('GEL XXL mindestens')):0;
    g[27]=ja(12)&&!ja(32)?r('GLS Privat')*anz:0;
    e[28]=avis==='Kein'?0:r('GEL Avis '+({Technisch:'technisch',Depot:'Depot',Fahrer:'Fahrer'}[avis]));
    e[29]=gelGewicht*r('GEL Maut je kg');
    e[30]=/^(17|18|19)/.test(b(10))?r('GEL Region'):0;
    const metroZ=Number(istMetropole(b(10))),metroA=Number(istMetropole(b(11)));
    e[31]=(b(47)==='Zweimal'?metroZ+metroA:Math.max(metroZ,metroA))*r('GEL Metropole');
    if (gebiet!=='Festland') {
      g[32]=(gebiet==='Sonstige Insel'?(Number.isFinite(n(50))?n(50):0):r('GLS Insel'))*anz;
      if (['Rügen','Fehmarn','Usedom'].includes(gebiet)) e[32]=Math.max(55,grundE*.55);
      else if (gebiet==='Sonstige Insel') e[32]=Number.isFinite(n(49))?n(49):0;
      else {
        const index=tarif.inseln.namen.indexOf(gebiet),row=tarif.inseln.matrix.find(row=>row[0]>=gelGewicht);
        const preis=index<0?null:row?.[index+1];
        if (!Number.isFinite(preis)) er.push('Für dieses Inselgewicht fehlt ein Preis.'); else e[32]=preis;
      }
    }
    e[33]=ja(25)||b(21)!=='Standard'?Math.ceil(Math.max(1,wert)/1500)*r('GEL TVS je 1500 €'):0;
    e[34]=ja(26)?r('GEL verdeckter Schaden'):0;
    e[35]=b(21)==='UNO'?r('GEL UNO'):b(21)==='DUO'?r('GEL DUO erster m³')+Math.max(0,Math.ceil(m3)-1)*r('GEL DUO weitere m³'):0;
    e[36]=(anz>3?anz*r('GEL Multicolli'):0)+(b(21)!=='Standard'?(anz-1)*r('GEL Colli UNO/DUO'):0);
    e[37]=ja(27)?r('GEL Entsorgung erster m³')+Math.max(0,Math.ceil(m3)-1)*r('GEL Entsorgung weitere m³'):0;
    e[38]=b(23)==='Overnight'?r('GEL Overnight'):b(23)==='Fixtermin'?r('GEL Fixtermin'):b(23)==='12 Uhr'?r('GEL 12 Uhr')+(b(46)==='Mit Overnight'?r('GEL Overnight'):0):0;
    g[38]=ja(28)?r('GLS Guaranteed24')*anz:0;
    e[39]=b(24)!=='Normal'?grundE*r('GEL Beschaffung/Querverkehr'):0;
    g[40]=b(29)!=='Normal'?r('GLS Pick-Service')*anz:0;
    for (const [row,field,key] of [[41,30,'GLS Cash'],[42,31,'GLS LQ'],[43,32,'GLS PaketShop'],[44,33,'GLS manuell']])g[row]=ja(field)?r(key)*anz:0;
    e[44]=ja(34)?r('GEL manuelle Erfassung'):0;
    g[45]=n(35)*r('GLS Adressklärung');e[45]=n(36)*r('GEL Datenkorrektur');
    e[46]=Math.ceil(Math.max(0,n(37)-15)/15)*r('GEL Wartezeit je 15 min');e[47]=n(38)*r('GEL Leerfahrt');g[48]=n(39)*r('GLS Lagerung');g[49]=n(40)*r('GLS Storno');
    g[50]=ja(41)?sum(Object.entries(g).filter(([k])=>Number(k)>=22&&Number(k)<=43).map(([,v])=>v)):0;
    g[51]=n(43);e[51]=n(44);
    const problem=(liste,cond,text)=>{if(cond)liste.push(text);};
    problem(gr,l>200||w>80||h>60||l+2*w+2*h>300||kg>40,'GLS-Maß-/Gewichtsgrenze überschritten.');
    problem(gr,palette,'Palette: kein GLS-Pakettarif.');problem(gr,wert/anz>5000,'Warenwert über 5.000 € je Paket.');
    problem(gr,datum<r('GLS gültig von')||datum>r('GLS gültig bis'),'GLS-Dieselwert passt nicht zum Versanddatum.');
    problem(gr,gebiet==='Sonstige Insel'&&!Number.isFinite(n(50)),'Bestätigter GLS-Inselpreis fehlt.');
    problem(gr,ja(28)&&gebiet!=='Festland','Guaranteed24 auf Inseln ausgeschlossen.');
    problem(er,l>610||w>120||h>225||kg>(palette?1000:ja(12)?100:1000)||kg*anz>2500,'GEL-Maß-/Gewichtsgrenze überschritten.');
    problem(er,xxl&&gebiet!=='Festland','XXL: Inselbeförderung ausgeschlossen.');problem(er,xxl&&b(23)!=='Kein','XXL und Terminservice nicht kombinierbar.');
    problem(er,ja(12)&&kg>=60&&!palette&&b(21)!=='DUO','Privat ab 60 kg: DUO klären / wählen.');
    problem(er,b(21)==='UNO'&&(kg>35||anz>10),'UNO: maximal 35 kg und 10 Colli.');
    problem(er,b(21)==='DUO'&&(kg>100||liter/1000>4),'DUO: maximal 100 kg und 4 m³ je Colli.');
    problem(er,b(21)==='DUO'&&avis!=='Depot','DUO benötigt Depot-Avis.');
    problem(er,b(21)==='UNO'&&!['Depot','Fahrer'].includes(avis),'UNO benötigt Fahrer-/Depot-Avis.');
    problem(er,ja(12)&&xxl&&avis==='Technisch','XXL privat: technisches Avis unzulässig.');
    problem(er,ja(12)&&['Overnight','Fixtermin'].includes(b(23))&&avis!=='Fahrer','Termin privat benötigt Fahrer-Avis.');
    problem(er,b(23)==='Overnight'&&(l>320||h>200),'Overnight-Maße überschritten.');
    problem(er,ja(26)&&(b(13)!=='Neuware'||wert>2500||!ja(25)||b(24)!=='Normal'),'Verdeckter Schaden: Kombination unzulässig.');
    problem(er,b(13)==='Gebrauchtware'&&(ja(25)||b(21)!=='Standard'),'Gebrauchtware: TVS nicht verfügbar.');
    problem(er,ja(27)&&b(21)==='Standard','Verpackungsentsorgung nur bei UNO/DUO.');
    problem(er,datum<r('GEL gültig von')||datum>r('GEL gültig bis'),'GEL-Dieselwert passt nicht zum Versanddatum.');
    problem(er,gebiet==='Sonstige Insel'&&!Number.isFinite(n(49)),'Bestätigter GEL-Inselpreis fehlt.');
    problem(er,b(23)==='12 Uhr'&&b(46)==='Ungeklaert','12-Uhr-Zusatzkosten bestätigen.');
    problem(er,metroZ+metroA===2&&b(47)==='Ungeklaert','Metropole an beiden Enden: einmal oder zweimal klären.');
    problem(er,(ja(42)||ja(52))&&!ja(45),'Bestätigten GEL-Sonderpreis bei Extras erfassen.');
    problem(er,palette&&!ja(51),'Paletten-Einstufung und Mindestgewicht bestätigen.');
    problem(er,gelGewicht>500&&!ja(53),'Fortschreibung des GEL-Tarifs über 500 kg bestätigen.');
    problem(er,wert>(ja(25)?50000:10000),'GEL-Warenwertgrenze überschritten.');
    if(b(10)==='17440'&&b(48)==='Auto'){gr.push('PLZ 17440: Insel oder Festland anhand des Ortes auswählen.');er.push(gr.at(-1));}
    if(xxl)hinweise.push('XXL vor Abholung anfragen; über 4,10 m mindestens 72 Stunden Regellaufzeit.');
    if(b(24)!=='Normal')hinweise.push('Die Prozentbasis für Beschaffung/Querverkehr ist vorläufig die Grundfracht; bestätigen.');
    if(gebiet!=='Festland'||b(23)!=='Kein')hinweise.push('Gebietsverfügbarkeit und Sonderleistungen vor Buchung bestätigen.');
    if(n(39)>0)hinweise.push('GLS-Lagerung: genaue Abrechnungseinheit bestätigen.');
    const finish=(teile,gruende,gewicht,istGls)=>{
      const basis=sum(Object.entries(teile).filter(([k])=>Number(k)<=51).map(([,v])=>v));
      teile[53]=istGls?basis*r('GLS Energie'):0;teile[54]=basis*r(istGls?'GLS Diesel Floater':'GEL Diesel');
      teile[55]=b(16)==='Verspaetet'?(basis+teile[53]+teile[54])*r(istGls?'GLS Finanzierung':'GEL Finanzierung'):0;
      if(!Object.values(teile).every(Number.isFinite))throw new Error('Tarifwert fehlt');
      const netto=rund(sum(Object.values(teile))),ust=rund(netto*r('USt Planung'));
      return {netto:gruende.length?null:netto,brutto:gruende.length?null:rund(netto+ust),gruende,gewicht,teile};
    };
    return {gls:finish(g,gr,glsGewicht,true),gel:finish(e,er,gelGewicht,false),gebiet,avis,xxl,hinweise};
  } catch { return fehler('Ein Tarifwert fehlt oder ist ungültig. Bitte den privaten Tarifstand prüfen.'); }
}
