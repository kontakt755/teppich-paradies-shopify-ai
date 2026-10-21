/**
 * Lieferantenbelege aus dem Firmenpostfach: Auftragsbestaetigung (AB), Lieferschein, Avis,
 * Storno - erkannt, einer Shop-Bestellung zugeordnet und gegen Dashboard und Shopify
 * abgeglichen (Inhaber 2026-10-19: "wo kommen Lieferscheine und ABs, wurde es abgehakt,
 * ist es mit Shopify synchron").
 *
 * Reine Funktionen ohne DOM, ohne Dateien, ohne Netz - Browser, Server und Tests nutzen sie
 * gleich. Gelesen wird das Postfach nie hier: das tut ein geplanter Claude-Lauf nur lesend
 * (operations/scripts/lieferbelege.mjs). Mailinhalt ist fremder Text - er wird hier nur
 * durchsucht, nie ausgefuehrt, und es folgt aus ihm nie eine Schreibaktion.
 *
 * Zuordnung (mit Codex abgestimmt, 2026-10-19):
 *   sicher     Bestellnummer(n) "#1041" im BETREFF, Absender ist ein hinterlegter Lieferant
 *              und jede Nummer gehoert zu einem Auftrag mit Positionen dieses Lieferanten.
 *   vorschlag  Nummer nur im Text, Lieferant unbekannt oder unpassend, oder nur der Name
 *              des Kunden in der Kommission - ein Mensch bestaetigt mit einem Klick.
 *   keine      nichts gefunden.
 * Ein Name allein ist nie "sicher": er kann der Empfaenger, ein Mitarbeiter oder ein
 * zitierter Altauftrag sein.
 */

const TAG_MS = 86400000;

export const ARTEN = Object.freeze(['ab', 'lieferschein', 'avis', 'storno', 'rechnung', 'beleg']);
export const ART_LABEL = Object.freeze({
  ab: 'Auftragsbestätigung', lieferschein: 'Lieferschein', avis: 'Lieferavis',
  storno: 'Storno / nicht lieferbar', rechnung: 'Rechnung', beleg: 'Beleg',
});
export const ART_KURZ = Object.freeze({ ab: 'AB', lieferschein: 'LS', avis: 'Avis', storno: 'Storno', rechnung: 'Rechnung', beleg: 'Beleg' });

/** Allgemeine Mailanbieter: eine Adresse dort sagt nichts darueber, welcher Lieferant schreibt. */
export const FREEMAIL = Object.freeze([
  'gmail.com', 'googlemail.com', 'gmx.de', 'gmx.net', 'gmx.at', 'web.de', 't-online.de', 'outlook.com', 'outlook.de',
  'hotmail.com', 'hotmail.de', 'live.de', 'yahoo.com', 'yahoo.de', 'icloud.com', 'me.com', 'aol.com', 'freenet.de',
  'posteo.de', 'mail.de', 'arcor.de', 'online.de', 'ionos.de',
]);

/** Woerter unserer eigenen Firma - sie stehen in fast jedem Beleg und sind keine Kommission. */
const EIGENE_WOERTER = ['teppich', 'paradies', 'oranienburg', 'gmbh', 'saarlandstrasse', 'saarlandstr', 'kontakt'];
/** Haeufige Nachnamen, die zugleich Farben oder Allerweltswoerter sind - kein Namenstreffer. */
const MEHRDEUTIG = new Set(['schwarz', 'weiss', 'braun', 'grau', 'roth', 'rot', 'gruen', 'blau', 'beige', 'sand', 'creme',
  'gold', 'silber', 'natur', 'eiche', 'engel', 'volk', 'kaiser', 'koenig', 'winter', 'sommer', 'stein', 'berg', 'wald',
  'bauer', 'lange', 'kurz', 'klein', 'gross', 'muster', 'ware', 'auftrag', 'bestellung', 'lieferung', 'nachlieferung',
  'mitnahme', 'familie', 'herr', 'frau', 'firma', 'telef', 'telefon', 'email', 'mail']);

/** ae/oe/ue/ss statt Umlauten - Gross-/Kleinschreibung bleibt. */
export function ohneUmlaute(text) {
  return String(text ?? '').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss');
}

/** Zum Vergleichen: klein, ohne Umlaute, ohne Akzente. */
export function normalisiere(text) {
  return ohneUmlaute(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** "Name <a@b.de>" -> "b.de"; null ohne gueltige Adresse. */
export function domainVon(adresse) {
  return adresseVon(adresse)?.split('@').at(-1) || null;
}

/** Vollstaendige Mailadresse ohne Anzeigename, fuer Vergleich und Gruppierung. */
export function adresseVon(von) {
  const text = String(von || '').trim();
  // Eine Adresse im Anzeigenamen ist keine Absenderadresse. Mehrdeutige Listen oder
  // kaputte Klammern verknuepfen nichts; unterstuetzt sind ein Postfach oder Name <Postfach>.
  const klammer = text.match(/^[^<>]*<\s*([^<>]+?)\s*>\s*$/);
  const adresse = klammer ? klammer[1].trim() : text;
  const gueltig = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(adresse);
  const lokal = adresse.split('@')[0];
  return gueltig && adresse.length <= 254 && lokal.length <= 64 && !/(^\.|\.$|\.\.)/.test(lokal) ? adresse.toLowerCase() : null;
}

/**
 * Nur der neue Teil einer Mail: zitierte Verlaeufe ("Am ... schrieb", "Von:", "-----Original",
 * Zeilen mit ">") nennen alte Auftraege und duerfen nichts zuordnen.
 */
export function aktuellerTeil(text) {
  const zeilen = String(text ?? '').split(/\r?\n/);
  const ende = zeilen.findIndex(z => /^\s*>/.test(z)
    || /^\s*(von|from|gesendet|sent):\s/i.test(z)
    || /^-{2,}\s*(original|urspr|weitergeleitet|forwarded)/i.test(z)
    || /^\s*am .{4,80}schrieb/i.test(z)
    || /^\s*on .{4,80}wrote/i.test(z));
  return (ende === -1 ? zeilen : zeilen.slice(0, ende)).join('\n');
}

const MUSTER = {
  // Reihenfolge = Vorrang: eine Abwesenheitsnotiz auf unsere Bestellung ist kein Beleg,
  // ein Storno in einer AB-Antwort ist ein Storno.
  ignorieren: /automatische antwort|abwesenheit|out of office|autoreply|auto-reply|nicht im buero|nicht erreichbar bis/,
  storno: /storniert|stornierung|\bstorno\b|nicht mehr (im sortiment|lieferbar|verfuegbar|erhaeltlich|produziert)|nicht lieferbar|ausverkauft|kann nicht geliefert|nicht liefern koennen|leider .{0,40}entfaellt|cancel+ed|annul/,
  lieferschein: /lieferschein|delivery note|pakbon|versandbestaetigung|versandmitteilung|versandanzeige|zum versand gebracht|wurde (heute )?versandt|ist unterwegs|sendungsverfolgung|tracking/,
  avis: /\bavis|avisierung|liefertermin|anlieferung|zustelltermin|wird .{0,40}zugestellt/,
  rechnung: /rechnung|invoice|gutschrift|factuur/,
  ab: /auftragsbest|auftr\.?\s*-?\s*best|order ?confirmation|orderbevestiging|bestellbest|bestaetigung|\bab\b|\bauftrag[_ ]?\d|confirmation de commande/,
  angebot: /\bangebot|offerte|quotation/,
};

/**
 * Welche Art Beleg ist die Mail?
 * @param {{von?: string, betreff?: string, text?: string, anhaenge?: string[]}} mail
 * @param {{eigeneDomain?: string}} [opt]
 * @returns {{art: string, grund: string}} art aus ARTEN oder 'ignorieren'
 */
export function klassifiziere(mail, { eigeneDomain = 'teppich-paradies.net' } = {}) {
  const domain = domainVon(mail?.von);
  if (domain && eigeneDomain && domain === eigeneDomain) return { art: 'ignorieren', grund: 'eigene Mail' };
  const betreff = normalisiere(mail?.betreff);
  const anhaenge = normalisiere((mail?.anhaenge || []).join(' '));
  const kopf = `${betreff}\n${anhaenge}`;
  const text = normalisiere(aktuellerTeil(mail?.text).slice(0, 2500));
  if (MUSTER.ignorieren.test(betreff)) return { art: 'ignorieren', grund: 'Abwesenheitsnotiz' };
  if (MUSTER.storno.test(kopf) || MUSTER.storno.test(text)) return { art: 'storno', grund: 'Storno oder nicht lieferbar' };
  if (MUSTER.lieferschein.test(kopf)) return { art: 'lieferschein', grund: 'Lieferschein im Betreff/Anhang' };
  if (MUSTER.avis.test(kopf)) return { art: 'avis', grund: 'Liefertermin angekündigt' };
  if (MUSTER.rechnung.test(kopf)) return { art: 'rechnung', grund: 'Rechnung' };
  if (MUSTER.ab.test(kopf)) return { art: 'ab', grund: 'Auftragsbestätigung' };
  if (MUSTER.angebot.test(kopf)) return { art: 'ignorieren', grund: 'Angebot, kein Beleg' };
  // Ohne klares Stichwort im Betreff: der Text entscheidet - sonst ist es nur ein Beleg mit Anhang.
  if (MUSTER.lieferschein.test(text)) return { art: 'lieferschein', grund: 'Versand im Text' };
  if (MUSTER.ab.test(text)) return { art: 'ab', grund: 'Bestätigung im Text' };
  if ((mail?.anhaenge || []).length) return { art: 'beleg', grund: 'Mail mit Anhang ohne klare Belegart' };
  return { art: 'ignorieren', grund: 'kein Beleg erkennbar' };
}

const NUMMER_NACH_WORT = /(?:auftragsbest\w*|auftr\.?\s*-?\s*best\.?|orderbevestiging|order\s*confirmation|bestellbest\w*|lieferschein(?:nr\.?)?|vorgang|auftrag(?:snummer|s?-?nr\.?)?|\bab\b|belegnummer|rechnung(?:snummer)?)\s*[:#_-]?\s*(?:nr\.?\s*)?([A-Z]{0,4}\d[\dA-Z]*(?:[/._-]\d[\dA-Z]*)*)/i;
const NUMMER_FREI = /(?:^|[\s,;|(])([A-Z]{0,4}\d{5,}[A-Z]{0,4}(?:[/-]\d+)*)(?=$|[\s,;|)])/;
const KOMMISSION_MARKER = /(?:kommission|komm\.|ihre referenz|referenz|reference|bauvorhaben|\bbv\b|betreff|bestellzeichen|\bpo\b)\s*[:.]?\s*/i;

/** Woerter fuer den Namensvergleich: klein, ohne Umlaute, mindestens 3 Buchstaben, ohne unsere Firma. */
export function woerterVon(text) {
  return [...new Set(normalisiere(text).split(/[^a-z]+/).filter(w => w.length >= 3
    && !EIGENE_WOERTER.some(e => e === w || (w.length >= 4 && e.startsWith(w)))))];
}

function bereinige(text) {
  let t = String(text ?? '').replace(/teppich[\s-]*parad\w*|oranienbu\w*|\bgmbh\b/gi, ' ').replace(/[_]+/g, ' ').replace(/\s{2,}/g, ' ').replace(/^[\s:;,|/()-]+|[\s:;,|/()-]+$/g, '');
  // Abgeschnittener Betreff endet oft mitten in unserem Namen ("... Oran").
  const letztes = normalisiere(t.split(' ').at(-1));
  if (letztes.length >= 3 && EIGENE_WOERTER.some(e => e.startsWith(letztes))) t = t.split(' ').slice(0, -1).join(' ');
  return t.replace(/[\s:;,|/()-]+$/g, '').slice(0, 160);
}

/**
 * Was steht an Bezuegen in der Mail?
 * @returns {{betreffNummern: string[], textNummern: string[], belegnummer: string|null, kommission: string|null, woerter: string[]}}
 *   betreffNummern/textNummern: unsere Bestellnummern ("#1041"), getrennt nach Fundort
 */
export function referenzen(mail) {
  const betreff = ohneUmlaute(mail?.betreff);
  const text = ohneUmlaute(aktuellerTeil(mail?.text)).slice(0, 4000);
  const nummern = s => [...new Set([...String(s).matchAll(/#\s?(\d{4,6})\b/g)].map(m => `#${m[1]}`))];
  const betreffNummern = nummern(betreff);
  const textNummern = nummern(text).filter(n => !betreffNummern.includes(n));

  const nachWort = betreff.match(NUMMER_NACH_WORT) || (mail?.anhaenge || []).map(a => ohneUmlaute(a).match(NUMMER_NACH_WORT)).find(Boolean);
  const frei = nachWort ? null : betreff.match(NUMMER_FREI);
  const belegnummer = (nachWort?.[1] || frei?.[1] || null);

  // Kommission: was hinter "Kommission/Referenz/Betreff/BV" steht - sonst der Rest des Betreffs
  // hinter der Belegnummer (Lieferant-A-Stil "Auftr.-Best. KD050/0217 NAME").
  let kommission = null;
  const marker = betreff.match(KOMMISSION_MARKER);
  if (marker) kommission = betreff.slice(marker.index + marker[0].length).split(/\s\|\s|\bvom\s+\d/)[0];
  else if (belegnummer) {
    const ab = betreff.indexOf(belegnummer) + belegnummer.length;
    kommission = betreff.slice(ab).split(/\s\|\s|\bvom\s+\d/)[0];
  }
  const ausText = text.match(/(?:kommission|bauvorhaben|ihre referenz)[^:\n]{0,30}:\s*([^\n]{2,80})/i)?.[1] || null;
  kommission = bereinige(kommission?.replace(/#\s?\d{4,6}\)?/g, '')) || bereinige(ausText) || null;
  const woerter = woerterVon([kommission, ausText].filter(Boolean).join(' '));
  return { betreffNummern, textNummern, belegnummer, kommission, woerter };
}

/** Lieferant zur Absenderdomain: aus den Stammdaten (postfachDomains, sonst Domains der Bestelladressen) oder einer Entscheidung. */
export function lieferantZurDomain(domain, { stammdaten = null, absender = {} } = {}) {
  if (!domain || FREEMAIL.includes(domain)) return null;
  const entscheidung = absender?.[domain];
  if (entscheidung?.art === 'lieferant' && entscheidung.lieferant) return entscheidung.lieferant;
  for (const [id, l] of Object.entries(stammdaten?.lieferanten || {})) {
    const domains = [...(l.postfachDomains || []), domainVon(l.ware?.mail), domainVon(l.muster?.mail)].filter(Boolean).map(d => d.toLowerCase());
    if (domains.some(d => d === domain || domain.endsWith(`.${d}`))) return id;
  }
  return null;
}

/**
 * Bestellungen in der Form, die die Zuordnung braucht - aus den Zeilen von /api/kunden/bestellungen
 * (bzw. bestellliste() im Server) und dem Auftragsfluss. Testbestellungen und Stornierte zaehlen nicht.
 */
export function kandidatenAus(bestellzeilen = [], statusAlle = {}) {
  return (bestellzeilen || []).filter(z => z?.auftrag && !z.testbestellung && !z.storniert).map(z => {
    const positionen = (z.auftrag.positionen || []).filter(p => p.lineItemId).map(p => ({
      lineItemId: p.lineItemId, lieferant: p.lieferant || null, istMuster: !!p.istMuster, titel: p.titel || null,
      // menge = in Shopify noch offene Menge, mengeBestellt = bestellte (bestelluebersicht.mjs);
      // fehlt sie, gilt der Status der Bestellung. Teil: von dieser Position ist schon etwas raus.
      shopifyOffen: typeof p.menge === 'number' && !p.eigenleistung ? p.menge > 0 : null,
      shopifyTeil: typeof p.menge === 'number' && typeof p.mengeBestellt === 'number' && !p.eigenleistung ? p.menge > 0 && p.menge < p.mengeBestellt : null,
      eintrag: statusAlle?.[`${z.orderId}::${p.lineItemId}`] || null,
    }));
    return {
      orderId: z.orderId, orderName: z.orderName, kundenname: z.kundenname && z.kundenname !== '–' ? z.kundenname : null,
      datum: z.datum || null, fulfillmentstatus: z.fulfillmentstatus || null, versandHinweis: z.versandHinweis || null,
      lieferanten: [...new Set(positionen.map(p => p.lieferant).filter(Boolean))],
      positionen,
    };
  });
}

function nameTrifft(k, woerter) {
  if (!k.kundenname || !woerter.length) return false;
  const teile = woerterVon(k.kundenname);
  const nachname = teile.at(-1);
  if (!nachname || nachname.length < 4 || MEHRDEUTIG.has(nachname)) {
    // Mehrdeutiger Nachname: nur mit Vorname zusammen.
    return teile.length >= 2 && teile.every(t => woerter.includes(t));
  }
  return woerter.includes(nachname);
}

/** Gruppen einer Nummer: Buchstaben gross, Ziffern ohne fuehrende Nullen. "KD050/0212" -> KD, 50, 212. */
function nummernGruppen(nr) {
  return (ohneUmlaute(nr).toUpperCase().match(/[A-Z]+|\d+/g) || []).map(g => (/^\d/.test(g) ? g.replace(/^0+/, '') || '0' : g));
}

/**
 * Vorgangsnummer zum Vergleichen. "KD050/0212" und "KD050_212" (AB und Lieferschein desselben
 * Vorgangs) ergeben beide "KD|50|212". Mindestens eine Zifferngruppe mit drei Stellen: "14.10"
 * ist ein Datum, keine Vorgangsnummer.
 */
export function nummernSchluessel(nr) {
  const gruppen = nummernGruppen(nr);
  const ziffern = gruppen.filter(g => /^\d/.test(g));
  return ziffern.join('').length >= 4 && ziffern.some(g => g.length >= 3) ? gruppen.join('|') : null;
}

/**
 * Steht die Belegnummer in der Bestellnummer, die beim Bestellen notiert wurde?
 * 'voll': alle Gruppen der Belegnummer stehen dort in derselben Reihenfolge ("KD050/0198" in
 * "KD050/0198 KW 42"); 'teil': nur die letzte Zifferngruppe ("0198 / KW 42") - das reicht nur
 * fuer einen Vorschlag, "KD999/0198" waere sonst derselbe Vorgang (Codex-Review #1432). Eine
 * Belegnummer aus nur einer Zifferngruppe ist 'voll' nur, wenn die Notiz genau diese Zahl traegt.
 */
export function nummerNotiert(notiert, belegnummer) {
  const beleg = nummernGruppen(belegnummer);
  const ziffern = beleg.filter(g => /^\d/.test(g));
  const letzte = ziffern.at(-1);
  if (!notiert || !letzte || letzte.length < 3) return null;
  const dort = nummernGruppen(notiert);
  if (beleg.length > 1) {
    for (let i = 0; i + beleg.length <= dort.length; i += 1) if (beleg.every((g, j) => dort[i + j] === g)) return 'voll';
  } else if (dort.filter(g => /^\d/.test(g)).join('|') === letzte) return 'voll';
  // Eine nackte Nummer ("2026") steht sonst in jeder Notiz mit Jahreszahl oder Menge.
  return dort.includes(letzte) ? 'teil' : null;
}

/**
 * Welcher Bestellung gehoert der Beleg?
 * @param {{datum: string, lieferant: string|null, refs: object}} beleg
 * @param {object[]} kandidaten  kandidatenAus()
 * @returns {{stufe: 'sicher'|'vorschlag'|'keine', orderIds: string[], grund: string}}
 */
export function ordneZu(beleg, kandidaten = [], { abgelehnt = [] } = {}) {
  const belegZeit = Date.parse(beleg?.datum);
  const pool = (kandidaten || []).filter(k => {
    if (abgelehnt.includes(k.orderId)) return false;
    const t = Date.parse(k.datum);
    // Ein Beleg kommt nach der Bestellung - hoechstens vier Monate spaeter.
    return !Number.isFinite(belegZeit) || !Number.isFinite(t) || (t <= belegZeit + 2 * TAG_MS && t >= belegZeit - 120 * TAG_MS);
  });
  const refs = beleg?.refs || {};
  const lieferant = beleg?.lieferant || null;
  const passt = k => Boolean(lieferant) && k.lieferanten.includes(lieferant);
  const nachNummer = nummern => pool.filter(k => nummern.includes(k.orderName));

  if (refs.betreffNummern?.length) {
    const treffer = nachNummer(refs.betreffNummern);
    if (treffer.length && treffer.length === refs.betreffNummern.length && treffer.every(passt)) {
      return { stufe: 'sicher', orderIds: treffer.map(k => k.orderId), grund: `${refs.betreffNummern.join(', ')} im Betreff` };
    }
    if (treffer.length) {
      return { stufe: 'vorschlag', orderIds: treffer.map(k => k.orderId), grund: `${treffer.map(k => k.orderName).join(', ')} im Betreff – ${lieferant ? 'Lieferant passt nicht zu allen Positionen' : 'Absender ist kein hinterlegter Lieferant'}` };
    }
  }
  // Beim Bestellen notierte Bestellnummer des Lieferanten (Einkauf, "Als bestellt markieren").
  if (refs.belegnummer && lieferant) {
    const art = k => k.positionen.filter(p => p.lieferant === lieferant).map(p => nummerNotiert(p.eintrag?.lieferantBestellnummer, refs.belegnummer));
    const voll = pool.filter(k => art(k).includes('voll'));
    if (voll.length === 1) return { stufe: 'sicher', orderIds: [voll[0].orderId], grund: `Bestellnummer ${refs.belegnummer} wie beim Bestellen notiert` };
    const teil = voll.length ? voll : pool.filter(k => art(k).includes('teil'));
    if (teil.length) return { stufe: 'vorschlag', orderIds: teil.map(k => k.orderId), grund: voll.length ? `Bestellnummer ${refs.belegnummer} bei mehreren Bestellungen notiert` : `Teil der Nummer ${refs.belegnummer} beim Bestellen notiert` };
  }
  if (refs.textNummern?.length) {
    const treffer = nachNummer(refs.textNummern);
    if (treffer.length) return { stufe: 'vorschlag', orderIds: treffer.map(k => k.orderId), grund: `${treffer.map(k => k.orderName).join(', ')} im Mailtext` };
  }
  const woerter = refs.woerter || [];
  const namen = pool.filter(k => (!lieferant || passt(k)) && nameTrifft(k, woerter));
  if (namen.length && namen.length <= 3) {
    return { stufe: 'vorschlag', orderIds: namen.map(k => k.orderId), grund: `Name aus der Kommission „${refs.kommission}“` };
  }
  return { stufe: 'keine', orderIds: [], grund: namen.length > 3 ? 'Name passt zu mehreren Bestellungen' : 'keine Bestellnummer und kein Kundenname erkannt' };
}

/**
 * Zuordnung samt menschlicher Entscheidung: bestaetigt/abgelehnt/kein Shop-Auftrag gehen vor.
 * @returns {{stufe: 'bestaetigt'|'sicher'|'vorschlag'|'keine'|'kein_shop', orderIds: string[], grund: string}}
 */
export function zuordnungMitEntscheidung(beleg, kandidaten, { absender = {} } = {}) {
  const e = beleg?.entscheidung;
  if (e?.art === 'zugeordnet' && e.orderIds?.length) return { stufe: 'bestaetigt', orderIds: e.orderIds, grund: `zugeordnet von ${e.von || 'jemandem'}` };
  if (e?.art === 'kein_shop') return { stufe: 'kein_shop', orderIds: [], grund: `kein Shop-Auftrag (${e.von || 'entschieden'})` };
  const auto = ordneZu(beleg, kandidaten, { abgelehnt: e?.art === 'abgelehnt' ? e.orderIds || [] : [] });
  // Absender ist als "liefert nicht fuer den Shop" markiert: nur eine Bestellnummer im Betreff holt ihn zurueck.
  if (absender?.[beleg?.domain]?.art === 'kein_shop' && !(auto.stufe !== 'keine' && beleg?.refs?.betreffNummern?.length)) {
    return { stufe: 'kein_shop', orderIds: [], grund: 'Absender liefert nicht für den Shop' };
  }
  return auto;
}

const STUFEN = ['offen', 'bestellt', 'geliefert', 'raus', 'erledigt'];

/** Bei allgemeinen Mailanbietern ist nur dieselbe Mailadresse derselbe Absender. */
function gleicherAbsender(a, b) {
  const von = adresseVon(a.von);
  const gegen = adresseVon(b.von);
  const domain = von ? domainVon(von) : a.domain;
  const gegenDomain = gegen ? domainVon(gegen) : b.domain;
  if (!domain || domain !== gegenDomain) return false;
  if (!FREEMAIL.includes(domain)) return true;
  return Boolean(von) && von === gegen;
}

/**
 * Alle Belege zuordnen - und Belege desselben Vorgangs verknuepfen: Ein Lieferschein ohne
 * unsere Nummer gehoert zur Bestellung seiner AB, wenn Absender und Vorgangsnummer gleich sind
 * (sicher) oder er im selben Mailverlauf steht (Vorschlag).
 */
export function ordneAlleZu(belege = [], kandidaten = [], { absender = {} } = {}) {
  const mit = belege.map(b => ({ ...b, zuordnung: zuordnungMitEntscheidung(b, kandidaten, { absender }) }));
  const fest = mit.filter(b => ['sicher', 'bestaetigt'].includes(b.zuordnung.stufe));
  const nameVon = new Map(kandidaten.map(k => [k.orderId, k.orderName]));
  const nah = (a, b) => !Number.isFinite(Date.parse(a.datum)) || !Number.isFinite(Date.parse(b.datum)) || Math.abs(Date.parse(a.datum) - Date.parse(b.datum)) <= 120 * TAG_MS;
  // Alle Anker muessen auf dieselben Bestellungen zeigen - sonst ist es kein eindeutiger Vorgang.
  const einig = (anker) => {
    const ziele = [...new Set(anker.map(a => [...a.zuordnung.orderIds].sort().join(',')))];
    return ziele.length === 1 ? anker[0] : null;
  };
  return mit.map((b) => {
    // Die Vorgangsnummer schlaegt einen Namensvorschlag; Entscheidungen und sichere Treffer bleiben.
    if (!['keine', 'vorschlag'].includes(b.zuordnung.stufe)) return b;
    const abgelehnt = b.entscheidung?.art === 'abgelehnt' ? b.entscheidung.orderIds || [] : [];
    // Nennt der Beleg selbst Bestellnummern, muessen es genau die des Ankers sein - eine
    // abweichende spricht gegen die Verknuepfung (Codex-Nachpruefung #1432).
    const eigene = [...new Set([...(b.refs?.betreffNummern || []), ...(b.refs?.textNummern || [])])].sort();
    const gleich = s => eigene.join(',') === [...new Set(s.zuordnung.orderIds.map(id => nameVon.get(id)))].sort().join(',');
    const passt = s => s.id !== b.id && nah(s, b) && !s.zuordnung.orderIds.some(id => abgelehnt.includes(id))
      && (!eigene.length || gleich(s));
    const schluessel = nummernSchluessel(b.refs?.belegnummer);
    const vorgaenge = schluessel ? fest.filter(s => passt(s) && gleicherAbsender(s, b) && nummernSchluessel(s.refs?.belegnummer) === schluessel) : [];
    const vorgang = vorgaenge.length ? einig(vorgaenge) : null;
    if (vorgang) return { ...b, zuordnung: { stufe: 'sicher', orderIds: vorgang.zuordnung.orderIds, grund: `gleicher Vorgang wie ${belegMarke(vorgang)}` } };
    if (b.zuordnung.stufe !== 'keine' || vorgaenge.length) return b;
    const verlauf = b.threadId ? einig(fest.filter(s => passt(s) && s.threadId === b.threadId).concat([]).filter(Boolean)) : null;
    if (verlauf) return { ...b, zuordnung: { stufe: 'vorschlag', orderIds: verlauf.zuordnung.orderIds, grund: `im selben Mailverlauf wie ${belegMarke(verlauf)}` } };
    return b;
  });
}

export const STAND_LABEL = Object.freeze({ offen: 'noch nicht bestellt', bestellt: 'Bestellt', geliefert: 'Geliefert an uns', raus: 'An Kunden raus', erledigt: 'Erledigt' });

/** Schwaechster Schritt der Positionen eines Lieferanten in einem Auftrag. */
function standVon(positionen) {
  if (!positionen.length) return null;
  const rang = p => Math.max(0, STUFEN.indexOf(p.eintrag?.status || 'offen'));
  return STUFEN[Math.min(...positionen.map(rang))];
}

export const SHOPIFY_LABEL = Object.freeze({ FULFILLED: 'versendet', PARTIALLY_FULFILLED: 'teilweise versendet', UNFULFILLED: 'nicht versendet', ON_HOLD: 'zurückgehalten', SCHEDULED: 'geplant' });

/**
 * Abgleich je Auftrag und Lieferant: welche Belege, welcher Stand im Dashboard, was sagt Shopify -
 * und wo passt es nicht zusammen.
 *
 * @param {object} p
 * @param {object[]} p.belege       gespeicherte Belege mit `zuordnung` (zuordnungMitEntscheidung)
 * @param {object[]} p.kandidaten   kandidatenAus()
 * @param {Date} [p.jetzt]
 * @param {number} [p.tage]         wie weit zurueck Auftraege gezeigt werden (Bestelldatum)
 * @returns {{zeilen: object[], abweichungen: object[]}}
 */
export function abgleich({ belege = [], kandidaten = [], jetzt = new Date(), tage = 45 } = {}) {
  const jeAuftrag = new Map();
  for (const b of belege) {
    if (!['sicher', 'bestaetigt'].includes(b.zuordnung?.stufe)) continue;
    for (const id of b.zuordnung.orderIds) {
      if (!jeAuftrag.has(id)) jeAuftrag.set(id, []);
      jeAuftrag.get(id).push(b);
    }
  }
  const grenze = jetzt.getTime() - tage * TAG_MS;
  const zeilen = [];
  const abweichungen = [];
  const neueste = liste => [...liste].sort((a, b) => String(b.datum).localeCompare(String(a.datum)));
  // Nur Kennung, Art, Datum und Erledigt-Vermerk - den ganzen Beleg liefert die Belegliste.
  const kurz = (b, orderId) => (b ? { id: b.id, art: b.art, datum: b.datum, erledigt: offenFuer(b, orderId) ? null : (b.erledigt || b.quittiert?.[orderId] || null) } : null);
  for (const k of kandidaten) {
    const belegeHier = jeAuftrag.get(k.orderId) || [];
    const t = Date.parse(k.datum);
    if (!belegeHier.length && !(Number.isFinite(t) && t >= grenze)) continue;
    for (const lieferant of k.lieferanten) {
      const positionen = k.positionen.filter(p => p.lieferant === lieferant);
      const stand = standVon(positionen);
      // Lieferant des Belegs: Entscheidung, Absender - oder, ohne beides, der einzige Lieferant der
      // Bestellung. Bei mehreren bleibt ein Beleg unbekannter Herkunft keiner Zeile zugeschlagen.
      const eigene = belegeHier.filter((b) => {
        const von = b.entscheidung?.lieferant || b.lieferant;
        return von ? von === lieferant : k.lieferanten.length === 1;
      });
      // Nur, was beim Lieferanten bestellt wurde oder wozu ein Beleg kam - nicht jede offene Bestellung.
      if (stand === 'offen' && !eigene.length) continue;
      const bestelltAm = positionen.map(p => p.eintrag?.bestelltAm).filter(Boolean).sort()[0] || null;
      const der = art => neueste(eigene.filter(b => b.art === art))[0] || null;
      const ls = der('lieferschein') || der('avis');
      const zeile = {
        id: `${k.orderId}|${lieferant}`, orderId: k.orderId, orderName: k.orderName, kundenname: k.kundenname, lieferant,
        nurMuster: positionen.every(p => p.istMuster), bestelltAm, stand,
        ab: kurz(der('ab'), k.orderId), lieferschein: kurz(ls, k.orderId), storno: kurz(der('storno'), k.orderId),
        belege: eigene.map(b => b.id),
        shopify: shopifyStand(positionen, k.fulfillmentstatus), versandHinweis: k.versandHinweis || null,
        hinweise: [],
      };
      // Jeder offene Storno zaehlt - ein erledigter neuerer verdeckt keinen aelteren (Codex-Review #1432).
      const stornos = neueste(eigene.filter(b => b.art === 'storno' && offenFuer(b, k.orderId)));
      if (stornos.length) zeile.hinweise.push('storno');
      for (const b of stornos) {
        abweichungen.push({ id: `storno:${b.id}:${k.orderId}`, art: 'storno', ton: 'crit', orderId: k.orderId, orderName: k.orderName, kundenname: k.kundenname, lieferant, belegId: b.id, datum: b.datum });
      }
      const lsOffen = stand === 'bestellt' ? neueste(eigene.filter(b => b.art === 'lieferschein' && offenFuer(b, k.orderId)))[0] : null;
      if (lsOffen) {
        zeile.hinweise.push('lieferschein_offen');
        abweichungen.push({ id: `lieferschein:${lsOffen.id}:${k.orderId}`, art: 'lieferschein_offen', ton: 'warn', orderId: k.orderId, orderName: k.orderName, kundenname: k.kundenname, lieferant, belegId: lsOffen.id, datum: lsOffen.datum, nurMuster: zeile.nurMuster });
      }
      if (['raus', 'erledigt'].includes(stand) && zeile.shopify && zeile.shopify !== 'FULFILLED') zeile.hinweise.push('shopify_offen');
      if (stand === 'bestellt' && zeile.shopify === 'FULFILLED') zeile.hinweise.push('shopify_weiter');
      zeilen.push(zeile);
    }
    // Ein Storno, der keiner Lieferantenzeile zugeschlagen werden kann (Absender unbekannt, mehrere
    // Lieferanten), darf trotzdem nicht verschwinden (Codex-Nachpruefung #1432).
    for (const b of belegeHier) {
      const von = b.entscheidung?.lieferant || b.lieferant || null;
      const ohneZeile = von ? !k.lieferanten.includes(von) : k.lieferanten.length !== 1;
      if (!ohneZeile || b.art !== 'storno' || !offenFuer(b, k.orderId)) continue;
      abweichungen.push({ id: `storno:${b.id}:${k.orderId}`, art: 'storno', ton: 'crit', orderId: k.orderId, orderName: k.orderName, kundenname: k.kundenname, lieferant: von, belegId: b.id, datum: b.datum });
    }
  }
  zeilen.sort((a, b) => (b.hinweise.length - a.hinweise.length) || String(b.bestelltAm || '').localeCompare(String(a.bestelltAm || '')));
  return { zeilen, abweichungen };
}

/** Offen fuer diese Bestellung: weder ganz erledigt noch fuer diese Bestellung quittiert. */
function offenFuer(b, orderId) {
  return !b.erledigt && !b.quittiert?.[orderId];
}

/**
 * Versandstand in Shopify fuer die Positionen EINES Lieferanten. Die Bestellung als Ganzes ist
 * "teilweise versendet", wenn Ware von A raus ist und von B nicht - fuer A stimmt dann "versendet".
 */
function shopifyStand(positionen, gesamt) {
  const bekannt = positionen.map(p => p.shopifyOffen).filter(v => v === true || v === false);
  if (bekannt.length !== positionen.length || !bekannt.length) return gesamt || null;
  if (bekannt.every(v => !v)) return 'FULFILLED';
  if (!bekannt.every(v => v)) return 'PARTIALLY_FULFILLED';
  // Alles offen - aber vielleicht ist von einer Position schon ein Teil raus (10 bestellt, 5 offen).
  if (positionen.some(p => p.shopifyTeil === true)) return 'PARTIALLY_FULFILLED';
  if (positionen.every(p => p.shopifyTeil === false)) return 'UNFULFILLED';
  // Bestellte Menge unbekannt (aelterer Export): nur sicher, wenn auch die Bestellung nichts versendet hat.
  return gesamt === 'UNFULFILLED' || !gesamt ? 'UNFULFILLED' : gesamt;
}

export function belegMarke(beleg) {
  if (!beleg) return null;
  const d = beleg.datum ? new Date(beleg.datum) : null;
  const tag = d && !Number.isNaN(d.getTime()) ? `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.` : '';
  return `${ART_KURZ[beleg.art] || 'Beleg'}${tag ? ` ${tag}` : ''}`;
}

/** Belege ohne Bestellung zaehlen so lange als "zu pruefen" - aeltere stehen nur noch in der Liste. */
export const OFFEN_TAGE = 30;

/**
 * Offene Arbeit aus den Belegen - dieselbe Zaehlung fuer den Reiter "Belege" und fuer "Heute".
 * Zu pruefen sind nur Abweichungen und Vorschlaege. Belege ohne Shop-Bestellung sind meist
 * Laden- und Telefonbestellungen (Echtdaten 2026-10-19: 41 von 52) - sie stehen ruhig daneben
 * (`ohne`) und zaehlen nicht. Rechnungen sind Buchhaltung, keine Einkaufsarbeit.
 * @param {object} d  Antwort von /api/einkauf/belege
 * @returns {null|{abweichungen: object[], vorschlaege: object[], ohne: object[], summe: number}}
 */
export function belegArbeit(d, { jetzt = new Date() } = {}) {
  if (!d?.verfuegbar) return null;
  const offen = b => !b.erledigt;
  const belege = d.belege || [];
  const vorschlaege = belege.filter(b => offen(b) && b.zuordnung?.stufe === 'vorschlag');
  const ohne = belege.filter(b => offen(b) && b.zuordnung?.stufe === 'keine' && b.art !== 'rechnung'
    && jetzt.getTime() - Date.parse(b.datum) <= OFFEN_TAGE * TAG_MS);
  const abweichungen = d.abweichungen || [];
  return { abweichungen, vorschlaege, ohne, summe: abweichungen.length + vorschlaege.length };
}

/**
 * To-dos fuer "Heute": je Storno und je Lieferschein ohne Haken eines, dazu eine Sammelzeile
 * fuer die Vorschlaege. Alle fuehren in Einkauf > Belege - dort stehen Mail, Auftrag und Knoepfe.
 */
export function belegTodos(d, { jetzt = new Date(), href = '#/einkauf?tab=belege' } = {}) {
  const a = belegArbeit(d, { jetzt });
  if (!a) return [];
  const tage = iso => (Number.isFinite(Date.parse(iso)) ? Math.max(0, Math.floor((jetzt.getTime() - Date.parse(iso)) / TAG_MS)) : null);
  const name = id => d.lieferanten?.[id] || (id ? `Lieferant ${id}` : 'Lieferant');
  const fuer = x => `${x.orderName}${x.kundenname ? ` ${x.kundenname}` : ''}`;
  const todos = a.abweichungen.map(x => (x.art === 'storno'
    ? {
      id: `beleg-${x.id}`, art: 'beleg_storno', bereich: 'laden', ton: 'crit', alterTage: tage(x.datum),
      titel: `Storno vom Lieferanten: ${fuer(x)}`,
      kontext: `${name(x.lieferant)} · ${belegMarke({ art: 'storno', datum: x.datum })} · Mail lesen – betrifft es den Kunden, ihn informieren und Ersatz klären`,
      knopf: { text: 'Ansehen', href },
    }
    : {
      id: `beleg-${x.id}`, art: 'beleg_lieferschein', bereich: 'laden', ton: 'warn', alterTage: tage(x.datum),
      titel: `Lieferschein da – ${fuer(x)}: Ware angekommen?`,
      kontext: `${name(x.lieferant)} · ${belegMarke({ art: 'lieferschein', datum: x.datum })} · bei uns noch „Bestellt“`,
      knopf: { text: 'Ansehen', href },
    }));
  const n = a.vorschlaege.length;
  if (n) {
    todos.push({
      id: 'belege-zuordnen', art: 'belege_zuordnen', bereich: 'laden', ton: '',
      alterTage: Math.max(...a.vorschlaege.map(b => tage(b.datum) ?? 0)),
      titel: n === 1 ? 'Lieferantenbeleg zuordnen' : `${n} Lieferantenbelege zuordnen`,
      kontext: `${n === 1 ? 'passt vermutlich zu einer Bestellung' : 'passen vermutlich zu Bestellungen'} – je ein Klick: ${a.vorschlaege.slice(0, 3).map(b => belegMarke(b)).join(', ')}${n > 3 ? ' …' : ''}`,
      knopf: { text: 'Zuordnen', href },
    });
  }
  return todos;
}
