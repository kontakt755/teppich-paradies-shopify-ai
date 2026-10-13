#!/usr/bin/env node
// Prueft den Zugang zur Admin API, ohne Geheimnisse auszugeben - und zwar je
// Datenquelle des Control Centers mit einer kleinsten Leseabfrage.
// Aufruf: npm run operations:verbindung
// Exit: 0 alles lesbar · 1 Fehler beim Zugang · 2 kein Zugang hinterlegt ·
//       3 Zugang steht, aber mindestens eine Quelle ist nicht lesbar
import { erzeugeProxy, pruefeQuellen, fehlendeBereiche, fehlendeSchreibBereiche, mitHinweis, KEIN_ZUGANG, LESE_BEREICHE, LESE_BEREICHE_ZEILE, SCHREIB_BEREICHE } from '../sync/zugang.mjs';

try {
  const { proxy, art, scope } = await erzeugeProxy();
  if (art === 'sammeln') {
    console.log(`KEIN ZUGANG. ${KEIN_ZUGANG}`);
    process.exit(2);
  }
  const data = await proxy.execute('query { shop { name } }');
  console.log(`Verbindung steht: Shop "${data.shop.name}" (Zugang: ${art === 'client-credentials' ? 'Client-ID + Schluessel, erneuert sich selbst' : 'fester Token'}).`);

  const quellen = await pruefeQuellen(proxy);
  console.log('\nDatenquellen:');
  for (const q of quellen) console.log(`  ${q.ok ? 'OK    ' : 'FEHLT '} ${q.quelle}${q.ok ? '' : ` - ${q.meldung}`}`);

  // Bereichsliste gibt es nur beim Client-Credentials-Weg; sie deckt auf, was
  // die Proben nicht zeigen (read_all_orders und read_metaobjects scheitern
  // nicht laut, sondern liefern nur weniger).
  const fehlend = scope ? fehlendeBereiche(scope) : [];
  if (fehlend.length) {
    console.log('\nFehlende Zugriffsbereiche:');
    for (const b of fehlend) console.log(`  ${b} - betrifft: ${LESE_BEREICHE[b]}`);
    console.log(`\nWas tun: im Dev Dashboard eine neue Version der App mit dieser Bereichszeile freigeben und die Aenderung im Shop bestaetigen:\n  ${LESE_BEREICHE_ZEILE}`);
  } else if (!scope) {
    console.log('\nHinweis: Ein fester Token meldet seine Bereiche nicht - massgeblich sind die Proben oben.');
  }

  // Schreibrechte aendern den Exit-Code nicht: ohne sie laufen alle Lese-Quellen,
  // nur die betroffene Aktion im Control Center sagt, was fehlt.
  const schreibFehlt = scope ? fehlendeSchreibBereiche(scope) : [];
  if (schreibFehlt.length) {
    console.log('\nNicht freigeschaltete Schreibrechte (nur fuer einzelne Aktionen noetig):');
    for (const b of schreibFehlt) console.log(`  ${b} - betrifft: ${SCHREIB_BEREICHE[b]}`);
  }

  const kaputt = quellen.filter(q => !q.ok).length;
  if (!kaputt && !fehlend.length) console.log('\nALLES IN ORDNUNG - alle Datenquellen sind lesbar.');
  process.exit(kaputt || fehlend.length ? 3 : 0);
} catch (e) {
  console.error(`FEHLER: ${mitHinweis(e.message)}`);
  process.exit(1);
}
