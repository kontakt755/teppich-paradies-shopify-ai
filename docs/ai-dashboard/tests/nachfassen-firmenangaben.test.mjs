// Firmenangaben in den Nachfass-Mails (Werkbank w-172 Punkt 2, Inhaber 2026-10-28):
// Rechtsform, Anschrift, Sitz, Registergericht und Geschaeftsfuehrerin stehen unter dem
// Gruss jeder Mail, die fuelleText() fuellt; der Abmelde-Hinweis bleibt die letzte Zeile.
import './_testumgebung.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fuelleText, mitFirmenangaben, texteAusMarkdown, FIRMENANGABEN, TEPPICH_VORLAGEN, NICHT_VERFUEGBAR_VORLAGE,
} from '../lib/muster-nachfassen.mjs';

const VORLAGE = `# Muster nachfassen

## Text 1 – E-Mail nach 4–5 Tagen

**Betreff:** Ihre Muster – passt die Farbe?

Guten Tag {Anrede} {Nachname},

Ihre Muster sollten angekommen sein.

Freundliche Grüße
{Name}
Teppich Paradies Oranienburg

<small>Keine Nachfragen mehr? Antworten Sie mit „Abmelden“.</small>

---
`;

test('Firmenangaben nennen Rechtsform, Anschrift, Sitz, Registergericht und Geschaeftsfuehrerin', () => {
  assert.match(FIRMENANGABEN, /Teppich Paradies Oranienburg GmbH/);
  assert.match(FIRMENANGABEN, /Saarlandstraße 73–81 · 16515 Oranienburg/);
  assert.match(FIRMENANGABEN, /Sitz: Oranienburg/);
  assert.match(FIRMENANGABEN, /Amtsgericht Neuruppin, HRB 9141 NP/);
  assert.match(FIRMENANGABEN, /Geschäftsführerin: /);
  assert.doesNotMatch(FIRMENANGABEN, /[{}<>]/);
});

test('Inhaber-Vorlage: Firmenangaben nach dem Gruss, Abmelden bleibt am Ende', () => {
  const mail = fuelleText(texteAusMarkdown(VORLAGE).erste, { kundenname: 'Testkunde Eins', absender: 'Anna' });
  assert.ok(mail.text.includes(`Freundliche Grüße\nAnna\nTeppich Paradies Oranienburg\n\n${FIRMENANGABEN}\n\n`));
  assert.match(mail.text, /Antworten Sie mit „Abmelden“\.$/);
  assert.equal(mail.text.split('HRB 9141').length, 2, 'genau einmal');
});

test('Eingebaute Vorlagen (Teppich, Erinnerung, Muster nicht verfuegbar) tragen sie ebenfalls', () => {
  for (const vorlage of [TEPPICH_VORLAGEN.erste, TEPPICH_VORLAGEN.erinnerung, NICHT_VERFUEGBAR_VORLAGE]) {
    const mail = fuelleText(vorlage, { kundenname: 'Testkunde Zwei', absender: 'Bernd', farben: ['Produkt: Grau'] });
    assert.ok(mail.text.includes(FIRMENANGABEN), vorlage.betreff);
    assert.ok(mail.text.indexOf('Freundliche Grüße') < mail.text.indexOf(FIRMENANGABEN), vorlage.betreff);
  }
});

test('Ohne Gruss am Ende, nie doppelt, leerer Text bleibt leer', () => {
  assert.equal(mitFirmenangaben('Hallo'), `Hallo\n\n${FIRMENANGABEN}`);
  const einmal = mitFirmenangaben('Hallo');
  assert.equal(mitFirmenangaben(einmal), einmal);
  assert.equal(mitFirmenangaben(''), '');
});
