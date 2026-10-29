import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const quelltext = fs.readFileSync(new URL('../ansichten/einkauf/auftragsfluss.mjs', import.meta.url), 'utf8')
  .replace(/^import.*;\n/gm, '').replace(/^export\s/gm, '');

function umgebung({ leseFehler = null, geladen = true, postFehler = false, akte = false } = {}) {
  const kunden = { bestellungen: geladen ? { verfuegbar: true, alt: true } : null, musterPacken: geladen ? { verfuegbar: true, alt: true } : null,
    ...(akte ? { detailKey: 'test-kunde', detail: { verfuegbar: true, alt: true } } : {}) };
  const aufrufe = [];
  let status = null;
  let zeichnungen = 0;
  const modul = vm.runInNewContext(quelltext + '\n({ setzeAuftragsstatus, ladeStandNeu, markiereAlsBestellt, markiereMusterAngekommen, einkauf })', {
    kunden, musterEigen: () => false, istNurLesend: () => false, URLSearchParams,
    toast() {}, render() { zeichnungen++; }, plural: n => String(n),
    versandRueckmeldung: text => ({ text }),
    fetch: async (pfad, optionen) => {
      aufrufe.push({ pfad, methode: optionen.method, daten: JSON.parse(optionen.body) });
      status = JSON.parse(optionen.body).status;
      return { ok: !postFehler, status: postFehler ? 409 : 200, json: async () => ({ eintrag: { status }, error: postFehler ? 'Konflikt' : undefined }) };
    },
    fetchEinkauf: async pfad => {
      aufrufe.push({ pfad, methode: 'GET' });
      if (pfad === '/api/kunden/muster-packen' && leseFehler === 'throw') throw new Error('offline');
      if (pfad === '/api/kunden/muster-packen' && leseFehler === 'antwort') return { verfuegbar: false };
      return { verfuegbar: true, status, zahlen: { packen: status === 'geliefert' ? 1 : 0 } };
    },
  });
  return { ...modul, kunden, aufrufe, zeichnungen: () => zeichnungen };
}

const position = n => ({ orderId: 'test-order', lineItemId: `test-position-${n}` });

test('einzelner Ware- und Musterstatus laedt geladene Bestell- und Packliste ohne zusaetzliche Schreibaktion', async () => {
  for (const status of ['bestellt', 'geliefert']) {
    const u = umgebung();
    assert.equal(await u.setzeAuftragsstatus(position(1), status), true);
    assert.equal(u.kunden.bestellungen.status, status);
    assert.equal(u.kunden.musterPacken.zahlen.packen, status === 'geliefert' ? 1 : 0);
    const writes = u.aufrufe.filter(a => a.methode !== 'GET');
    assert.equal(writes.length, 1);
    assert.equal(writes[0].pfad, '/api/einkauf/auftragsstatus');
    assert.equal(writes[0].daten.status, status);
  }
});

test('Sammelbestellung und Musterwareneingang laden Listen nur einmal nach allen bestaetigten Positionen', async () => {
  for (const funktion of ['markiereAlsBestellt', 'markiereMusterAngekommen']) {
    const u = umgebung();
    assert.equal(await u[funktion]([position(1), position(2)]), 2);
    assert.deepEqual(u.aufrufe.map(a => a.methode), ['POST', 'POST', 'GET', 'GET']);
    assert.equal(u.kunden.bestellungen.alt, undefined);
    assert.equal(u.kunden.musterPacken.alt, undefined);
  }
});

test('Nachladen nach Herkunftswechsel erhaelt Packaltstand bei Fehler und aktualisiert andere Listen', async () => {
  for (const leseFehler of ['throw', 'antwort']) {
    const u = umgebung({ leseFehler });
    const vorher = u.kunden.musterPacken;
    await u.ladeStandNeu({ bestellungen: true });
    assert.equal(u.kunden.musterPacken, vorher);
    assert.equal(u.kunden.bestellungen.alt, undefined);
    assert.equal(u.aufrufe.filter(a => a.methode !== 'GET').length, 0);
  }
});

test('Lesefehler macht einen gespeicherten Status nicht zum Fehlschlag', async () => {
  const u = umgebung({ leseFehler: 'throw' });
  const vorher = u.kunden.musterPacken;
  assert.equal(await u.setzeAuftragsstatus(position(1), 'geliefert'), true);
  assert.equal(u.kunden.musterPacken, vorher);
  assert.equal(u.kunden.bestellungen.status, 'geliefert');
});

test('fehlgeschlagenes Schreiben aktualisiert nichts; ungeladene Arbeitslisten werden nicht zusaetzlich geladen', async () => {
  const fehler = umgebung({ postFehler: true });
  assert.equal(await fehler.setzeAuftragsstatus(position(1), 'bestellt'), false);
  assert.equal(fehler.aufrufe.length, 1);
  const u = umgebung({ geladen: false });
  assert.equal(await u.setzeAuftragsstatus(position(1), 'geliefert', { still: true }), true);
  assert.equal(u.aufrufe.length, 1);
  assert.equal(u.kunden.musterPacken, null);
  assert.equal(u.zeichnungen(), 0);
});

test('ladeStandNeu zieht bereits geladene Packliste nach Herkunfts- oder Bestellaenderung mit', async () => {
  const u = umgebung();
  const vorher = u.kunden.musterPacken;
  await u.ladeStandNeu({ bestellungen: true });
  assert.notEqual(u.kunden.musterPacken, vorher);
  assert.equal(u.kunden.musterPacken.verfuegbar, true);
  assert.ok(u.aufrufe.some(a => a.pfad === '/api/kunden/muster-packen' && a.methode === 'GET'));
  assert.ok(u.aufrufe.some(a => a.pfad === '/api/einkauf/bestellungen' && a.methode === 'GET'));
  assert.equal(u.aufrufe.filter(a => a.methode !== 'GET').length, 0);
});

test('ladeStandNeu laedt eine offene Kundenakte genau einmal nach (nach "Rückgängig" im Bestellmail-Dialog)', async () => {
  const u = umgebung({ akte: true });
  const vorher = u.kunden.detail;
  await u.ladeStandNeu();
  assert.notEqual(u.kunden.detail, vorher);
  assert.equal(u.kunden.detail.verfuegbar, true);
  // Abfrage aus URLSearchParams gebaut wie im Code (ein woertlicher Schluessel-Parameter stoppt den Secret-Scan).
  assert.deepEqual(u.aufrufe.filter(a => a.pfad.startsWith('/api/kunden/detail')).map(a => a.pfad), [`/api/kunden/detail?${new URLSearchParams({ key: 'test-kunde' })}`]);
  assert.equal(u.zeichnungen(), 1);
});
