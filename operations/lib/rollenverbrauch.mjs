// Materialverbrauch aus einer durchgehenden Rolle. Bestandseinheit: 1 cm
// volle Rollenbreite. Schmale Reststreifen gehoeren nicht zum Rollenbestand.
// Preise werden serverseitig vorgegeben, nie aus Warenkorb-Eigenschaften.
function mass(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 100000) throw new Error(`${name}: ungueltiges Mass`);
  // Zentimeter auf Hundertstel: eindeutige Ganzzahlarithmetik.
  const ticks = Math.round(n * 100);
  if (Math.abs(n * 100 - ticks) > 0.000001) throw new Error(`${name}: hoechstens zwei Nachkommastellen`);
  return ticks;
}
function cent(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name}: ungueltiger Centbetrag`);
  return value;
}
export function rollenverbrauch({ breiteCm, laengeCm, rollenbreiteCm = 400, maxLaengeCm = 1000, preisQmCent, kettelMeterCent = 0, anzahl = 1 }) {
  const b = mass(breiteCm, 'Breite');
  const l = mass(laengeCm, 'Laenge');
  const rb = mass(rollenbreiteCm, 'Rollenbreite');
  const ml = mass(maxLaengeCm, 'Maximale Laenge');
  if (!Number.isSafeInteger(anzahl) || anzahl < 1 || anzahl > 1000) throw new Error('Ungueltige Stueckzahl');
  const kurz = Math.min(b, l), lang = Math.max(b, l);
  if (kurz > rb || lang > Math.max(rb, ml)) throw new Error('Mass passt nicht auf die freigegebene Rolle');
  // Drehen ist moeglich: 2 x 3 m braucht bei 4 m Rollenbreite 2 m.
  const verbrauchTicks = lang <= rb ? kurz : lang;
  if (verbrauchTicks > ml) throw new Error('Maximale Zuschnittlaenge ueberschritten');
  const rollenCm = Math.ceil(verbrauchTicks / 100);
  const materialCent = Math.round(b * l * cent(preisQmCent, 'Flaechenpreis') / 100000000);
  const kettelCent = Math.round(2 * (b + l) * cent(kettelMeterCent, 'Kettelpreis') / 10000);
  return {
    rollenCm: rollenCm * anzahl,
    rollenFlaecheQm: rollenCm * rollenbreiteCm / 10000 * anzahl,
    teppichFlaecheQm: b * l / 100000000 * anzahl,
    materialCent: materialCent * anzahl,
    kettelCent: kettelCent * anzahl,
    gesamtCent: (materialCent + kettelCent) * anzahl,
    querCm: (lang <= rb ? lang : kurz) / 100,
    schnittCm: rollenCm,
  };
}
