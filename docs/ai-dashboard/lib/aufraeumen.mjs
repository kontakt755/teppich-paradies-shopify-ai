/**
 * Alte Bestellungen aufraeumen (Inhaber 2026-10-26, #1698).
 *
 * Was belegt fertig ist (in Shopify versendet, storniert, archiviert, voll erstattet, im
 * Auftragsfluss abgeschlossen), faellt schon ohne Klick aus den Listen (bestellungAusgeblendet).
 * Hier landet nur der Rest: offene Bestellungen, bei denen sich laenger nichts getan hat. Jeder
 * Fall nennt, was belegt ist, und schlaegt einen Abschluss vor - entschieden wird per Klick. Die
 * Liste schliesst nie selbst ab und behauptet keinen Versand, den niemand erfasst hat.
 *
 * Browser UND Server (scripts/dashboard-api.mjs haengt den Fall an jede Bestellzeile), ohne DOM.
 */
import { bestellungAusgeblendet } from './bestellarbeit.mjs';

// Ab so vielen Tagen ohne Bewegung fragt die Liste nach. Ware wartet oft Wochen auf den Lieferanten.
export const AUFRAEUMEN_AB_TAGEN = Object.freeze({ muster: 14, ware: 30 });
// Gepackt ist noch nicht versandt: ein gepackter Umschlag ohne Versandvermerk faellt schon nach so
// vielen Tagen ohne Bewegung auf (#1709) - vorher standen #1043-#1047 vier Tage unbemerkt.
export const GEPACKT_OHNE_VERSAND_AB_TAGEN = 3;
// Bis zum 24.10. speicherte "Als bestellt markieren" nicht, ob der Lieferant direkt an den Kunden schickt (#1680).
export const LIEFERZIEL_GESPEICHERT_AB = '2026-10-24';
const TAG_MS = 86_400_000;
const STUFE = { bestellt: 1, geliefert: 2, raus: 3, erledigt: 4 };
const NICHT_VERFUEGBAR = /nicht\s+(?:mehr\s+)?(?:verf(?:ü|ue)gbar|lieferbar|vorr(?:ä|ae)tig)|ausverkauft/i;

const gueltig = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
const spaetester = werte => werte.filter(gueltig).sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1) || null;
const fruehester = werte => werte.filter(gueltig).sort((a, b) => Date.parse(a) - Date.parse(b))[0] || null;
const tagText = iso => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`; };
const kuerze = (t, n = 100) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

function positionen(z) {
  return (z?.auftrag?.positionen || []).filter(p => p?.lineItemId);
}

/**
 * Was die Packstation zu dieser Bestellung weiss (operations/lib/muster-packen.mjs, leseStand):
 * Umschlag gepackt (Schluessel = Bestell-IDs des Kunden), Muster abgehakt (je Position) und
 * "zu klaeren" (je Kunde, mit fehlenden Positionen).
 */
export function packBefund(z, packen = null) {
  const ids = new Set(positionen(z).map(p => String(p.lineItemId)));
  const gepacktAm = spaetester(Object.entries(packen?.gepackt || {})
    .filter(([key]) => String(key).split(',').includes(z?.orderId)).map(([, v]) => v?.zeit));
  const haken = Object.entries(packen?.haken || {}).filter(([id]) => ids.has(id)).map(([, v]) => v?.zeit);
  const k = z?.kundenSchluessel ? packen?.klaeren?.[z.kundenSchluessel] : null;
  const klaeren = k && (k.fehlt || []).some(id => ids.has(String(id))) ? { am: k.zeit || null, notiz: k.notiz || null } : null;
  return { gepacktAm, hakenAnzahl: haken.length, hakenAm: spaetester(haken), klaeren };
}

/** Neueste belegte Bewegung: Bestellung, Positionsstand, Zeitleiste, Notizen, Packstation. */
export function letzteBewegung(z, { packen = null } = {}) {
  const werte = [z?.datum, z?.abgehakt?.zeit];
  for (const e of Object.values(z?.positionsstatus || {})) {
    if (e) werte.push(e.aktualisiertAm, e.bestelltAm, e.geliefertAm, e.rausAm, e.erledigtAm);
  }
  for (const s of z?.verlauf || []) werte.push(s?.am);
  for (const n of z?.verlaufNotizen || []) werte.push(n?.am);
  const p = packBefund(z, packen);
  werte.push(p.gepacktAm, p.hakenAm, p.klaeren?.am);
  return spaetester(werte);
}

/** Belege und Vorschlag fuer eine Musterbestellung - nur aus vorhandenen Angaben. */
function musterBefund(z, packen) {
  const pos = positionen(z);
  const eintraege = pos.map(p => z.positionsstatus?.[p.lineItemId] || null);
  const stufe = e => STUFE[e?.status] || 0;
  const gesamt = pos.length;
  const bestellt = eintraege.filter(e => stufe(e) >= 1);
  const angekommen = eintraege.filter(e => stufe(e) >= 2);
  const bestelltAm = fruehester(bestellt.map(e => e.bestelltAm || e.aktualisiertAm));
  // Belegt ist "direkt an den Kunden" nur mit dem Vermerk beim Bestellen (ueber: 'kunde', #1680) - an
  // jeder noch offenen Position. Eine nie bestellte daneben waere sonst ohne Rueckfrage mit erledigt.
  const offen = eintraege.filter(e => e?.status !== 'erledigt');
  const direkt = offen.length > 0 && offen.every(e => stufe(e) >= 1 && e.ueber === 'kunde');
  const angekommenAm = spaetester(angekommen.map(e => e.geliefertAm || e.aktualisiertAm));
  const pack = packBefund(z, packen);
  const notiz = (z.verlaufNotizen || []).filter(n => n?.text).at(-1) || null;
  const folge = (z.verlauf || []).find(s => s?.schritt === 'ergebnis' && s.automatisch && s.folgeOrderName);

  const belege = [];
  if (bestelltAm) belege.push(`Beim Lieferanten bestellt am ${tagText(bestelltAm)}`);
  else if (!bestellt.length) belege.push('Nie beim Lieferanten bestellt');
  if (direkt) belege.push('Lieferant schickt laut Bestellung direkt an den Kunden');
  if (angekommen.length) belege.push(angekommen.length === gesamt ? `Alle Muster angekommen${angekommenAm ? ` (${tagText(angekommenAm)})` : ''}` : `${angekommen.length} von ${gesamt} Mustern angekommen`);
  else if (bestellt.length && !direkt) belege.push('Nie als angekommen erfasst');
  if (pack.gepacktAm) belege.push(`Gepackt am ${tagText(pack.gepacktAm)}`);
  if (pack.klaeren) belege.push(`Packstation: zu klären${pack.klaeren.notiz ? ` – ${kuerze(pack.klaeren.notiz, 60)}` : ''}`);
  if (z.fulfillmentstatus === 'ON_HOLD') belege.push('In Shopify zurückgehalten');
  if (notiz) belege.push(`Notiz vom ${tagText(notiz.am)}: „${kuerze(notiz.text)}“`);
  if (folge) belege.push(`Kunde hat danach bestellt (${folge.folgeOrderName})`);

  let vorschlag;
  if (notiz && NICHT_VERFUEGBAR.test(notiz.text)) {
    vorschlag = { text: 'Muster nicht verfügbar, der Kunde ist informiert.', notiz: `Aufgeräumt: Muster nicht verfügbar (Notiz vom ${tagText(notiz.am)})` };
  } else if (folge) {
    vorschlag = { text: 'Der Kunde hat danach bestellt – die Muster haben ihren Zweck erfüllt.', notiz: `Aufgeräumt: Kunde hat danach bestellt (${folge.folgeOrderName})` };
  } else if (gesamt && (angekommen.length === gesamt || pack.gepacktAm)) {
    vorschlag = { text: 'Die Muster waren da und sind wohl verschickt – der Versand wurde nur nicht erfasst.', notiz: 'Aufgeräumt: Muster waren da, Versand nicht erfasst' };
  } else if (!bestellt.length) {
    vorschlag = { text: 'Nie beim Lieferanten bestellt – beim Kunden nachfragen oder abschließen.', notiz: 'Aufgeräumt: Muster nie bestellt' };
  } else if (angekommen.length) {
    vorschlag = { text: 'Nur ein Teil kam an – beim Lieferanten nachfragen oder abschließen.', notiz: `Aufgeräumt: nur ${angekommen.length} von ${gesamt} Mustern angekommen` };
  } else if (direkt) {
    vorschlag = { text: 'Der Lieferant schickt laut Bestellung direkt an den Kunden – abschließen, wenn der Kunde die Muster hat.', notiz: 'Aufgeräumt: direkt vom Lieferanten an den Kunden (laut Bestellung)' };
  } else {
    // Ohne Vermerk nie "wohl direkt an den Kunden" annehmen: Musterbestellungen an Lieferant A gehen
    // an uns. #1033 wurde am 26.10. so abgeschlossen, obwohl die Muster nie verschickt waren.
    // Ohne Vermerk (notiz null) fragt "Abschließen…" nach dem Grund statt einen Text vorzugeben.
    const alt = bestelltAm && bestelltAm.slice(0, 10) < LIEFERZIEL_GESPEICHERT_AB;
    vorschlag = { text: `Die Muster kamen nie an – beim Lieferanten nachfragen.${alt ? ' Ob er direkt an den Kunden geschickt hat, wurde vor dem 24.10. nicht gespeichert.' : ''} Abschließen nur mit Beleg, dass der Kunde sie hat.`, notiz: null };
  }
  return { belege, vorschlag };
}

/** Umschlag gepackt, aber kein Artikel als verschickt eingetragen (und nicht in Shopify versendet). */
function gepacktOhneVersand(z, packen) {
  const pos = positionen(z);
  return Boolean(pos.length && packBefund(z, packen).gepacktAm && pos.every(p => (STUFE[z.positionsstatus?.[p.lineItemId]?.status] || 0) < STUFE.raus));
}

/**
 * Ruhe seit dem Packen: Umschlag, Klaerung, Notizen ("Liegt noch hier") und Zeitleistenschritte ab
 * dem Versand. Ein nachgetragenes "bestellt"/"angekommen" ist Buchhaltung, keine Bewegung - sonst
 * startete die Uhr bei jedem Nachtrag (#1706 trug am 26.10. Wareneingaenge vom 22.10. nach) neu.
 */
function ruheSeitPacken(z, packen) {
  const p = packBefund(z, packen);
  const schritte = (z?.verlauf || []).filter(s => !['angefragt', 'bestellt', 'geliefert'].includes(s?.schritt)).map(s => s?.am);
  return spaetester([p.gepacktAm, p.klaeren?.am, ...(z?.verlaufNotizen || []).map(n => n?.am), ...schritte]);
}

/** Nach wie vielen ruhigen Tagen dieser Fall (wieder) in der Liste steht. */
export function aufraeumenAbTagen(fall) {
  return fall?.grund === 'gepackt' ? GEPACKT_OHNE_VERSAND_AB_TAGEN : AUFRAEUMEN_AB_TAGEN[fall?.art === 'ware' ? 'ware' : 'muster'];
}

/** Ware: kein Abschluss-Vorschlag - eine bezahlte Bestellung schliesst niemand nebenbei. */
function warenBefund(z) {
  const belege = [];
  if (z.naechsterSchritt?.text) belege.push(`Nächster Schritt: ${z.naechsterSchritt.text}`);
  if (z.fulfillmentstatus === 'ON_HOLD') belege.push('In Shopify zurückgehalten');
  const notiz = (z.verlaufNotizen || []).filter(n => n?.text).at(-1);
  if (notiz) belege.push(`Notiz vom ${tagText(notiz.am)}: „${kuerze(notiz.text)}“`);
  return { belege, vorschlag: { text: 'Bestellung öffnen und den aktuellen Stand nachtragen.', notiz: null } };
}

/**
 * Aufraeumfall einer Bestellzeile (Form wie /api/kunden/bestellungen) oder null.
 * @param {object} [opts.packen]  Stand der Packstation ({ gepackt, haken, klaeren }) oder null
 */
export function aufraeumFall(z, { jetzt = Date.now(), packen = null } = {}) {
  if (!z || z.testbestellung || z.storniert || z.offen === false || z.zeitleisteAbgeschlossen) return null;
  if (bestellungAusgeblendet(z) || z.fortschritt?.unklar) return null;
  const art = z.auftragsart === 'muster' ? 'muster' : 'ware';
  const grund = art === 'muster' && gepacktOhneVersand(z, packen) ? 'gepackt' : 'ruhe';
  const seit = grund === 'gepackt' ? ruheSeitPacken(z, packen) : letzteBewegung(z, { packen });
  if (!seit) return null;
  const tage = Math.floor((jetzt - Date.parse(seit)) / TAG_MS);
  if (tage < aufraeumenAbTagen({ art, grund })) return null;
  const befund = art === 'muster' ? musterBefund(z, packen) : warenBefund(z);
  const offen = positionen(z).filter(p => z.positionsstatus?.[p.lineItemId]?.status !== 'erledigt').map(p => p.lineItemId);
  // Gepackt: nicht abschliessen, sondern den Versand eintragen - sonst entfiele das Nachfassen beim Kunden.
  const vorschlag = grund === 'gepackt'
    ? { text: 'Der Umschlag ist gepackt, aber nicht als verschickt eingetragen. Ist er raus: eintragen. Sonst zur Post bringen.',
      notiz: `Umschlag gepackt am ${tagText(packBefund(z, packen).gepacktAm)}, Versand beim Aufräumen eingetragen` }
    : befund.vorschlag;
  return { art, grund, seit, tage, belege: befund.belege, vorschlag, lineItemIds: art === 'muster' ? offen : [] };
}

/** Alle Faelle, wer am laengsten ruht zuerst. Erwartet Zeilen mit angehaengtem `aufraeumen`. */
export function aufraeumListe(zeilen = []) {
  return (zeilen || []).filter(z => z?.aufraeumen && !z.testbestellung && !z.storniert && !bestellungAusgeblendet(z))
    .sort((a, b) => b.aufraeumen.tage - a.aufraeumen.tage || String(a.datum).localeCompare(String(b.datum)));
}
