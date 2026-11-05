// Werkbank w-111: die vier Serviceseiten haben oben und unten eine klare
// Hauptaktion (Anfrage, daneben Anrufen und WhatsApp), und eine Anfrage zaehlt
// erst nach Shopify-Bestaetigung als Ziel - mit Kampagnenfeld (w-030), nie
// beim Klick.
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const template = (name) => JSON.parse(read(join('templates', `${name}.json`)).replace(/^\/\*[\s\S]*?\*\//, ''));

const SEITEN = {
  'teppichboden-verlegen': 'sections/teppichboden-verlegen.liquid',
  'vinylboden-verlegen': 'sections/vinylboden-verlegen.liquid',
  treppenverlegung: 'sections/treppenverlegun.liquid',
  verlegeservice: 'sections/tp-verlegeservice.liquid',
};

test('jede Serviceseite zeigt die Hauptaktion im Einstieg', () => {
  for (const [vorlage, datei] of Object.entries(SEITEN)) {
    const code = read(datei);
    assert.match(code, /render 'tp-service-hauptaktion'/, `${datei}: keine Hauptaktion im Einstieg`);
    const t = template(`page.${vorlage}`);
    const erste = t.order.find((id) => !t.sections[id].disabled);
    assert.ok(datei.endsWith(`${t.sections[erste].type}.liquid`), `${vorlage}: Einstieg ist ${t.sections[erste].type}`);
  }
});

test('Hauptaktion: Anfrage auf derselben Seite, Anrufen und WhatsApp aus den Theme-Einstellungen', () => {
  const s = read('snippets/tp-service-hauptaktion.liquid');
  assert.match(s, /render 'tp-anfrage-ziel'/);
  assert.match(s, /settings\.tp_vs_telefon \| default: '03301 573 37 20'/);
  assert.match(s, /settings\.tp_vs_whatsapp \| default: '491792612211'/);
  assert.match(s, /href="tel:\{\{ sha_tel \}\}"/);
  assert.match(s, /href="https:\/\/wa\.me\/\{\{ sha_wa \}\}"/);
  // Rot bleibt Preis und Warenkorb vorbehalten (Skill theme-regeln).
  assert.doesNotMatch(s, /tp-hauptaktion|#c8102e|#b3261e/i);
  // Alle vier Vorlagen haben das Formular, sonst fuehrte #tp-anfrage ins Leere.
  const ziel = read('snippets/tp-anfrage-ziel.liquid');
  for (const vorlage of Object.keys(SEITEN)) assert.match(ziel, new RegExp(`\\b${vorlage}\\b`));
});

test('unten: ein Kontaktbereich mit dem Formular zuerst, kein doppelter Anfrage-Kasten', () => {
  for (const vorlage of Object.keys(SEITEN)) {
    const t = template(`page.${vorlage}`);
    assert.equal(t.sections.tp_anfrage?.disabled, undefined, `${vorlage}: Formular fehlt`);
    assert.equal(t.sections.tp_anfrage.settings.formular_zuerst, true, `${vorlage}: Formular nicht zuerst`);
    const doppelt = Object.entries(t.sections).filter(([, s]) => s.type === 'final-cta' && !s.disabled);
    assert.deepEqual(doppelt.map(([id]) => id), [], `${vorlage}: zweiter Anfrage-Kasten direkt vor dem Kontaktbereich`);
  }
});

test('Pruefung 05.11.: Anfrageknoepfe mit eigenem Formular laufen ueber den Anker, sonst laedt die Seite neu', () => {
  const ziel = read('snippets/tp-anfrage-ziel.liquid');
  assert.match(ziel, /elsif taz_eigen != blank and ziel contains '#tp-anfrage'\s+echo taz_eigen/);
  // Jede Stelle, deren Link in den Vorlagen mit Pfad auf #tp-anfrage zeigt, geht durch das Snippet.
  for (const [datei, einstellung] of [
    ['snippets/tp-service-hauptaktion.liquid', 'ziel'],
    ['sections/treppenverlegun.liquid', 'section.settings.hero_cta_ziel'],
    ['sections/tp-treppen-ausfuehrung.liquid', 'section.settings.cta_ziel'],
    ['sections/tp-verlegeservice-kontakt.liquid', 'section.settings.kontakt_link'],
    ['sections/tp-verlegegebiet.liquid', 'section.settings.cta_link'],
  ]) {
    const code = read(datei);
    assert.ok(code.includes(`render 'tp-anfrage-ziel', ziel: ${einstellung}`), `${datei}: ${einstellung} laeuft nicht durch tp-anfrage-ziel`);
    assert.ok(!code.includes(`href="{{ ${einstellung}`), `${datei}: ${einstellung} steht roh im Link`);
  }
  assert.ok(!read('sections/tp-verlegegebiet.liquid').includes('data-cta-url="{{ section.settings.cta_link'));
});

test('Pruefung 05.11.: das Herkunftsfeld fuellt das Layout, auch auf der Kontaktseite', () => {
  assert.match(read('layout/theme.liquid'), /render 'tp-herkunft'/);
  assert.doesNotMatch(read('sections/tp-start-kontakt.liquid'), /URLSearchParams/);
  assert.match(read('sections/contact-form.liquid'), /name="contact\[Herkunft\]" value="" data-tp-herkunft disabled>/);
});

test('Pruefung 05.11.: Verlegeseiten ohne eigenes Formular oeffnen die Kontaktseite mit PLZ und Telefon', () => {
  for (const [vorlage, einstellung] of [
    ['boden-malerarbeiten', 'anfrage_link'],
    ['unsere-arbeit', 'cta_link'],
    ['wohnungsunternehmen', 'primary_btn_link'],
    ['firmenkunden', 'primary_btn_link'],
  ]) {
    const t = template(`page.${vorlage}`);
    const links = Object.values(t.sections).map((s) => s.settings?.[einstellung]).filter(Boolean);
    assert.ok(links.length, `${vorlage}: ${einstellung} fehlt`);
    for (const l of links) assert.equal(l, '/pages/kontakt?thema=verlegung', `${vorlage}: ${l}`);
  }
  // Das Telefon heisst wie im Formular der Verlegeseiten, sonst liest es der Mail-Leser nicht.
  const kontakt = read('sections/contact-form.liquid');
  assert.match(kontakt, /name="contact\[Telefon\]"/);
  assert.doesNotMatch(kontakt, /<input[^>]*type="tel"[^>]*required/);
  assert.match(read('sections/tp-start-kontakt.liquid'), /Telefon \(optional\)<input type="tel" name="contact\[Telefon\]" autocomplete="tel">/);
});

// --- Ziel zaehlen: snippets/tp-lead-events.liquid in einer Mini-Umgebung -----

function umgebung({ adresse = '/pages/vinylboden-verlegen', speicher = new Map() } = {}) {
  const gemeldet = [];
  const lauscher = {};
  const herkunft = { value: '' };
  const anliegen = { value: 'Boden verlegen lassen' };
  const form = {
    id: 'tp-start-anfrage',
    matches: (sel) => sel === 'form[action*="/contact"]',
    closest: () => null,
    querySelector: (sel) => (sel.includes('Anliegen') ? anliegen : sel === '[data-tp-herkunft]' ? herkunft : null),
  };
  const marker = { closest: () => form };
  let bestaetigt = false;
  const document = {
    readyState: 'complete',
    addEventListener: (typ, fn) => { (lauscher[typ] ||= []).push(fn); },
    querySelectorAll: (sel) => (sel === '[data-tp-lead-success]' && bestaetigt ? [marker] : []),
  };
  const sessionStorage = {
    getItem: (k) => (speicher.has(k) ? speicher.get(k) : null),
    setItem: (k, v) => speicher.set(k, String(v)),
    removeItem: (k) => speicher.delete(k),
  };
  const window = {
    location: { pathname: adresse },
    Shopify: { analytics: { publish: (name, daten) => gemeldet.push({ name, ...daten }) } },
  };
  const code = read('snippets/tp-lead-events.liquid').match(/<script>([\s\S]*?)<\/script>/)[1];
  const laden = () => vm.runInNewContext(code, { window, document, sessionStorage, Object, JSON, String });
  return {
    gemeldet, speicher, herkunft, anliegen, form, laden,
    bestaetigen() { bestaetigt = true; },
    absenden() { for (const fn of lauscher.submit || []) fn({ target: form }); },
    klick(href) { for (const fn of lauscher.click || []) fn({ target: { closest: () => ({ getAttribute: (a) => (a === 'href' ? href : null), textContent: 'Anfrage senden' }) } }); },
  };
}

test('Ziel: der Klick auf Absenden zaehlt nicht, erst die bestaetigte Anfrage - mit Kampagnenfeld', () => {
  const vorher = umgebung();
  vorher.laden();
  vorher.herkunft.value = 'Google-Anzeige · Kampagne Vinyl verlegen';
  vorher.klick('#tp-anfrage');
  vorher.absenden();
  assert.deepEqual(vorher.gemeldet, [], 'Absenden allein ist kein Ziel');

  // Bestaetigungsseite: neuer Seitenaufruf ohne Kampagnenparameter, gleicher Tab.
  const nachher = umgebung({ speicher: vorher.speicher });
  nachher.bestaetigen();
  nachher.laden();
  assert.equal(nachher.gemeldet.length, 1);
  assert.deepEqual(nachher.gemeldet[0], {
    name: 'tp_lead_form_submit',
    page: '/pages/vinylboden-verlegen',
    form: 'tp-start-anfrage',
    herkunft: 'Google-Anzeige · Kampagne Vinyl verlegen',
    anliegen: 'Boden verlegen lassen',
  });
  assert.equal(nachher.speicher.size, 0, 'nichts bleibt auf dem Geraet liegen');

  // Neu laden der Bestaetigungsseite zaehlt nicht noch einmal.
  const neuGeladen = umgebung({ speicher: nachher.speicher });
  neuGeladen.bestaetigen();
  neuGeladen.laden();
  assert.deepEqual(neuGeladen.gemeldet, []);
});

test('Ziel: ohne Kampagne bleibt die Herkunft leer, Musteranfragen zaehlen getrennt', () => {
  const ohne = umgebung();
  ohne.laden();
  ohne.absenden();
  const ok = umgebung({ speicher: ohne.speicher });
  ok.bestaetigen();
  ok.laden();
  assert.equal(ok.gemeldet[0].name, 'tp_lead_form_submit');
  assert.equal(ok.gemeldet[0].herkunft, '');

  const muster = umgebung();
  muster.laden();
  muster.anliegen.value = 'Muster bestellen';
  muster.absenden();
  const m = umgebung({ speicher: muster.speicher });
  m.bestaetigen();
  m.laden();
  assert.deepEqual(m.gemeldet.map((e) => e.name), ['tp_sample_form_submit']);
});

test('Ziel: ein kaputter Zwischeneintrag erfindet keine Anfrage', () => {
  const speicher = new Map([['tp_contact_info_tp-start-anfrage', '{kaputt']]);
  const u = umgebung({ speicher });
  u.bestaetigen();
  u.laden();
  assert.deepEqual(u.gemeldet, []);
});
