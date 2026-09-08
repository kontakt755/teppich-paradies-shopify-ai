// Stellt Rollenware auf zentimetergenaue Abrechnung um: Variantenpreis wird
// vom Preis pro m² zum Preis pro 0,01 m², dazu setzt das Produkt das Metafeld
// custom.preis_pro_001_qm. Beides gehoert zusammen - ein Produkt mit neuem
// Preis, aber ohne Metafeld waere im Shop um den Faktor 100 zu billig.
//
// Der Lauf ist standardmaessig ein Trockenlauf und schreibt nichts. Er
// erzeugt eine Momentaufnahme der aktuellen Preise, damit sich jede Aenderung
// zurueckdrehen laesst.
//
// Preise sind nicht themegebunden: eine Umstellung wirkt sofort im echten
// Shop. Deshalb muss das Theme, das beide Modelle beherrscht, VORHER live
// sein - sonst zeigt der Shop fuer umgestellte Produkte 0,28 statt 28,00 EUR.
//
//   node automation/scripts/rollenware-preisumstellung.mjs            # Trockenlauf
//   node automation/scripts/rollenware-preisumstellung.mjs --handle x # nur ein Produkt
//
// Das tatsaechliche Schreiben laeuft bewusst nicht ueber dieses Script,
// sondern ueber den Shopify-MCP mit productVariantsBulkUpdate und
// metafieldsSet - jeweils nach ausdruecklicher Freigabe und Produkt fuer
// Produkt, nicht als Massenlauf.

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const nurHandle = args.includes('--handle') ? args[args.indexOf('--handle') + 1] : null;

const eingabe = process.env.ROLLENWARE_INPUT ?? 'qa/results/rollenware-preise.json';
const ziel = 'qa/results/rollenware-preisumstellung.json';

if (!fs.existsSync(eingabe)) {
  console.error(`Momentaufnahme fehlt: ${eingabe}`);
  console.error('Erst die aktuellen Preise ueber den Shopify-MCP exportieren:');
  console.error('  query { products(first: 250, query: "template_suffix:rolle") {');
  console.error('    nodes { handle title variants(first: 100) {');
  console.error('      nodes { id title price } } } } }');
  console.error('Ergebnis als {products:[{handle,title,variants:[{id,title,price}]}]} ablegen.');
  process.exit(1);
}

const daten = JSON.parse(fs.readFileSync(eingabe, 'utf8'));
const produkte = (daten.products ?? []).filter((p) => !nurHandle || p.handle === nurHandle);

let variantenGesamt = 0;
let abweichungGesamt = 0;
const plan = [];

for (const produkt of produkte) {
  const varianten = [];
  for (const variante of produkt.variants ?? []) {
    const altCent = Math.round(parseFloat(variante.price) * 100);
    // Preis pro 0,01 m². Shopify kennt nur ganze Cent - daraus entsteht die
    // bekannte Abweichung (2790 / 100 = 27,9 -> 28 Cent, also +0,36 %).
    const neuCent = Math.round(altCent / 100);
    const effektivProQm = neuCent * 100;
    const abweichung = ((effektivProQm - altCent) / altCent) * 100;

    varianten.push({
      id: variante.id,
      titel: variante.title,
      altProQm: (altCent / 100).toFixed(2),
      neuPro001Qm: (neuCent / 100).toFixed(2),
      effektivProQm: (effektivProQm / 100).toFixed(2),
      abweichungProzent: abweichung.toFixed(2),
    });

    variantenGesamt += 1;
    abweichungGesamt += abweichung;
  }

  plan.push({ handle: produkt.handle, titel: produkt.title, metafeld: 'custom.preis_pro_001_qm = true', varianten });
}

fs.mkdirSync(path.dirname(ziel), { recursive: true });
fs.writeFileSync(ziel, `${JSON.stringify({ erzeugtAm: new Date().toISOString(), plan }, null, 2)}\n`);

const schnitt = variantenGesamt ? abweichungGesamt / variantenGesamt : 0;
console.log(`TROCKENLAUF - es wurde nichts geschrieben.`);
console.log(`Produkte: ${plan.length}, Varianten: ${variantenGesamt}`);
console.log(`Mittlere Preisabweichung durch die Cent-Rundung: ${schnitt.toFixed(2)} %`);
console.log(`Plan abgelegt: ${ziel}`);

const auffaellig = plan
  .flatMap((p) => p.varianten.map((v) => ({ handle: p.handle, ...v })))
  .filter((v) => Math.abs(parseFloat(v.abweichungProzent)) > 1);

if (auffaellig.length) {
  console.log(`\n${auffaellig.length} Varianten weichen um mehr als 1 % ab - vor der Umstellung ansehen:`);
  for (const v of auffaellig.slice(0, 20)) {
    console.log(`  ${v.handle} / ${v.titel}: ${v.altProQm} -> effektiv ${v.effektivProQm} EUR/m² (${v.abweichungProzent} %)`);
  }
}
