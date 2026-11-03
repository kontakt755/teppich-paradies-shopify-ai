import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pruefeBefehl, zerlege } from './shopify-cli-guard.mjs';

const HOOK = fileURLToPath(new URL('./shopify-cli-guard.mjs', import.meta.url));
const FALLBACK = '111222333';
const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-cli-guard-'));
const datei = (name, text) => { fs.writeFileSync(path.join(ordner, name), text); return name; };
const pruefe = befehl => pruefeBefehl(befehl, { cwd: ordner, fallbackId: FALLBACK });
const BASIS = 'shopify store execute -s shop.myshopify.com --allow-mutations';

test('Loeschen direkt im Befehl wird gesperrt, auch mit Variablen und Alias', () => {
  assert.match(pruefe(`${BASIS} --query 'mutation { productDelete(input: {id: "gid://shopify/Product/1"}) { deletedProductId } }'`), /productDelete/);
  assert.match(pruefe(`${BASIS} -q 'mutation($id: ID!) { productDelete(input: {id: $id}) { deletedProductId } }' -v '{"id":"gid://shopify/Product/1"}'`), /productDelete/);
  assert.match(pruefe(`${BASIS} --query='mutation { weg: collectionDelete(input: {id: "x"}) { deletedCollectionId } }'`), /collectionDelete/);
  assert.match(pruefe(`${BASIS} --query "mutation { themeDelete(id: \\"1\\") { deletedThemeId } }"`), /themeDelete/);
});

test('Loeschen aus einer Abfragedatei wird gesperrt, auch ohne Variablenwert und nach cd', () => {
  const f = datei('weg.graphql', 'mutation($id: ID!) { productVariantsBulkDelete(productId: $id, variantsIds: []) { product { id } } }');
  assert.match(pruefe(`${BASIS} --query-file ${f}`), /productVariantsBulkDelete/);
  fs.mkdirSync(path.join(ordner, 'tief'), { recursive: true });
  fs.copyFileSync(path.join(ordner, f), path.join(ordner, 'tief', 'x.graphql'));
  assert.match(pruefe(`cd tief && ${BASIS} --query-file x.graphql`), /productVariantsBulkDelete/);
  assert.match(pruefe(`npx ${BASIS} --query-file=${f}`), /productVariantsBulkDelete/);
});

test('Fallback-Theme wird gesperrt, auch ueber die Variablendatei', () => {
  const q = datei('thema.graphql', 'mutation($id: ID!) { themeUpdate(id: $id, input: {name: "x"}) { theme { id } } }');
  const v = datei('thema.json', JSON.stringify({ id: `gid://shopify/OnlineStoreTheme/${FALLBACK}` }));
  assert.match(pruefe(`${BASIS} --query-file ${q} --variable-file ${v}`), /Fallback/);
});

test('Datenpflege laeuft durch: Preise, productSet, Archivieren, Metafelder', () => {
  const q = datei('preis.graphql', 'mutation($id: ID!) { productUpdate(product: {id: $id, status: ARCHIVED}) { product { id } } }');
  const v = datei('preis.json', '{"id":"gid://shopify/Product/1"}');
  assert.equal(pruefe(`${BASIS} --query-file ${q} --variable-file ${v} --json`), null);
  assert.equal(pruefe(`${BASIS} --query 'mutation { metafieldsSet(metafields: []) { userErrors { message } } }'`), null);
  assert.equal(pruefe(`${BASIS} --query 'mutation productDelete($x: ID) { productUpdate(product: {id: $x}) { product { id } } }' -v '{}'`), null, 'Operationsname ist kein Aufruf');
});

test('reine Abfragen und andere Befehle bleiben unberuehrt', () => {
  assert.equal(pruefe("shopify store execute -s s --query '{ products(first: 1) { nodes { id } } }'"), null);
  assert.equal(pruefe('shopify store execute -s s --query-file "$f"'), null, 'ohne --allow-mutations lehnt die CLI selbst ab');
  assert.equal(pruefe("grep -n 'productDelete' .claude/hooks/shopify-mcp-guard.mjs"), null);
  assert.equal(pruefe("echo 'shopify store execute --allow-mutations'"), null);
  assert.equal(pruefe(null), null);
});

test('Abfrage erst beim Lauf bekannt: Befehlstext und Platzhalter werden durchsucht', () => {
  fs.mkdirSync(path.join(ordner, 'stapel'), { recursive: true });
  fs.writeFileSync(path.join(ordner, 'stapel', 'a.gql'), 'mutation { metafieldsSet(metafields: []) { userErrors { message } } }');
  const schleife = `for f in stapel/*.gql; do ${BASIS} --query-file "$f"; done`;
  assert.equal(pruefe(schleife), null, 'Massenlauf ohne Loeschen laeuft');
  fs.writeFileSync(path.join(ordner, 'stapel', 'b.gql'), 'mutation { productDelete(input: {id: "x"}) { deletedProductId } }');
  assert.match(pruefe(schleife), /productDelete/);
  fs.rmSync(path.join(ordner, 'stapel', 'b.gql'));
  assert.match(pruefe(`cat > neu.gql <<E\nmutation { fileDelete(fileIds: ["a"]) { deletedFileIds } }\nE\n${BASIS} --query-file neu.gql`), /fileDelete/, 'Datei entsteht im selben Befehl');
  assert.equal(pruefe(`${BASIS} --query-file fehlt.graphql`), null);
  assert.equal(pruefe(`${BASIS} --query "$(cat a.graphql)"`), null);
  assert.match(pruefe(`${BASIS} --query-file "$f" # theme ${FALLBACK}`), /Fallback/);
});

test('Variablen aus einer Schleife stoeren nicht, die Abfrage bleibt geprueft', () => {
  const gut = datei('massen.graphql', 'mutation($p: ProductSetInput!) { productSet(input: $p) { product { id } } }');
  assert.equal(pruefe(`for f in ps/*.json; do ${BASIS} --query-file ${gut} --variable-file "$f"; done`), null);
  const weg = datei('massen-weg.graphql', 'mutation($id: ID!) { productDelete(input: {id: $id}) { deletedProductId } }');
  assert.match(pruefe(`for f in ps/*.json; do ${BASIS} --query-file ${weg} --variable-file "$f"; done`), /productDelete/);
  assert.equal(pruefe(`${BASIS} --query 'mutation { metafieldsSet(metafields: []) { userErrors { message } } }' -v 'kein json'`), null);
});

test('Review-Faelle: Umgebungsvariable, Klammern, verschachtelt, offene Variablen', () => {
  const weg = "--query 'mutation { productDelete(input: {id: \"x\"}) { deletedProductId } }'";
  assert.match(pruefe(`export SHOPIFY_FLAG_ALLOW_MUTATIONS=true; shopify store execute -s s ${weg}`), /productDelete/);
  assert.match(pruefe(`(${BASIS} ${weg})`), /productDelete/);
  assert.match(pruefe(`{ ${BASIS} ${weg}; }`), /productDelete/);
  assert.match(pruefe(`x="$(${BASIS} ${weg})"`), /productDelete/);
  assert.match(pruefe(`x=\`${BASIS} ${weg}\``), /productDelete/);
  assert.match(pruefe(`bash -c "${BASIS} --query-file weg.graphql"`), /productVariantsBulkDelete/);
  const q = datei('thema2.graphql', 'mutation($id: ID!) { themeUpdate(id: $id, input: {name: "x"}) { theme { id } } }');
  assert.match(pruefe(`vars='{"id":"gid://shopify/OnlineStoreTheme/${FALLBACK}"}'; ${BASIS} --query-file ${q} --variables "$vars"`), /Fallback/);
  fs.mkdirSync(path.join(ordner, 'vs'), { recursive: true });
  fs.writeFileSync(path.join(ordner, 'vs', 'a.json'), JSON.stringify({ id: `gid://shopify/OnlineStoreTheme/${FALLBACK}` }));
  assert.match(pruefe(`for f in vs/*.json; do ${BASIS} --query-file ${q} --variable-file "$f"; done`), /Fallback/);
});

test('zweiter Aufruf in einer Kette wird mitgeprueft; Trenner im Text trennen nicht', () => {
  const gut = datei('gut.graphql', 'mutation { metafieldsSet(metafields: []) { userErrors { message } } }');
  assert.match(pruefe(`${BASIS} --query-file ${gut} && ${BASIS} --query 'mutation { fileDelete(fileIds: ["a"]) { deletedFileIds } }'`), /fileDelete/);
  assert.deepEqual(zerlege("a 'b; c' && d").map(s => s.map(w => w.text)), [['a', 'b; c'], ['d']]);
  assert.equal(zerlege('a "$x"')[0][1].offen, true);
  assert.equal(zerlege("a '$x'")[0][1].offen, false);
});

test('als Hook: deny bei Loeschen, still sonst, kaputte Eingabe laeuft durch', () => {
  const lauf = input => spawnSync(process.execPath, [HOOK], { input, encoding: 'utf8' });
  const eingabe = command => JSON.stringify({ tool_name: 'Bash', cwd: ordner, tool_input: { command } });
  const r = lauf(eingabe(`${BASIS} --query 'mutation { productDelete(input: {id: "x"}) { deletedProductId } }'`));
  assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(lauf(eingabe('ls')).stdout, '');
  assert.equal(lauf('kein json').status, 0);
});
