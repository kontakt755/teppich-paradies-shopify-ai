/**
 * Haelt die Grenze in .claude/hooks/shopify-mcp-guard.mjs fest: Loeschen und
 * das Fallback-Theme sind gesperrt, freigegebene Datenpflege (Preise,
 * Metafelder, productSet, Veroeffentlichen) laeuft durch.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const hook = path.resolve(import.meta.dirname, '../../.claude/hooks/shopify-mcp-guard.mjs');
const { pruefe } = await import(hook);
const FALLBACK = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, '../../domains/shopify/live-theme.json'), 'utf8'),
).fallback.themeId;

/** Entscheidung des Hooks als Prozess: 'deny' oder null (durchgelassen). */
function entscheidung(toolInput, roh) {
  const res = spawnSync(process.execPath, [hook], {
    input: roh ?? JSON.stringify({ tool_name: 'mcp__x__graphql_mutation', tool_input: toolInput }),
    encoding: 'utf8',
  });
  assert.equal(res.status, 0, `Hook brach ab: ${res.stderr}`);
  if (!res.stdout.trim()) return null;
  return JSON.parse(res.stdout).hookSpecificOutput.permissionDecision;
}

const gesperrt = (query, variables) => pruefe({ query, variables }) !== null;

test('Hook-Prozess: verweigert productDelete mit deny', () => {
  assert.equal(
    entscheidung({ query: 'mutation { productDelete(input: {id: "gid://shopify/Product/1"}) { deletedProductId } }' }),
    'deny',
  );
});

test('Hook-Prozess: laesst productUpdate durch', () => {
  assert.equal(
    entscheidung({ query: 'mutation { productUpdate(product: {id: "gid://shopify/Product/1", status: ARCHIVED}) { product { id } } }' }),
    null,
  );
});

test('Hook-Prozess: kaputter Input blockiert nicht', () => {
  assert.equal(entscheidung(null, 'kein json'), null);
  assert.equal(entscheidung(null, '{}'), null);
  assert.equal(entscheidung({ query: 42 }), null);
  assert.equal(entscheidung({ query: 'mutation { ((( kaputt' }), null);
});

test('Hook-Prozess: Begruendung nennt Hook und Mutation', () => {
  const res = spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ tool_input: { query: 'mutation { menuDelete(id: "gid://shopify/Menu/9") { deletedMenuId } }' } }),
    encoding: 'utf8',
  });
  const grund = JSON.parse(res.stdout).hookSpecificOutput.permissionDecisionReason;
  assert.match(grund, /shopify-mcp-guard\.mjs/);
  assert.match(grund, /menuDelete/);
});

test('themeDelete ist immer gesperrt', () => {
  assert.ok(gesperrt('mutation { themeDelete(id: "gid://shopify/OnlineStoreTheme/1") { deletedThemeId } }'));
  assert.ok(gesperrt('mutation T($id: ID!) { themeDelete(id: $id) { deletedThemeId } }', { id: 'gid://shopify/OnlineStoreTheme/1' }));
});

test('jede Mutation mit der Fallback-ID ist gesperrt', () => {
  const gid = `gid://shopify/OnlineStoreTheme/${FALLBACK}`;
  assert.ok(gesperrt(`mutation { themePublish(id: "${gid}") { theme { id } } }`));
  assert.ok(gesperrt('mutation P($id: ID!) { themePublish(id: $id) { theme { id } } }', { id: gid }));
  assert.ok(gesperrt('mutation U($id: ID!, $i: OnlineStoreThemeInput!) { themeUpdate(id: $id, input: $i) { theme { id } } }', { id: gid, i: { name: 'x' } }));
  assert.ok(gesperrt('mutation F($t: ID!, $f: [OnlineStoreThemeFilesUpsertFileInput!]!) { themeFilesUpsert(themeId: $t, files: $f) { upsertedThemeFiles { filename } } }', { t: gid, f: [] }));
  // Nackte Zahl genuegt.
  assert.ok(gesperrt(`mutation { themeUpdate(id: "gid://shopify/OnlineStoreTheme/${FALLBACK}", input: {name: "x"}) { theme { id } } }`));
});

test('Theme-Mutationen auf andere Themes laufen durch', () => {
  assert.equal(gesperrt('mutation { themeUpdate(id: "gid://shopify/OnlineStoreTheme/1", input: {name: "x"}) { theme { id } } }'), false);
  assert.equal(gesperrt('mutation F($t: ID!, $f: [OnlineStoreThemeFilesUpsertFileInput!]!) { themeFilesUpsert(themeId: $t, files: $f) { upsertedThemeFiles { filename } } }', {
    t: 'gid://shopify/OnlineStoreTheme/1',
    f: [{ filename: 'snippets/a.liquid', body: { type: 'TEXT', value: 'x' } }],
  }), false);
  // Eine laengere Zahl, die die Fallback-ID nur enthaelt, ist eine andere ID.
  assert.equal(gesperrt(`mutation { themeUpdate(id: "gid://shopify/OnlineStoreTheme/9${FALLBACK}", input: {name: "x"}) { theme { id } } }`), false);
});

test('Loeschmutationen mit IDs sind gesperrt', () => {
  for (const [query, variables] of [
    ['mutation { productDelete(input: {id: "gid://shopify/Product/1"}) { deletedProductId } }'],
    ['mutation { productDelete(input: {id: "gid://shopify/Product/1"}, synchronous: true) { deletedProductId } }'],
    ['mutation D($input: ProductDeleteInput!) { productDelete(input: $input) { deletedProductId } }', { input: { id: 'gid://shopify/Product/1' } }],
    ['mutation productDelete($id: ID!) { productDelete(input: {id: $id}) { deletedProductId } }', { id: 'gid://shopify/Product/1' }],
    ['mutation { productVariantsBulkDelete(productId: "gid://shopify/Product/1", variantsIds: ["gid://shopify/ProductVariant/2"]) { product { id } } }'],
    ['mutation V($p: ID!, $v: [ID!]!) { productVariantsBulkDelete(productId: $p, variantsIds: $v) { product { id } } }', { p: 'gid://shopify/Product/1', v: ['gid://shopify/ProductVariant/2', 'gid://shopify/ProductVariant/3'] }],
    ['mutation { collectionDelete(input: {id: "gid://shopify/Collection/1"}) { deletedCollectionId } }'],
    ['mutation { menuDelete(id: "gid://shopify/Menu/1") { deletedMenuId } }'],
    ['mutation { discountCodeDelete(id: "gid://shopify/DiscountCodeNode/1") { deletedCodeDiscountId } }'],
    ['mutation { fileDelete(fileIds: ["gid://shopify/MediaImage/1"]) { deletedFileIds } }'],
    ['mutation { alias: fileDelete(fileIds: "gid://shopify/MediaImage/1") { deletedFileIds } }'],
    // Hinter einer erlaubten Mutation in derselben Anfrage.
    ['mutation { metafieldsSet(metafields: []) { userErrors { message } } menuDelete(id: "gid://shopify/Menu/1") { deletedMenuId } }'],
    // Kommentare und Zeilenumbrueche aendern nichts.
    ['mutation {\n  # aufraeumen\n  productDelete(\n    input: { id: "gid://shopify/Product/1" }\n  ) { deletedProductId }\n}'],
  ]) {
    assert.ok(gesperrt(query, variables), query);
  }
});

test('Loeschmutationen ohne ID laufen durch', () => {
  assert.equal(gesperrt('mutation { fileDelete(fileIds: []) { deletedFileIds } }'), false);
  assert.equal(gesperrt('mutation V($p: ID!, $v: [ID!]!) { productVariantsBulkDelete(productId: $p, variantsIds: $v) { product { id } } }', { p: 'gid://shopify/Product/1', v: [] }), false);
});

test('freigegebene Datenpflege laeuft durch', () => {
  for (const [query, variables] of [
    ['mutation V($p: ID!, $v: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId: $p, variants: $v) { productVariants { id price } } }',
      { p: 'gid://shopify/Product/1', v: [{ id: 'gid://shopify/ProductVariant/2', price: '19.90', compareAtPrice: null }] }],
    ['mutation S($i: ProductSetInput!) { productSet(input: $i, synchronous: true) { product { id } } }', { i: { title: 'x' } }],
    ['mutation { productUpdate(product: {id: "gid://shopify/Product/1", status: ARCHIVED}) { product { id } } }'],
    ['mutation M($m: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $m) { metafields { id } } }', { m: [{ ownerId: 'gid://shopify/Product/1', namespace: 'custom', key: 'a', type: 'single_line_text_field', value: 'b' }] }],
    ['mutation { publishablePublish(id: "gid://shopify/Product/1", input: [{publicationId: "gid://shopify/Publication/2"}]) { userErrors { message } } }'],
    // Felder der Antwort, die nur so heissen wie eine Loeschung, sind keine.
    ['mutation { productUpdate(product: {id: "gid://shopify/Product/1"}) { product { id } } }'],
  ]) {
    assert.equal(gesperrt(query, variables), false, query);
  }
});

test('unlesbare Argumente einer Loeschung: grob nach IDs gezaehlt', () => {
  // Unbalancierte Klammer im Argument: der Leser gibt auf, der Name bleibt.
  assert.ok(gesperrt('mutation { productDelete(input: {id: "gid://shopify/Product/1" ) { deletedProductId } }'));
});
