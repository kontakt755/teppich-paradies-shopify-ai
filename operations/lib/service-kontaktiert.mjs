/**
 * Serviceanfragen mit Status "neu" werden "kontaktiert", sobald im Gmail-Ordner "Gesendet" eine Mail an die
 * E-Mail-Adresse der Anfrage steht, die nach dem Anfragetag rausging (Werkbank w-352, Punkt 3).
 * Nur lesend im Postfach (gesendetAn); geschrieben wird allein serviceanfragen.json ueber aendern(),
 * der Verlauf nennt "Postfach-Abgleich". Eine Anfrage ohne Adresse (Telefon) bleibt unberuehrt.
 */
import { leseAlle, aendern } from './serviceanfragen.mjs';
import { gesendetAn } from './laden-mails.mjs';

const TAGE = 30;

/** @returns {Promise<string[]>} Nummern der Anfragen, die auf "kontaktiert" gesetzt wurden */
export async function serviceKontaktiertAbgleichen(datei, { hauptZugang, mitNurLesenFn, verbindenHaupt, jetzt = new Date() } = {}) {
  const offen = leseAlle(datei).filter(e => e.status === 'neu' && e.email && /^\d{4}-\d{2}-\d{2}$/.test(e.datum || ''));
  if (!offen.length || !hauptZugang) return [];
  const gesendet = await gesendetAn(offen.map(e => e.email.trim().toLowerCase()), { hauptZugang, mitNurLesenFn, tage: TAGE, verbindenHaupt });
  const gesetzt = [];
  for (const e of offen) {
    // Gesendet-Zeitpunkte sind exakt; der Anfragetag zaehlt ab 00:00 UTC (lieber einmal zu frueh als nie).
    const ab = Date.parse(`${e.datum}T00:00:00Z`);
    if (gesendet.some(g => g.an.includes(e.email.trim().toLowerCase()) && g.am >= ab)) {
      aendern(datei, e.id, { status: 'kontaktiert' }, { actor: 'Postfach-Abgleich', jetzt });
      gesetzt.push(e.id);
    }
  }
  return gesetzt;
}
