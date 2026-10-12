// Gleichlauf: die JS-Regel des Angebote-Abgleichs muss genau das entscheiden, was
// snippets/tp-rabatt-sichtbar.liquid im Shop entscheidet. Aendert jemand das Snippet,
// ohne operations/lib/angebote-abgleich.mjs nachzuziehen, faellt es hier auf.
// Alle Varianten tragen einen Vergleichspreis: liquidjs vergleicht nil anders als Shopify.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Liquid } from 'liquidjs';
import { rabattSichtbar } from '../lib/angebote-abgleich.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const lies = (d) => readFileSync(path.join(root, d), 'utf8').replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '');
const engine = new Liquid({ templates: {
  'tp-rabatt-sichtbar': lies('snippets/tp-rabatt-sichtbar.liquid'),
  'tp-aktion-aktiv': lies('snippets/tp-aktion-aktiv.liquid'),
  // Kommt mit dem Sonderposten-Paket (#977); bis dahin fragt tp-rabatt-sichtbar nicht danach.
  ...(existsSync(path.join(root, 'snippets/tp-ist-sonderposten.liquid')) ? { 'tp-ist-sonderposten': lies('snippets/tp-ist-sonderposten.liquid') } : {}),
} });

// Tage weit weg von Mitternacht, damit Zeitzonen von Testrechner und Shop egal sind.
const tagPlus = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const HEUTE = tagPlus(0);
const v = (opts, preis, vergleich, titel = opts.join(' / ')) => ({ opts, preis, vergleich, titel });

const FAELLE = {
  'ohne Aktion': [{}, [v(['Grau'], 2000, 2500)]],
  'befristet laeuft': [{ start: tagPlus(-3), ende: tagPlus(3) }, [v(['Grau'], 2000, 2500)]],
  'befristet kuenftig': [{ start: tagPlus(3) }, [v(['Grau'], 2000, 2500)]],
  'befristet vorbei': [{ start: tagPlus(-9), ende: tagPlus(-3) }, [v(['Grau'], 2000, 2500)]],
  'befristet ohne Ende': [{ start: tagPlus(-3) }, [v(['Grau'], 2000, 2500)]],
  'preisanker unbefristet': [{ klasse: 'preisanker' }, [v(['Grau'], 2000, 2500)]],
  'preisanker vorbei': [{ klasse: 'preisanker', ende: tagPlus(-3) }, [v(['Grau'], 2000, 2500)]],
  'Rolle+Raum alle reduziert': [{ start: tagPlus(-3) }, [v(['Grau', '400 cm'], 3000, 3500), v(['Grau', 'Wunschmaß'], 4000, 4700)]],
  'Rolle+Raum nur Raum reduziert': [{ start: tagPlus(-3) }, [v(['Grau', '400 cm'], 3000, 3000), v(['Grau', 'Wunschmaß'], 4000, 4700)]],
  'Rolle allein reduziert': [{ start: tagPlus(-3) }, [v(['Grau', '400 cm'], 3000, 3500)]],
  'Rechnervariante ignoriert': [{ start: tagPlus(-3) }, [v(['Grau', '400 cm'], 3000, 3500), v(['Grau', 'Wunschmaß'], 4000, 4700), v(['opc-1'], 100, 100, 'opc-1')]],
};

for (const [name, [aktion, varianten]] of Object.entries(FAELLE)) {
  test(`Gleichlauf Liquid/JS: ${name}`, async () => {
    const product = {
      type: 'Teppichboden',
      metafields: { aktion: Object.fromEntries(Object.entries(aktion).map(([k, w]) => [k, { value: w }])), sonderposten: {} },
      variants: varianten.map((x) => ({ title: x.titel, option1: x.opts[0] ?? '', option2: x.opts[1] ?? '', option3: x.opts[2] ?? '', price: x.preis, compare_at_price: x.vergleich })),
    };
    const liquid = (await engine.parseAndRender("{% render 'tp-rabatt-sichtbar', product: product %}", { product })).trim() === 'ja';
    const js = rabattSichtbar({
      mf: { aktion_start: aktion.start ?? '', aktion_ende: aktion.ende ?? '', aktion_klasse: aktion.klasse ?? '' },
      varianten: varianten.map((x) => ({ titel: x.titel, optionen: x.opts, preis: x.preis / 100, vergleichspreis: x.vergleich / 100, kaufbar: true })),
    }, HEUTE);
    assert.equal(js, liquid);
  });
}
