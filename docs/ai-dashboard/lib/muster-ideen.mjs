/**
 * Reiter "Muster anrufen": warum wird aus Mustern selten ein Kauf, und was ginge anders?
 *
 * Die Texte sind Vermutungen und Vorschlaege, keine Entscheidungen. Jede Vermutung nennt die
 * Klick-Ergebnisse, die sie bestaetigen, und soweit moeglich eine Zahl - beides kommt zur Laufzeit
 * aus den lokalen Daten. Im Repository stehen bewusst keine Zahlen (oeffentlich, AGENTS.md).
 */

function mittelwert(liste) {
  const a = liste.filter(n => Number.isFinite(n)).sort((x, y) => x - y);
  return a.length ? Math.round(a[Math.floor(a.length / 2)] * 10) / 10 : null;
}

const TAG_MS = 86_400_000;
const komma = n => String(n ?? '–').replace('.', ',');

/**
 * Zahlen zur Lage, nur Mengen und keine Kundendaten.
 * @param {object[]} zeilen  Bestellzeilen samt Zeitleiste
 * @param {object|null} wirkung  zahlen aus musterwirkung() (reif, jung, Kaeufer); fehlt sie, bleiben diese Felder null
 */
export function musterKennzahlen(zeilen = [], wirkung = null, { jetzt = new Date() } = {}) {
  const echt = (zeilen || []).filter(z => z && !z.testbestellung && !z.storniert);
  const muster = echt.filter(z => z.auftragsart === 'muster');
  const ware = echt.filter(z => z.auftragsart !== 'muster');
  const warte = [];
  let nichtVerschickt = 0;
  let nichtVerschicktLange = 0;
  for (const z of muster) {
    const raus = (z.verlauf || []).find(s => s.schritt === 'raus');
    if (raus?.zustand === 'erledigt' && raus.am) warte.push((new Date(raus.am) - new Date(z.datum)) / TAG_MS);
    else if (!z.zeitleisteAbgeschlossen) {
      nichtVerschickt += 1;
      if ((jetzt - new Date(z.datum)) / TAG_MS > 7) nichtVerschicktLange += 1;
    }
  }
  const musterKunden = new Set(muster.map(z => z.kundenSchluessel).filter(Boolean));
  const warenKunden = new Set(ware.map(z => z.kundenSchluessel).filter(Boolean));
  const nachLeer = v => (v === undefined ? null : v);
  return {
    musterKunden: musterKunden.size,
    warenKunden: warenKunden.size,
    warenOhneMuster: [...warenKunden].filter(k => !musterKunden.has(k)).length,
    tageBisVersand: mittelwert(warte),
    ueberZehnTage: warte.filter(t => t > 10).length,
    nichtVerschickt,
    nichtVerschicktLange,
    mitWarenkauf: nachLeer(wirkung?.musterkundenMitWarenkauf),
    nochJung: nachLeer(wirkung?.nochJungeMusterkunden),
    reifOhneKauf: nachLeer(wirkung?.ausgereifteMusterkundenOhneBeobachtetenKauf),
    wiederholer: nachLeer(wirkung?.wiederholungsmusterkunden),
    kaufabstandTage: nachLeer(wirkung?.kaufabstandMedianTage),
  };
}

/** Vermutungen. `gruende` sind Werte aus ANRUF_ERGEBNISSE, `zahl` liefert einen Satz oder null. */
export const MUSTER_VERMUTUNGEN = Object.freeze([
  {
    titel: 'Es ist noch zu früh für ein Urteil',
    text: 'Der Musterdienst läuft erst seit Kurzem in dieser Menge, und zwischen Muster und Kauf vergeht Zeit.',
    idee: 'Erst nach der Beobachtungszeit urteilen. Zählen, was aus den reifen Kunden wird.',
    gruende: ['ueberlegt_noch', 'spaeter_kaufen'],
    zahl: k => (k.nochJung === null ? null : `${k.nochJung} von ${k.musterKunden} Musterkunden sind noch in der Beobachtungszeit, ${k.reifOhneKauf} sind reif ohne Kauf. Bisher ${k.mitWarenkauf} Käufer, Abstand im Mittel ${komma(k.kaufabstandTage)} Tage.`),
  },
  {
    titel: 'Die Muster kommen zu spät',
    text: 'Wer gerade vergleicht, entscheidet in wenigen Tagen. Kommt das Muster nach einer Woche, ist die Entscheidung oft schon gefallen.',
    idee: 'Lagernde Muster sofort schicken, auf der Produktseite sagen, wann das Muster kommt, Sammelbestellungen beim Lieferanten seltener abwarten.',
    gruende: ['zu_spaet', 'woanders_gekauft'],
    zahl: k => (k.tageBisVersand === null ? null : `Von der Bestellung bis zum Versand im Mittel ${komma(k.tageBisVersand)} Tage, bei ${k.ueberZehnTage} über 10 Tage. ${k.nichtVerschickt} noch nicht als verschickt eingetragen, davon ${k.nichtVerschicktLange} älter als 7 Tage.`),
  },
  {
    titel: 'Käufer kommen gar nicht über Muster',
    text: 'Wer kauft, kauft oft direkt. Dann ist der Musterdienst nicht der Weg zum Kauf, sondern ein eigener Kostenblock.',
    idee: 'Die Produktseite für den Kauf ohne Muster stärken: echte Fotos, Beispielrechnung, Lieferzeit.',
    gruende: [],
    zahl: k => (k.warenKunden ? `${k.warenOhneMuster} von ${k.warenKunden} Warenkunden haben ohne Muster bei uns gekauft.` : null),
  },
  {
    titel: 'Kostenlos zieht auch Stöberer an',
    text: 'Ohne Kosten bestellt man schnell drei Muster, auch wenn noch gar kein Kauf ansteht.',
    idee: 'Schutzgebühr mit Anrechnung beim Kauf testen, siehe unten.',
    gruende: ['nur_vergleich', 'kein_bedarf'],
    zahl: k => (k.wiederholer === null ? null : `${k.wiederholer} Kunden haben mehrmals Muster bestellt.`),
  },
  {
    titel: 'Nach dem Muster wird der Preis verglichen',
    text: 'Das Muster klärt die Farbe, gekauft wird dann beim günstigsten Anbieter oder im Fachhandel vor Ort.',
    idee: 'Nachfragen, wo und zu welchem Preis gekauft wurde, und die Antwort notieren. Mehrere gleiche Antworten zeigen, wo wir nachbessern müssen.',
    gruende: ['zu_teuer', 'woanders_gekauft'],
    zahl: () => null,
  },
  {
    titel: 'Vom Muster zum Kauf ist der Weg zu weit',
    text: 'Das Muster liegt da, aber Maß, Verschnitt und Endpreis sind offen, und es fehlt der nächste Schritt.',
    idee: 'Begleitblatt mit QR-Code zum Produkt und Aufmaß-Hilfe in jeden Umschlag (Entwurf liegt vor). Angebot nach Maß anbieten.',
    gruende: ['masse_unklar', 'will_bestellen'],
    zahl: () => null,
  },
  {
    titel: 'Das Muster gefällt nicht',
    text: 'Farbe oder Griff entsprechen nicht dem Bild im Shop, oder es passt schlicht nicht in den Raum.',
    idee: 'Bei gleicher Linie häufig genannter Grund: Fotos prüfen. Im Gespräch gleich eine konkrete Alternative nennen.',
    gruende: ['gefaellt_nicht', 'andere_muster'],
    zahl: () => null,
  },
].map(Object.freeze));

/** Was man statt oder neben dem Gratis-Muster ausprobieren koennte. Vorschlaege, nichts davon ist beschlossen. */
export const MUSTER_ALTERNATIVEN = Object.freeze([
  { titel: 'Häkchen „Bitte rufen Sie mich nach Erhalt an“', text: 'Freiwillig beim Muster-Bestellen. Liefert die Einwilligung für den Anruf und zeigt, wer es ernst meint.', aufwand: 'klein', entscheidet: 'Inhaber' },
  { titel: 'Zwei Fragen beim Muster-Bestellen', text: 'Wann soll der Boden liegen, und wie viele m² ungefähr? So werden große und baldige Vorhaben zuerst angerufen.', aufwand: 'klein', entscheidet: 'Inhaber' },
  { titel: 'Begleitblatt mit QR-Code', text: 'Direkter Weg vom Muster zum Produkt, mit Aufmaß-Hilfe und Telefonnummer. Der Entwurf ist fertig, gedruckt wird noch nicht.', aufwand: 'klein', entscheidet: 'Inhaber' },
  { titel: 'Schutzgebühr mit Anrechnung', text: 'Ein kleiner Betrag für das Muster-Set, der beim Kauf angerechnet wird. Erst bei einer Warengruppe testen und Bestellzahl sowie Käufe vergleichen.', aufwand: 'mittel', entscheidet: 'Inhaber' },
  { titel: 'Angebot statt Muster', text: '„Schicken Sie uns Ihre Maße, Sie bekommen den Endpreis in 24 Stunden.“ Daraus entsteht gleich ein Gespräch und ein Shopify-Entwurf.', aufwand: 'mittel', entscheidet: 'Team' },
  { titel: 'Foto oder Video statt Post', text: 'Per WhatsApp das Stück bei Tageslicht zeigen, auch neben einer anderen Farbe. Kostet kein Porto und geht am selben Tag.', aufwand: 'klein', entscheidet: 'Team' },
  { titel: 'Eigenen Raum ansehen', text: 'Die vorhandene Raumansicht auf Teppichböden ausweiten, später mit eigenem Raumfoto des Kunden.', aufwand: 'groß', entscheidet: 'Inhaber' },
  { titel: 'Muster im Laden abholen', text: 'Kunden aus der Nähe in den Laden einladen, statt zu verschicken. Dort kann gleich beraten und gemessen werden.', aufwand: 'klein', entscheidet: 'Team' },
  { titel: 'Muster erst ab einer Preisgrenze', text: 'Günstige Ware direkt verkaufen, Muster dort anbieten, wo der Warenwert die Kosten trägt.', aufwand: 'mittel', entscheidet: 'Inhaber' },
].map(Object.freeze));

/** Wie oft wurden die Gruende einer Vermutung genannt? gruende: Liste aus musterAnrufliste(). */
export function vermutungGenannt(vermutung, gruende = []) {
  return gruende.filter(g => vermutung.gruende.includes(g.wert)).reduce((s, g) => s + g.anzahl, 0);
}
