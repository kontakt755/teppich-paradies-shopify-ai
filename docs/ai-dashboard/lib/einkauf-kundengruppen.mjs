/** Sortiert Lieferantenpositionen nach Kunden und hält mehrere Aufträge eines Kunden zusammen. */
export function gruppierePositionenNachKunde(positionen, auftraege) {
  const auftragNachId = new Map(auftraege.map(a => [String(a.id), a]));
  const gruppen = new Map();

  for (const position of positionen) {
    const auftrag = auftragNachId.get(String(position.orderId));
    const kunde = auftrag?.details?.kunde;
    const name = String(kunde?.name || '').trim();
    const email = String(kunde?.email || '').trim().toLocaleLowerCase('de');
    const id = kunde?.id ? String(kunde.id) : '';
    const key = id ? `id:${id}` : email && email !== '–' ? `email:${email}` : `auftrag:${position.orderId}`;
    if (!gruppen.has(key)) gruppen.set(key, {
      name: name && name !== '–' ? name : 'Kunde nicht zugeordnet',
      ort: auftrag?.details?.lieferadresse?.ort || '',
      auftragsIds: new Set(),
      positionen: [],
    });
    const gruppe = gruppen.get(key);
    gruppe.auftragsIds.add(String(position.orderId));
    gruppe.positionen.push(position);
  }

  const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });
  return [...gruppen.values()]
    .sort((a, b) => (a.name === 'Kunde nicht zugeordnet') - (b.name === 'Kunde nicht zugeordnet') || collator.compare(a.name, b.name))
    .map(gruppe => ({
      name: gruppe.name,
      ort: gruppe.auftragsIds.size === 1 && gruppe.ort !== '–' ? gruppe.ort : '',
      auftragsAnzahl: gruppe.auftragsIds.size,
      positionen: gruppe.positionen.sort((a, b) => (Date.parse(b.orderDatum) || 0) - (Date.parse(a.orderDatum) || 0)
        || collator.compare(String(a.orderName || ''), String(b.orderName || ''))),
    }));
}
