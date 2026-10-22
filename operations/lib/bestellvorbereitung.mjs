/** Fingerabdruck nur der fachlichen Bestellvorlage, ohne Uebernahmezeit und Wartealter. */
import { createHash } from 'node:crypto';

export function vorbereitungStand(vorlage, scope = {}) {
  const mails = (vorlage.mails || []).map(m => ({
    weg: m.weg ?? null, portalUrl: m.portalUrl ?? null, telefon: m.telefon ?? null,
    an: m.an ?? null, betreff: m.betreff ?? null, text: m.text ?? null,
    lieferziel: m.lieferziel ?? null, route: m.route ?? null,
    positionen: (m.positionen || []).map(p => ({ orderId: p.orderId, lineItemId: p.lineItemId,
      menge: p.menge ?? null, einheit: p.einheit ?? null, artikelnummer: p.artikelnummer ?? null })),
  }));
  const kontext = Object.fromEntries(['lieferant', 'art', 'gruppe', 'ziel', 'auftrag'].map(k => [k, scope[k] || '']));
  return createHash('sha256').update(JSON.stringify({ version: 1, kontext, mails })).digest('hex');
}
