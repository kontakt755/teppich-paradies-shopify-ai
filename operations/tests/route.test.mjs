import test from 'node:test';
import assert from 'node:assert/strict';
import { ROUTE, ROUTEN, routeFor, istRoute, DEFAULT_FALLBACK } from '../lib/route.mjs';

test('Routen-Enum vollstaendig', () => {
  assert.deepEqual(ROUTEN, ['OWN_STOCK', 'SUPPLIER_TO_TP', 'SUPPLIER_DIRECT', 'SUPPLIER_TO_SITE', 'SAMPLE_STOCK', 'SAMPLE_SUPPLIER', 'SAMPLE_CUT', 'NO_PROCUREMENT']);
  assert.equal(istRoute('SUPPLIER_DIRECT'), true);
  assert.equal(istRoute('LAGER'), false);
  assert.equal(DEFAULT_FALLBACK, ROUTE.SUPPLIER_TO_TP);
});

test('Standard SUPPLIER_TO_TP; verifizierter Direktversand bleibt Direktversand', () => {
  assert.equal(routeFor({ item: { einkauf: { route: 'SUPPLIER_TO_TP' } } }).route, 'SUPPLIER_TO_TP');
  const d = routeFor({ item: { einkauf: { route: 'SUPPLIER_DIRECT', neutralversand: 'VERIFIED' } } });
  assert.equal(d.route, 'SUPPLIER_DIRECT');
  assert.equal(d.quelle, 'STANDARD');
});

test('SUPPLIER_DIRECT ohne VERIFIED faellt auf route_fallback bzw. SUPPLIER_TO_TP', () => {
  const u = routeFor({ item: { einkauf: { route: 'SUPPLIER_DIRECT', neutralversand: 'UNKNOWN' } } });
  assert.equal(u.route, 'SUPPLIER_TO_TP');
  assert.equal(u.quelle, 'FALLBACK');
  assert.match(u.hinweise[0], /nicht VERIFIED/);
  const eigen = routeFor({ item: { einkauf: { route: 'SUPPLIER_DIRECT', neutralversand: 'NOT_ALLOWED', route_fallback: 'SUPPLIER_TO_SITE' } } });
  assert.equal(eigen.route, 'SUPPLIER_TO_SITE');
});

test('Prioritaet: Override > Verlegeservice > Abholung > Direktversand', () => {
  const item = { einkauf: { route: 'SUPPLIER_DIRECT', neutralversand: 'VERIFIED' } };
  const o = routeFor({ item, override: { route: 'SUPPLIER_TO_TP', grund: 'Projekt', von: 'Test Mitarbeiter' }, verlegeservice: true, abholung: true });
  assert.equal(o.route, 'SUPPLIER_TO_TP');
  assert.equal(o.quelle, 'OVERRIDE');
  assert.equal(o.override.grund, 'Projekt');
  assert.equal(o.override.von, 'Test Mitarbeiter');
  assert.ok(o.override.am);
  assert.equal(routeFor({ item, verlegeservice: true, abholung: true }).route, 'SUPPLIER_TO_SITE');
  assert.equal(routeFor({ item, abholung: true }).route, 'SUPPLIER_TO_TP');
  assert.equal(routeFor({ item, abholung: true }).quelle, 'ABHOLUNG');
});

test('Override ohne grund/von oder mit ungueltiger Route wird abgelehnt', () => {
  assert.throws(() => routeFor({ item: {}, override: { route: 'SUPPLIER_TO_TP', grund: 'x' } }), /grund und von/);
  assert.throws(() => routeFor({ item: {}, override: { route: 'LAGER', grund: 'x', von: 'y' } }), /ungueltig/);
  const warn = routeFor({ item: { einkauf: { neutralversand: 'UNKNOWN' } }, override: { route: 'SUPPLIER_DIRECT', grund: 'Kunde', von: 'T' } });
  assert.equal(warn.route, 'SUPPLIER_DIRECT');
  assert.match(warn.hinweise[0], /ohne neutralversand=VERIFIED/);
});

test('Eigenbestand wird nicht beruecksichtigt; fehlende Route -> UNGEKLAERT sichtbar', () => {
  const own = routeFor({ item: { einkauf: { route: 'OWN_STOCK' } } });
  assert.equal(own.route, 'SUPPLIER_TO_TP');
  assert.match(own.hinweise[0], /kein Bestand/);
  const leer = routeFor({ item: { einkauf: {} } });
  assert.equal(leer.route, 'SUPPLIER_TO_TP');
  assert.equal(leer.stammroute, 'UNGEKLAERT');
  assert.match(leer.hinweise[0], /UNGEKLAERT/);
});

test('Muster- und Dienstleistungsrouten bleiben trotz Verlegeservice/Abholung', () => {
  assert.equal(routeFor({ item: { einkauf: { route: 'SAMPLE_CUT' } }, verlegeservice: true }).route, 'SAMPLE_CUT');
  assert.equal(routeFor({ item: { einkauf: { route: 'NO_PROCUREMENT' } }, abholung: true }).route, 'NO_PROCUREMENT');
});
