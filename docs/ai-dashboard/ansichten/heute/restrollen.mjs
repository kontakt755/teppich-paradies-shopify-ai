/**
 * "Heute": eine ruhige Zeile "Restrollen" (Inhaber 2026-11-06: Laden und Shop sollen immer
 * denselben Bestand zeigen). Sagt, wie viel noch auf den Rollen ist, ob im Laden gebucht wird
 * und wann wieder nachgemessen werden muss. Bernstein nur, wenn das Nachmessen faellig ist.
 *
 * Daten: dieselbe Liste wie die Ansicht "Sonderposten" (live aus Shopify, hier hoechstens alle
 * 5 Minuten neu), dazu `ladenStand` aus dem Protokoll (operations/lib/sonderposten.mjs,
 * ladenStandAusProtokoll). Fehlt etwas, fehlt die Zeile - keine geratenen Zahlen.
 * Rechnung und Text: lib/sonderposten.mjs (restrollenStand, restrollenText).
 */
import { esc } from '../../kern/helfer.mjs';
import { sonderposten, ensureSonderposten } from '../sonderposten.mjs';
import { restrollenStand, restrollenText } from '../../lib/sonderposten.mjs';

/** Die Zeile im Stil von "Im Hintergrund"; leer, solange nichts belegt ist. */
export function restrollenZeile() {
  ensureSonderposten({ alt: true });
  const st = restrollenStand(sonderposten.daten);
  if (!st) return '';
  const { text, warn } = restrollenText(st);
  return `<div class="heute-hg-zeile${warn ? ' warn' : ''}"><span class="heute-hg-name">Restrollen</span><span class="heute-hg-text">${esc(text)}</span><a class="heute-hg-knopf" href="#/sonderposten">Zur Liste</a></div>`;
}
