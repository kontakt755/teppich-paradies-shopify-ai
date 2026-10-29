/**
 * Lokale Aktions-API des Control Centers (nur npm run dashboard, nur 127.0.0.1).
 *
 * Jede Schreibaktion laeuft ueber die gh CLI unter dem Konto des angemeldeten
 * Menschen und landet damit auditierbar im GitHub-Issue (Label, Assignee,
 * Kommentar). Uebergaenge werden HIER serverseitig geprueft - mit denselben
 * Regeln wie im Browser (docs/ai-dashboard/lib/model.mjs). Ein Client, der
 * die Oberflaeche umgeht, bekommt dieselbe Ablehnung.
 *
 * Es gibt keinen zweiten Aufgabenspeicher: nach jedem Schreibvorgang wird
 * issues.json neu erzeugt, damit Oberflaeche und GitHub identisch sind.
 *
 * `gh` ist injizierbar (Tests). Alle Funktionen sind frei von HTTP-Details.
 */

import { leseKettelversand, aendereKettelversand, kettelPosition, packVergleich } from '../operations/lib/kettelversand.mjs';
import { leseVersandtarife as kettelTarife } from '../operations/lib/versandtarife.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomBytes } from 'node:crypto';
import { musterAutomatikLauf, musterAutomatikAnzeige } from '../operations/lib/muster-bestellautomatik.mjs';
import { vorbereitungStand } from '../operations/lib/bestellvorbereitung.mjs';
import { arbeitsstand } from '../operations/lib/arbeitsstand.mjs';
import { routinenStand } from '../operations/lib/routinen.mjs';
import { personId as bestellPersonId } from '../docs/ai-dashboard/lib/beschaffung.mjs';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { normalizeTask, requirementsFor, labelChangesFor, mitBlockerAbschnitt, STATUS_BY_KEY, STATUS_LABELS } from '../docs/ai-dashboard/lib/model.mjs';
import { texteAusMarkdown, musterKurz, musterNachfassen, fuelleText, platzhalterFrei, vorlageFuer, STUFE_LABEL, NICHT_VERFUEGBAR_VORLAGE } from '../docs/ai-dashboard/lib/muster-nachfassen.mjs';
import { kundeInformiertAus } from '../docs/ai-dashboard/lib/auftrags-ablauf.mjs';
import { grenzeFuer } from '../docs/ai-dashboard/lib/datenstand.mjs';
import { postfachPfad, stopplistePfad, versandPfad, lesePostfach, leseStoppliste, abgemeldeteAdressen, trageAbmeldungEin, leseVersand, schreibeVersand, schonVerschickt, kopieNoetig, versandStand as nachfassVersandStand, AUTOMATISCH, UNTERSCHRIFT_STANDARD, NachfassFehler } from '../operations/lib/nachfass-versand.mjs';
import { sendeMail as smtpSenden } from '../operations/lib/smtp.mjs';
import { toIssueRecord } from './build-dashboard-data.mjs';
import { aufbereiten } from '../operations/lib/bestelluebersicht.mjs';
import { ladeExport } from '../operations/scripts/bestelluebersicht.mjs';
import { ratgeberFuerBestellung, ratgeberHtml, kurzTitel as ratgeberKurzTitel, RATGEBER, ORDNER as RATGEBER_ORDNER } from '../domains/shopify/ratgeber-pdf/vorlage.mjs';
import { auftragsstatusPfad, leseAlle as leseAuftragsstatus, schreibeAlle as schreibeAuftragsstatus, setzeStatus, setzeStatusPositionen, bereiteStatusPositionenVor, oeffneWieder, setzeZurueckAufOffen, vermerkeShopifyVersand, STATUS_ORDER, UEBER_WERTE, AuftragsstatusFehler, positionKey } from '../operations/lib/auftragsstatus.mjs';
import { bucheVersand, versandNachzuholen, andereBestellungenMitSendung, VersandFehler, VERSANDDIENSTE } from '../operations/lib/versand.mjs';
import { uebernimmAusShopify, abweichungen as shopifyAbweichungen, entfernteBestellt, ABGLEICH_VON } from '../operations/lib/shopify-abgleich.mjs';
import { musterherkunftPfad, leseEreignisse as leseMusterherkunft, haengeWahlAn, wendeAufModellAn, HERKUNFT_WERTE, HERKUNFT_LABEL, MusterherkunftFehler } from '../operations/lib/musterherkunft.mjs';
import { musterSchluessel, musterlagerPfad, leseLager, einlagern as lagerEinlagern, aendern as lagerAendern, entfernen as lagerEntfernen, wendeLagerAn, festzuschreiben as lagerFestzuschreiben, farbenFuer as lagerFarbenFuer, vorschlaege as lagerVorschlaege, kurzTitel as lagerKurzTitel, LAGER_ARTEN, ZAEHLBAR as LAGER_ZAEHLBAR, MUSTER_GROESSE, KNAPP_AB as LAGER_KNAPP_AB, PROBESTUECK_PREIS, wartetAufLieferant as lagerWartetAufLieferant, MusterlagerFehler } from '../operations/lib/musterlager.mjs';
import { abgleichIndex as resteIndex, sucheBeiAC as resteSucheBeiAC, acTrefferFuer as resteAcTreffer, RESTE_GRUPPEN, RESTE_LIEFERANTEN } from '../operations/lib/reste.mjs';
import { auftragsverlaufPfad, leseVerlauf, bereiteEreignisVor, schreibeVerlauf, zeitleistenFuerModell, dringendsterSchritt, setzbareSchritte, SCHRITT_WERTE, SCHRITT_LABEL, ERGEBNIS_SCHRITTE, AuftragsverlaufFehler } from '../operations/lib/auftragsverlauf.mjs';
import { mustersperrePfad, leseSperren, haengeAn as sperreAnhaengen, ereignis as sperrEreignis, stand as sperrStand, schonErledigt as sperreSchonErledigt, adminLink as sperrAdminLink, pruefeRechte as pruefeSperrRechte, rechtFehltText as sperrRechtFehlt, sperreImShop, freigebenImShop, GRUND as SPERR_GRUND, MustersperreFehler } from '../operations/lib/mustersperre.mjs';
import { sucheKunden, kundenListenEintrag, findeKunde, alleKunden, kundenIndex, offeneBestellungenJeProdukt, kundenSchluessel } from '../operations/lib/kundensuche.mjs';
import { faelle as kundenFaelle, istTestkontakt } from '../operations/lib/kundenfaelle.mjs';
import { bestellmarkenPfad, leseAlle as leseBestellmarken, setzeHaken as setzeBestellhaken } from '../operations/lib/bestellmarken.mjs';
import { fallmarkenPfad, leseAlle as leseFallmarken, setzeMarke as setzeFallmarke, teileAuf as teileFaelleAuf, juengsterPunkt, FALL_GRUND } from '../operations/lib/fallmarken.mjs';
import {
  sortiere as orgSortiere, passtZuAnsicht, darfSehen, darfAendern, findeDoppelgaenger,
  istUeberfaellig, tageBis, istPerson, istTechnisch, istTeamarbeit, gruppeVon, ARBEITSGRUPPEN,
  dringlichkeitsGruppe,
} from '../operations/lib/organisation.mjs';
import { analysiere as orgAnalysiere, ausListe as orgAusListe } from '../operations/lib/organisation-analyse.mjs';
import {
  lies as orgLies, schreib as orgSchreib, dateiPfad as orgDatei, baueEintrag,
  findeEintrag, aendere as orgAendere, kommentiere as orgKommentiere,
  speichereAnhang, anhangPfad, ANHANG_TYPEN, OrganisationFehler,
} from '../operations/lib/organisation-speicher.mjs';
import {
  leseBenutzer as orgLeseBenutzer, schreibeBenutzer, benutzerAnlegen, passwortSetzen,
  benutzerDeaktivieren, validiereRolle, BenutzerFehler, ROLLEN, pruefePasswort,
} from '../operations/lib/benutzer.mjs';
import { bestellliste } from '../operations/lib/bestellliste.mjs';
import { leseStammdaten, stammdatenPfad, stammdatenFuer, lieferantenUebersicht, lieferantDetail, bestellmail, LieferantenFehler, lexikonProduktMitSchnellzugriff } from '../operations/lib/lieferanten.mjs';
import {
  FOTO_ART, FotoFehler, passendeProdukte, produktHinweis, pruefeEingang, titelFuer,
} from '../operations/lib/baustellenfotos.mjs';
import { protokollPfad, protokolliere } from '../operations/lib/protokoll.mjs';
import { ablaufVon, findeZugang, liesZugaenge, zugangAnlegen, zugangGueltig, zugangSperren } from '../social/lib/eingang.mjs';
import { ladeUmgebung } from '../social/lib/zugang.mjs';
import { rueckrufliste } from '../operations/lib/rueckrufliste.mjs';
import { lieferbelegePfad, leseBelege, entscheide as belegEntscheiden, LieferbelegFehler } from '../operations/lib/lieferbelege.mjs';
import { kandidatenAus, domainVon, lieferantZurDomain, ordneAlleZu, abgleich as belegAbgleich } from '../docs/ai-dashboard/lib/lieferbelege.mjs';
import { serviceanfragenPfad, leseAlle as leseServiceanfragen, anlegen as serviceanfrageAnlegen, aendern as serviceanfrageAendern, ServiceanfrageFehler } from '../operations/lib/serviceanfragen.mjs';
import { createServiceLadenAbgleich, serviceMitLaden } from './service-laden-abgleich.mjs';
import { rueckrufePfad, leseAlle as leseRueckrufe, setzeStatus as setzeRueckrufStatus, RUECKRUF_STATUS, RueckrufFehler } from '../operations/lib/rueckrufe.mjs';
import { rollenware, paketware, stueck as stueckware, formatDe, UNGEKLAERT as MENGE_UNGEKLAERT } from '../operations/lib/umrechnung.mjs';
import { ausVariantentitel } from '../operations/lib/resolve.mjs';
import { ladeEnvLocal, erzeugeProxy, KEIN_ZUGANG, mitHinweis } from '../operations/sync/zugang.mjs';
import { leseAkquiseCsv, vorlageAusMarkdown, wendeAenderungAn, akquiseId, pruefeReferenz } from '../docs/ai-dashboard/lib/akquise.mjs';
import { wendeHvAenderungAn, leererBestand as leererHvBestand } from '../docs/ai-dashboard/lib/hausverwaltungen.mjs';
import { leseListe as leseSonderposten, verkaufeImLaden, verkaufeVonRolle, korrigiereRollenbestand, SonderpostenFehler } from '../operations/lib/sonderposten.mjs';
import { ohneUeberholtenFehler } from '../operations/scripts/aktualisieren.mjs';
import { meldungenPfad, abgleichPfad, meldungAnlegen, alleMeldungen, sichtbareMeldungen, darfMeldungSehen, bildAusUpload, bildDatei, BILDER_MAX, FehlermeldungFehler } from '../operations/lib/fehlermeldungen.mjs';
import { dashboardLinks } from './weitere-dashboards.mjs';
import { logFehler } from './dashboard-log.mjs';
import { leseTailscaleStatus } from '../operations/lib/tailscale.mjs';
import { bestaetigeBeschaffung, arbeitsuebernahme, BeschaffungFehler } from '../operations/lib/beschaffung.mjs';
import { darfWeiter, beschaffungsStand } from '../docs/ai-dashboard/lib/beschaffung.mjs';
import { filtereAuftrag } from '../docs/ai-dashboard/lib/vorgangslink.mjs';
import { musterKaufLinks } from '../docs/ai-dashboard/lib/muster-kauf-links.mjs';
import { aufraeumFall } from '../docs/ai-dashboard/lib/aufraeumen.mjs';
import { betriebszustand, sicherungsstand } from '../operations/lib/betriebszustand.mjs';
import { ausCsv as bildrechteAusCsv, prueflisten as bildrechtePrueflisten } from '../operations/lib/bildrechte.mjs';
import { prozesslinksPfad, leseProzesslinks, schreibeProzesslinks, ProzesslinksFehler, ProzesslinksSpeicherFehler } from '../operations/lib/prozesslinks.mjs';
import { leseMusterDruckliste, aendereMusterDruckliste, gleicheBestellungsVormerkung, MusterDrucklisteFehler } from '../operations/lib/muster-druckliste.mjs';
import { etikettenAusLexikon } from '../docs/ai-dashboard/lib/lexikon-etiketten.mjs';
import { suchbegriffe, lexikonTreffer, nurUeberTitel } from '../docs/ai-dashboard/lib/lexikon-suche.mjs';
import { musteretikettenFuerAuftrag } from '../docs/ai-dashboard/lib/bestellungs-musteretiketten.mjs';
import { musterEtikettenStatus } from '../docs/ai-dashboard/lib/muster-etiketten-status.mjs';
import { grossbriefPfad, leseGrossbriefe, grossbriefStand, speichereGrossbrief, GrossbriefSpeicherFehler } from '../operations/lib/muster-grossbrief.mjs';
import { musterwirkung } from '../operations/lib/musterwirkung.mjs';
import { packhilfeDaten } from '../operations/lib/packhilfe-daten.mjs';
import { musterPackliste } from '../docs/ai-dashboard/lib/muster-packen.mjs';
import { musterPackenPfad, setzeGedruckt, setzeGepackt, setzeHaken, setzeKlaeren, leseStand as leseMusterPackStand } from '../operations/lib/muster-packen.mjs';

const execFileP = promisify(execFile);

export const DEFAULT_REPO = process.env.DASHBOARD_REPO || 'kontakt755/teppich-paradies-shopify-ai';

export class ApiError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}

/** Standard-gh-Aufruf: Rueckgabe stdout als String. */
export async function defaultGh(args, { timeout = 30_000 } = {}) {
  const { stdout } = await execFileP('gh', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout });
  return stdout;
}

const DECISION_LABEL = {
  approve: 'Freigabe erteilt',
  reject: 'Freigabe abgelehnt',
  question: 'Rückfrage',
  delegate: 'Delegiert',
  later: 'Entscheidung vertagt',
};

function clip(text, max = 4_000) {
  const s = String(text ?? '').trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** Kommentar-Format des Control Centers: maschinen- und menschenlesbar. */
export function buildComment({ actor, heading, lines = [], text = null }) {
  const out = [`## Control Center: ${heading}`, '', `- Von: @${actor}`, ...lines.map(l => `- ${l}`)];
  if (text) out.push('', clip(text));
  out.push('', '<!-- tp-control-center -->');
  return out.join('\n');
}

/**
 * Einkauf-Bereich: Bestelluebersicht und Produktdaten-Status.
 *
 * Liest ausschliesslich private Dateien ausserhalb des Repositories
 * ($TP_PRIVAT_DIR, Standard ~/teppich-paradies-analyse). Nichts davon landet
 * in docs/ai-dashboard/issues.json oder sonst im Repository - die Endpunkte
 * existieren nur im lokalen Server (scripts/serve-dashboard.mjs), nicht auf
 * GitHub Pages. Fehlende Dateien sind kein Fehler, nur ein leerer Zustand.
 */
export function privatDir() {
  return process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse');
}

/**
 * Datei lesen, wenn sie da ist.
 *
 * Frueher verschluckte ein einziges catch jeden Fehler: eine fehlende Datei,
 * kaputtes JSON und fehlende Leserechte wurden ununterscheidbar zu null - die
 * Oberflaeche meldete dann "noch nicht exportiert", obwohl die Datei da, aber
 * beschaedigt war. Fehlt sie wirklich, bleibt es still; alles andere landet
 * im Serverprotokoll und ist ueber leseFehler(file) abrufbar.
 */
const leseFehlerCache = new Map();

function readJsonIfExists(file) {
  try {
    const roh = fs.readFileSync(file, 'utf8');
    leseFehlerCache.delete(file);
    return JSON.parse(roh);
  } catch (e) {
    if (e?.code === 'ENOENT') { leseFehlerCache.delete(file); return null; }
    const text = e instanceof SyntaxError
      ? 'Die Datei ist beschädigt (kein gültiges JSON).'
      : e?.code === 'EACCES' ? 'Keine Leserechte für die Datei.' : String(e?.message || e).slice(0, 200);
    leseFehlerCache.set(file, text);
    logFehler('daten', `${file}: ${text}`);
    return null;
  }
}

/**
 * Eingabefehler aus dem Aufgabenspeicher (fehlender Titel, leerer Kommentar,
 * unbekannter Status) sind 400 - bisher kamen sie als 500 "Das hat nicht
 * geklappt" an, und niemand erfuhr, was an der Eingabe fehlte.
 */
function mitEingabepruefung(fn) {
  try { return fn(); } catch (e) {
    if (e instanceof OrganisationFehler) throw new ApiError(400, e.message);
    throw e;
  }
}

/** Grund, warum eine Datei nicht gelesen werden konnte - null, wenn sie schlicht fehlt. */
export function leseFehler(file) { return leseFehlerCache.get(file) || null; }

/**
 * Wie readJsonIfExists, aber zwischengespeichert, solange sich die Datei nicht
 * aendert (Groesse und Aenderungszeit). Gedacht fuer den Lexikon-Export: rund
 * 27 MB, die bisher bei JEDER Anfrage synchron gelesen und geparst wurden -
 * die Befehlspalette fragt beim Tippen alle 150 ms, und waehrenddessen stand
 * der ganze Dienst fuer alle anderen still.
 *
 * Das Ergebnis wird von mehreren Anfragen geteilt: Aufrufer duerfen es nur
 * lesen, nie veraendern.
 */
const jsonZwischenspeicher = new Map();
export function readJsonGecacht(file) {
  let st;
  try { st = fs.statSync(file); } catch (e) {
    jsonZwischenspeicher.delete(file);
    if (e?.code === 'ENOENT') { leseFehlerCache.delete(file); return null; }
    return readJsonIfExists(file);   // meldet den Grund wie gewohnt
  }
  const kennung = `${st.size}:${st.mtimeMs}`;
  const treffer = jsonZwischenspeicher.get(file);
  if (treffer && treffer.kennung === kennung) return treffer.daten;
  const daten = readJsonIfExists(file);
  if (daten === null) jsonZwischenspeicher.delete(file);
  else jsonZwischenspeicher.set(file, { kennung, daten });
  return daten;
}

/**
 * Auslauf-Befunde, deren Produkte schon archiviert sind, sind erledigt: kein Handle steht mehr
 * im Lexikon-Export (der fuehrt nur aktive und unsichtbare Produkte). Sonst blieb das To-do rot
 * bis zur naechsten Montagspruefung (Fehlersuche 28.10.2026: 15 Befunde, alle am 26.10.
 * archiviert, und "Im Lexikon" fuehrte ins Leere). Ohne Lexikon-Export bleibt alles stehen.
 */
export function auslaufOffen(befunde = [], lexikon = null) {
  const produkte = lexikon?.produkte;
  if (!Array.isArray(produkte) || !produkte.length) return { befunde, archiviert: 0 };
  const imShop = new Set(produkte.map(p => p?.handle).filter(Boolean));
  const offen = befunde.filter(b => !b?.handles?.length || b.handles.some(h => imShop.has(h)));
  return { befunde: offen, archiviert: befunde.length - offen.length };
}

/**
 * Bildrechte-Verzeichnis ($TP_PRIVAT_DIR/bildrechte/bildrechte.csv, rund 13 MB):
 * zwischengespeichert, solange sich die Datei nicht aendert - sonst laese jeder
 * Seitenwechsel in der Ansicht die ganze Datei neu. null = Datei fehlt; andere
 * Lesefehler werfen, damit die Ansicht eine Stoerung statt "nichts da" zeigt.
 */
let bildrechteZwischenspeicher = null;
function leseBildrechte(file) {
  let st;
  try { st = fs.statSync(file); } catch (e) {
    if (e?.code === 'ENOENT') { bildrechteZwischenspeicher = null; return null; }
    throw e;
  }
  const kennung = `${file}:${st.size}:${st.mtimeMs}`;
  if (bildrechteZwischenspeicher?.kennung !== kennung) {
    bildrechteZwischenspeicher = { kennung, zeilen: bildrechteAusCsv(fs.readFileSync(file, 'utf8')), stand: st.mtime.toISOString() };
  }
  return bildrechteZwischenspeicher;
}

/** Handle -> Links ins Shopify-Admin und in den Shop, aus dem Lexikon-Export (einmal je Exportstand). */
const lexikonLinks = new WeakMap();
function linksAusLexikon(lexikon) {
  if (!Array.isArray(lexikon?.produkte)) return new Map();
  if (!lexikonLinks.has(lexikon)) {
    lexikonLinks.set(lexikon, new Map(lexikon.produkte.filter(p => p?.handle).map(p => [p.handle, { adminUrl: p.adminUrl || null, shopUrl: p.onlineStoreUrl || null }])));
  }
  return lexikonLinks.get(lexikon);
}

/** Wendet dieselben Filterchips wie alleKunden() auf Freitextsuchtreffer an (kundenListenEintrag-Form). */
function passtZuKundenFilter(filter) {
  return (k) => {
    if (filter === 'in_arbeit') return !k.fortschritt.fertig;
    if (filter === 'fertig') return k.fortschritt.fertig && k.fortschritt.gesamt > 0;
    if (filter === 'rueckruf_offen') return k.beratungOffen;
    if (filter === 'muster') return k.muster;
    if (filter === 'test') return k.nurTestbestellungen;
    return !k.nurTestbestellungen;
  };
}

/**
 * Kunden aus dem Shopify-Kundenstamm, die in den Bestellungen nicht
 * vorkommen (noch nichts bestellt oder die Bestellung liegt ausserhalb des
 * exportierten Zeitfensters). Ohne sie zeigte die Kundenliste nur einen
 * Bruchteil dessen, was im Shopify-Admin steht.
 * Form wie kundenListenEintrag, damit Filter und Anzeige unveraendert
 * funktionieren; `nurStammdaten` markiert die Herkunft.
 */
function stammOhneBestellung(dir, vorhandeneKeys) {
  const daten = readJsonIfExists(path.join(dir, 'kunden', 'kunden.json'));
  const zeilen = [];
  for (const k of daten?.kunden ?? []) {
    const key = k.email ? `email:${String(k.email).toLowerCase()}`
      : k.telefon ? `tel:${String(k.telefon).replace(/[^0-9+]/g, '')}`
      : `name:${String(k.name || 'unbekannt').toLowerCase()}`;
    if (vorhandeneKeys.has(key)) continue;
    zeilen.push({
      key,
      name: k.name || '–',
      email: k.email || null,
      telefon: k.telefon || null,
      telefonQuelle: k.telefonQuelle || null,
      ort: k.anschrift?.ort || null,
      letzteBestellung: null,
      letzteBestellungName: null,
      anzahlBestellungen: k.anzahlBestellungen || 0,
      gesamtumsatz: k.gesamtumsatz || 0,
      waehrung: k.waehrung || 'EUR',
      nurTestbestellungen: false,
      fortschritt: { fertig: true, gesamt: 0, erledigt: 0 },
      aeltesteOffeneBestellungDatum: null,
      beratungOffen: false,
      muster: false,
      nurStammdaten: true,
    });
  }
  return zeilen;
}

/** Laedt und bereitet orders.json auf (dieselbe Logik wie einkaufBestellungen()); null wenn nicht vorhanden/kaputt. */
function ladeBestellModell(dir) {
  const file = path.join(dir, 'bestelluebersicht', 'orders.json');
  const daten = readJsonIfExists(file);
  if (!daten) return null;
  try { return bereiteBestellModell(daten, dir, new Date()); }
  catch { return null; }
}

/**
 * Offene Bestellpositionen je Produkt-Handle fuers Lexikon; null, wenn keine Bestelldaten da
 * sind (dann zeigt das Lexikon einfach nichts dazu - die Suche selbst haengt nicht daran).
 */
function offeneBestellungenMap(dir) {
  const modell = ladeBestellModell(dir);
  if (!modell) return null;
  return offeneBestellungenJeProdukt(modell, { statusAlle: leseAktuellenStatus(auftragsstatusPfad(dir), modell) });
}

/** Offene Positionen eines Lexikon-Produkts - das Original und sein eigenes Musterprodukt. */
function offeneZuProdukt(map, produkt) {
  if (!map) return [];
  const handles = [produkt.handle, produkt.muster?.handle].filter(Boolean);
  return [...new Set(handles)].flatMap(h => map.get(h) ?? []);
}

/** Bestellungen aus orders.json in jeder Form, die ladeExport kennt - ohne Umweg ueber Text. null = unbrauchbar. */
function exportOrders(daten) {
  if (Array.isArray(daten)) return daten;
  if (Array.isArray(daten?.data?.orders?.nodes)) return daten.data.orders.nodes;
  if (Array.isArray(daten?.orders)) return daten.orders;
  if (Array.isArray(daten?.orders?.nodes)) return daten.orders.nodes;
  return null;
}

function bereiteBestellModell(daten, dir, jetzt) {
  const exportDaten = ladeExport(JSON.stringify(daten));
  const modell = mitMusterherkunft(aufbereiten(exportDaten, { jetzt }), dir);
  // Kurz-Ratgeber zum Beilegen (domains/shopify/ratgeber-pdf): dieselbe Zuordnung wie in der
  // Bestellbestaetigung, Muster zaehlen nicht. Leer = kein Knopf "Ratgeber drucken".
  const roh = new Map(exportDaten.orders.map(o => [o?.id, o]));
  for (const a of [...(modell.auftraege || []), ...(modell.testauftraege || [])]) {
    const o = roh.get(a.id);
    a.ratgeber = o ? ratgeberFuerBestellung(o).map(({ r }) => ratgeberKurzTitel(r)) : [];
  }
  // Dieselbe Umrechnung, aber aktuelle Gesamtmenge: nach Versand ist die offene Menge 0,
  // die bestaetigte Lieferung bleibt trotzdem 10 von 10. Der Export selbst wird nicht veraendert.
  const sollExport = structuredClone(exportDaten);
  for (const a of sollExport.orders) {
    const zeilen = Array.isArray(a.lineItems) ? a.lineItems : a.lineItems?.nodes || a.lineItems?.edges?.map(e => e.node) || [];
    for (const p of zeilen) p.unfulfilledQuantity = p.currentQuantity ?? p.quantity;
  }
  const sollModell = aufbereiten(sollExport, { jetzt });
  const mengen = new Map([...(sollModell.auftraege || []), ...(sollModell.testauftraege || [])].flatMap(a => a.positionen || []).map(p => [positionKey(p.orderId, p.lineItemId), p.bestellmenge]));
  for (const a of [...(modell.auftraege || []), ...(modell.testauftraege || [])]) for (const p of a.positionen || []) p.bestellSoll = mengen.get(positionKey(p.orderId, p.lineItemId)) || null;
  return modell;
}

/** Nur abgeleitete Anzeige: neue Sollmenge macht alte Vollstaendigkeit sofort wieder offen. */
function leseAktuellenStatus(file, modell = ladeBestellModell(path.dirname(file))) {
  const alle = leseAuftragsstatus(file);
  const positionen = [...(modell?.auftraege || []), ...(modell?.testauftraege || [])].flatMap(a => a.positionen || []);
  const mengen = new Map(positionen.map(p => [positionKey(p.orderId, p.lineItemId), p.bestellSoll || p.bestellmenge]));
  return Object.fromEntries(Object.entries(alle).map(([key, e]) => [key, beschaffungsStand(e, mengen.get(key))]));
}

/**
 * Traegt die lokale Wahl "Muster haben wir da" (musterherkunft.json) an die Muster-Positionen -
 * und danach das Musterlager (musterlager.json): offene Muster, die wir da haben, kommen von dort.
 */
function mitMusterherkunft(modell, dir) {
  wendeAufModellAn(modell, leseMusterherkunft(musterherkunftPfad(dir)));
  mitMusterlager(modell, dir);
  return modell;
}

/**
 * Musterlager an das Modell. Ein beschaedigtes Lager haelt keine Bestellansicht auf - die
 * Muster stehen dann wie ohne Lager auf "beim Lieferanten bestellen", die Ansicht
 * "Musterlager" meldet den Fehler. Der Stand je Eintrag (verbraucht, reserviert, Rest) haengt
 * nicht aufzaehlbar am Modell, damit er in keiner Antwort mitwandert.
 */
function mitMusterlager(modell, dir) {
  if (!modell) return modell;
  let lager;
  try { lager = leseLager(musterlagerPfad(dir)); } catch (e) { console.error(`[musterlager] ${e.message}`); return modell; }
  if (!lager.eintraege.length && !lager.entfernt.length) return modell;
  let statusAlle = {};
  try { statusAlle = leseAuftragsstatus(auftragsstatusPfad(dir)); } catch { /* ohne Stand: nur Anzeige, geschrieben wird hier nichts */ }
  const stand = wendeLagerAn(modell, lager, { statusAlle });
  Object.defineProperty(modell, 'musterlagerStand', { value: stand, enumerable: false });
  return modell;
}

/**
 * Produktdaten-Status: Klartext, Blockier-Status und Naechster-Schritt-Text
 * je Einkaufsfeld. Drei ehrliche Gruppen, nicht zwei:
 *
 * - "blockierend": ohne dieses Feld kann die Ware beim Lieferanten nicht
 *   bestellt werden - Lieferant oder Artikelnummer fehlt. Das ist die einzige
 *   Gruppe, die die grosse Zahl oben treibt.
 * - "nachtragen": wuenschenswerte Zusatzinformation (Farbnummer, Kollektion,
 *   Hersteller, Lieferanten-Produktname/-URL) - fehlt sie, blockiert das
 *   keine Bestellung, ist aber eine echte Luecke.
 * - strukturell offen (kein Meta-Eintrag mit blockierend/nachtragen noetig,
 *   siehe istStrukturellOffenerFall()): umrechnung (Format nie definiert),
 *   procurement_id ausserhalb der Rollenware (dort nie vorgesehen) und jede
 *   Wunschmass-Variante (SKU/Artikelnummer entstehen erst beim Zuschnitt) -
 *   zaehlt nirgends als Aufgabe.
 *
 * Quelle der Feldnamen: einkauf-klaerung/offen.json (Feld `field`).
 */
const EINKAUF_FELD_META = {
  lieferant: { klartext: 'Lieferant', blockierend: true },
  artikelnummer: { klartext: 'Artikelnummer', blockierend: true },
  'lieferant/artikelnummer': { klartext: 'Lieferant/Artikelnummer', blockierend: true },
  bestelleinheit: { klartext: 'Bestellmenge unklar', blockierend: true },
  farbnummer: { klartext: 'Farbnummer', blockierend: false },
  lieferant_kollektion: { klartext: 'Kollektion', blockierend: false },
  hersteller: { klartext: 'Hersteller', blockierend: false },
  farbname: { klartext: 'Farbname', blockierend: false },
  lieferant_produktname: { klartext: 'Lieferanten-Produktname', blockierend: false },
  lieferant_url: { klartext: 'Lieferanten-Produktseite', blockierend: false },
  procurement_id: { klartext: 'Einkaufs-ID', blockierend: false },
  umrechnung: { klartext: 'Umrechnung', blockierend: false },
};

function einkaufFeldKlartext(feld) {
  return EINKAUF_FELD_META[feld]?.klartext || feld;
}

function einkaufFeldBlockierend(feld) {
  return Boolean(EINKAUF_FELD_META[feld]?.blockierend);
}

/**
 * Strukturell offene Faelle zaehlen nie als Aufgabe (weder blockierend noch
 * nachtragen) - siehe Kommentar an EINKAUF_FELD_META. `gruppe` und
 * `variantTitle` kommen aus dem Dry-Run-Plan (plan.json) der Variante.
 */
function istStrukturellOffenerFall(feld, gruppe, variantTitle) {
  if (/wunschma/i.test(variantTitle || '')) return true;
  if (feld === 'umrechnung') return true;
  if (feld === 'procurement_id' && gruppe !== 'Rollenware') return true;
  return false;
}

/**
 * Naechster Schritt in verstaendlichem Deutsch, je Feld und - wo noetig -
 * je nach Grund unterschiedlich (z. B. Kaskade ueber einen offenen
 * Lieferanten, oder das Nummernsystem-Problem aus
 * docs/lessons/zwei-nummernsysteme-doellken.md). Faellt kein Grund-Muster,
 * bleibt der generische Satz fuer das Feld.
 */
function einkaufNaechsterSchritt(feld, grund) {
  const g = String(grund || '');
  const lieferantUnklar = /Lieferant unklar/i.test(g);
  switch (feld) {
    case 'lieferant':
    case 'lieferant/artikelnummer':
      return 'Lieferant von Hand klaeren (Preisliste/Lieferantenliste abgleichen)';
    case 'artikelnummer':
      if (lieferantUnklar) return 'Kommt automatisch, sobald der Lieferant geklaert ist';
      return 'Artikelnummer bei Lieferant nicht gefunden - von Hand in Preisliste/Katalog pruefen';
    case 'farbnummer':
      if (lieferantUnklar) return 'Kommt automatisch, sobald der Lieferant geklaert ist';
      if (/zwei Nummernsysteme/i.test(g)) return 'Farbcode und Artikelnummer-Suffix weichen ab - von Hand gegen die Lieferantenliste pruefen (zwei Nummernsysteme)';
      return 'Farbnummer von der Lieferantenliste abschreiben, nie fortlaufend zaehlen';
    case 'bestelleinheit':
      if (/VE oder Stueck/i.test(g)) return 'Verpackungseinheit oder Einzelstueck? Von Hand in der Preisliste pruefen';
      if (/Massteppich/i.test(g)) return 'Bestelleinheit als Zuschnitt+Einfassung von Hand festlegen (Inhaberentscheidung noetig)';
      return 'Bestelleinheit von Hand aus der Preisliste uebernehmen';
    case 'lieferant_url':
      return 'Produktseite beim Lieferanten suchen und als Link hinterlegen - bis dahin hilft der Suchlink im Lexikon';
    case 'lieferant_produktname':
      return 'Bezeichnung aus der Preisliste/Bestellbestaetigung des Lieferanten uebernehmen';
    case 'lieferant_kollektion':
      return 'Kollektion kommt automatisch, sobald die Lieferantenseite geholt ist';
    case 'hersteller':
      return 'Hersteller kommt automatisch, sobald Lieferant und Kollektion bekannt sind';
    default:
      return 'Fuellt sich automatisch aus den uebrigen Feldern, keine Aktion noetig';
  }
}

/** Ist der Schritt fuer dieses Feld+Grund menschliche Handarbeit oder automatisch? */
function einkaufBrauchtHandarbeit(feld, grund) {
  if (!einkaufFeldBlockierend(feld)) return false;
  return !/^Kommt automatisch/.test(einkaufNaechsterSchritt(feld, grund));
}

function produktSucheTreffer(eintrag, q) {
  if (!q) return true;
  const n = q.trim().toLowerCase();
  if (!n) return true;
  const skus = (eintrag.varianten || []).map(v => v.sku).filter(Boolean).join(' ');
  return [eintrag.titel, eintrag.handle, skus].some(v => String(v ?? '').toLowerCase().includes(n));
}

/**
 * Baut je Produkt (Handle) eine Arbeitslisten-Zeile aus dem Einkauf-Dry-Run
 * (plan.json, Dimension: Titel/Gruppe/Varianten je gid) und dem frischeren
 * Klaerungslauf (offen.json, Feld+Grund je gid - das ist die tatsaechlich
 * noch offene Menge, plan.json selbst ist ein aelterer Zwischenstand).
 */
/**
 * Dieselben Zeilen wie Einkauf-Dry-Run (plan.json) und Klaerungslauf
 * (offen.json), aber aus dem Lexikon-Export, den der Sync-Dienst laufend
 * erneuert. Die beiden Septemberdateien wurden nie wieder erzeugt: der
 * Reiter meldete am 2026-10-12 "0 von 509 vollstaendig" und Luecken, die
 * laengst geschlossen waren, und kannte die 2.700 spaeter angelegten
 * Produkte nicht.
 *
 * Blockierend bleibt, was eine Bestellung verhindert (Lieferant,
 * Artikelnummer, Bestelleinheit). Eine Bestellbezeichnung des Lieferanten
 * ersetzt die Artikelnummer (Teppich nach Mass direkt vom Hersteller).
 * Nachtragen: Lieferanten-Produktseite, Farbnummer (nur bei Farbvarianten)
 * und Lieferanten-Produktname. Kollektion und Hersteller halten keine
 * Bestellung auf und werden hier nicht gezaehlt. Muster, Dienstleistungen,
 * Testprodukte und Sonderposten aus eigenem Bestand gehoeren nicht dazu.
 */
export function produktstatusAusLexikon(produkte = []) {
  const planRows = [];
  const offenRows = [];
  for (const p of produkte) {
    const handle = String(p?.handle ?? '');
    if (!handle || handle.startsWith('muster-') || handle.startsWith('test-') || /-sonderposten$/.test(handle)) continue;
    if (p.produktgruppe === 'Musterservice' || p.produktgruppe === 'Service') continue;
    for (const v of p.varianten || []) {
      if (v.original || !v.id) continue;
      const titel = String(v.titel ?? '');
      planRows.push({
        gid: v.id, handle, product_title: p.titel || handle, sku: v.sku || null, gruppe: p.produktgruppe || 'Unbekannt',
        // istStrukturellOffenerFall erkennt Wunschmass am Titel.
        variant_title: v.wunschmass && !/wunschma/i.test(titel) ? `${titel} (Wunschmaß)` : titel,
      });
      const e = v.einkauf || {};
      const offen = (field, reason) => offenRows.push({ gid: v.id, field, reason });
      if (!e.lieferant) offen('lieferant', 'Lieferant nicht hinterlegt');
      if (!e.artikelnummer && !e.produktname) offen('artikelnummer', e.lieferant ? 'Artikelnummer nicht hinterlegt' : 'Lieferant unklar');
      if (!e.bestelleinheit) offen('bestelleinheit', 'Bestelleinheit nicht hinterlegt');
      if (v.farbe && !e.farbnummer) offen('farbnummer', e.lieferant ? 'Farbnummer nicht hinterlegt' : 'Lieferant unklar');
      if (!e.url) offen('lieferant_url', 'Lieferanten-Produktseite nicht hinterlegt');
      if (!e.produktname) offen('lieferant_produktname', 'Lieferanten-Produktname nicht hinterlegt');
    }
  }
  return { planRows, offenRows };
}

function produktstatusAufbauen(planRows, offenRows) {
  const dim = new Map(planRows.map(r => [r.gid, r]));
  const produkte = new Map();
  for (const r of planRows) {
    if (produkte.has(r.handle)) {
      produkte.get(r.handle).varianten.push({ gid: r.gid, sku: r.sku, variante: r.variant_title });
      continue;
    }
    produkte.set(r.handle, {
      handle: r.handle,
      titel: r.product_title,
      gruppe: r.gruppe || 'Unbekannt',
      varianten: [{ gid: r.gid, sku: r.sku, variante: r.variant_title }],
      offeneFelderRoh: new Map(), // feld -> {grund, varianten:Set}
    });
  }

  for (const o of offenRows) {
    const dr = dim.get(o.gid);
    if (!dr) continue; // Variante nicht (mehr) im Dry-Run-Plan - kann verwaist sein, wird nicht erfunden
    if (istStrukturellOffenerFall(o.field, dr.gruppe, dr.variant_title)) continue; // keine Aufgabe, siehe Kommentar oben
    const p = produkte.get(dr.handle);
    if (!p) continue;
    const bestehend = p.offeneFelderRoh.get(o.field);
    if (bestehend) bestehend.varianten.add(o.gid);
    else p.offeneFelderRoh.set(o.field, { grund: o.reason, varianten: new Set([o.gid]) });
  }

  const eintraege = [];
  for (const p of produkte.values()) {
    let offeneFelder = [...p.offeneFelderRoh.entries()].map(([feld, info]) => ({
      feld,
      klartext: einkaufFeldKlartext(feld),
      blockierend: einkaufFeldBlockierend(feld),
      grund: info.grund || 'kein Grund hinterlegt',
      naechsterSchritt: einkaufNaechsterSchritt(feld, info.grund),
      handarbeit: einkaufBrauchtHandarbeit(feld, info.grund),
      variantenBetroffen: info.varianten.size,
    }));
    // Kaskade: ist der Lieferant selbst offen, sind Artikel-/Farbnummer nur
    // eine Folge davon - nicht als eigene Handlungspunkte doppeln.
    if (offeneFelder.some(f => f.feld === 'lieferant' || f.feld === 'lieferant/artikelnummer')) {
      offeneFelder = offeneFelder.filter(f => !/Lieferant unklar/i.test(f.grund) || f.feld === 'lieferant' || f.feld === 'lieferant/artikelnummer');
    }
    offeneFelder.sort((a, b) => (b.blockierend - a.blockierend) || (b.handarbeit - a.handarbeit));

    const blockierendeFelder = offeneFelder.filter(f => f.blockierend);
    const handarbeitFelder = offeneFelder.filter(f => f.handarbeit);
    const vollstaendig = offeneFelder.length === 0;
    const status = vollstaendig ? 'vollstaendig' : handarbeitFelder.length ? 'handarbeit' : 'automatisch';

    eintraege.push({
      handle: p.handle,
      titel: p.titel,
      gruppe: p.gruppe,
      variantenAnzahl: p.varianten.length,
      varianten: p.varianten,
      vollstaendig,
      status,
      blockiertBestellung: blockierendeFelder.length > 0,
      offeneFelder,
      dringlichkeit: (blockierendeFelder.length * 1000) + (handarbeitFelder.length * 10) + offeneFelder.length,
    });
  }
  return eintraege;
}

/**
 * Kontaktdaten aus dem Shopify-Kundenstamm (kunden/kunden.json), nach E-Mail
 * und Name gebuendelt. Bestellungen tragen nicht immer eine Telefonnummer -
 * der Kundenstamm hat sie oft trotzdem (aus der Lieferadresse, siehe
 * operations/lib/kunden.mjs::telefonVon). Am Telefon zaehlt genau das.
 */
function stammKontakte(dir) {
  const daten = readJsonIfExists(path.join(dir, 'kunden', 'kunden.json'));
  const index = new Map();
  for (const k of daten?.kunden ?? []) {
    if (k.email) index.set(`mail:${String(k.email).toLowerCase()}`, k);
    if (k.name) index.set(`name:${String(k.name).toLowerCase()}`, k);
  }
  return index;
}

export function createApi({ gh = defaultGh, repo = DEFAULT_REPO, root = process.cwd(), rebuild = null, stateDir = null, ledgerPath = null, privatDirPath = null, now = () => new Date(), sitzungenVerwerfen = null, env = process.env, shopifyZugang = null, tailscale = leseTailscaleStatus, verbrauchSammeln = null, launchAgentsDir = null, ratgeberPdf = null } = {}) {
  const serviceLaden = createServiceLadenAbgleich({ root, env, jetzt: () => now().getTime() });
  let userCache = null;
  let labelCache = { at: 0, names: [] };
  // Prozesszustand des Knopfs "Jetzt aktualisieren" - genau ein Lauf gleichzeitig,
  // pro Serverprozess (nicht persistent; ein Neustart des Servers vergisst einen
  // noch laufenden Kindprozess, der aber unabhaengig weiterlaeuft und sein Ergebnis
  // ohnehin nur in aktualisierung.json schreibt).
  let aktualisierungLauf = null; // { seit, fehler, fertig } waehrend ein Lauf aktiv ist, sonst null
  // Ergebnis des letzten Knopf-Laufs. Bisher wurde ein Fehler gesetzt und im selben
  // Moment mit dem Lauf verworfen - die Oberflaeche meldete "abgeschlossen", auch
  // wenn der Lauf abgebrochen war.
  let letzterKnopfLauf = null;  // { seit, bis, fehler }

  // Claude-Verbrauch (#671): veraltet die Datei, rechnet sie ein Kindprozess im
  // Hintergrund neu (rund 10 s fuer eine Woche). Die Anfrage wartet nicht darauf,
  // und es laeuft hoechstens ein Lauf gleichzeitig.
  let verbrauchLauf = null;
  function verbrauchErneuern(dir) {
    if (verbrauchLauf) return true;
    const sammeln = verbrauchSammeln || (process.env.TP_VERBRAUCH_AUTO === '0' ? null
      : () => execFileP(process.execPath, [path.join(root, 'operations', 'scripts', 'claude-verbrauch.mjs')], {
        cwd: root, timeout: 3 * 60_000, maxBuffer: 1024 * 1024, env: { ...process.env, TP_PRIVAT_DIR: dir },
      }));
    if (!sammeln) return false;
    let lauf;
    try { lauf = Promise.resolve(sammeln(dir)); } catch (e) { lauf = Promise.reject(e); }
    verbrauchLauf = lauf
      .catch(e => logFehler('verbrauch', `Sammeln abgebrochen: ${String(e?.stderr || e?.message || e).split('\n')[0].slice(0, 300)}`))
      .finally(() => { verbrauchLauf = null; });
    return true;
  }

  // Tailscale: hoechstens einmal je Minute fragen, gleichzeitige Anfragen teilen sich die Antwort.
  let tailscaleStand = null;    // { at, wert }
  let tailscaleAbfrage = null;
  async function tailscaleZustand() {
    if (tailscaleStand && Date.now() - tailscaleStand.at < 60_000) return tailscaleStand.wert;
    if (!tailscaleAbfrage) {
      tailscaleAbfrage = Promise.resolve()
        // Bewusst process.env statt `env`: es geht um diesen Rechner, nicht um den Shop-Zugang.
        .then(() => tailscale())
        .catch(e => ({ status: 'unbekannt', zustand: null, meldung: String(e?.message || e).slice(0, 200) }))
        .then(wert => { tailscaleStand = { at: Date.now(), wert }; tailscaleAbfrage = null; return wert; });
    }
    return tailscaleAbfrage;
  }

  function manuellerZugangVorhanden() {
    const zugang = { ...ladeEnvLocal(path.join(root, '.env.local')), ...env };
    return Boolean(zugang.SHOPIFY_ADMIN_TOKEN || (zugang.SHOPIFY_CLIENT_ID && zugang.SHOPIFY_CLIENT_SECRET));
  }

  /**
   * Live-Zugang zur Shopify Admin API (nur Sonderposten). Einmal je Prozess
   * aufgebaut: der Client-Credentials-Tausch kostet eine Anfrage, und
   * erzeugeProxy erneuert den Token bei Ablauf selbst. Tests reichen eine
   * Attrappe als `shopifyZugang` hinein - kein Test spricht echtes Shopify.
   */
  let shopifyZugangCache = null;
  async function shopify() {
    if (shopifyZugang) { const ersatz = await shopifyZugang(); if (ersatz) return ersatz; }
    if (!shopifyZugangCache) {
      shopifyZugangCache = erzeugeProxy({ env: { ...ladeEnvLocal(process.env.TP_ENV_LOCAL || path.join(root, '.env.local')), ...env } })
        .catch((e) => { shopifyZugangCache = null; throw e; });
    }
    return shopifyZugangCache;
  }

  // Stand des laufenden Dienstes (Commit) - eine Fehlermeldung ist nur
  // nachstellbar, wenn klar ist, welcher Code lief. Einmal je Prozess.
  let versionCache;
  function dienstVersion() {
    if (versionCache === undefined) {
      try { versionCache = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null; }
      catch { versionCache = null; }
    }
    return versionCache;
  }

  const auditPath = path.join(root, '.router', 'control-center-audit.jsonl');
  function audit(entry) {
    try {
      fs.mkdirSync(path.dirname(auditPath), { recursive: true });
      fs.appendFileSync(auditPath, `${JSON.stringify({ at: now().toISOString(), ...entry })}\n`);
    } catch { /* Audit darf die Aktion nicht verhindern; der GitHub-Kommentar ist die fuehrende Spur. */ }
  }

  /** Handelnde Person fuer Anzeige/Protokoll: der angemeldete Dashboard-Benutzer, sonst der gh-Login (Notzugang). */
  function anzeigename(benutzer, actor) {
    return benutzer?.name || actor || 'unbekannt';
  }

  function merke(benutzer, actor, aktion, objekt) {
    protokolliere(protokollPfad(), { benutzer: anzeigename(benutzer, actor), aktion, objekt, jetzt: now() });
  }

  // Versandbuchungen derselben Bestellung laufen nacheinander: zwei schnelle Klicks lesen
  // sonst beide "offen" und buchten doppelt. Es gibt genau einen Dienst - die Kette im
  // Prozess reicht.
  const versandKetten = new Map();
  function nacheinander(schluessel, fn) {
    const lauf = (versandKetten.get(schluessel) || Promise.resolve()).catch(() => {}).then(fn);
    versandKetten.set(schluessel, lauf);
    lauf.finally(() => { if (versandKetten.get(schluessel) === lauf) versandKetten.delete(schluessel); }).catch(() => {});
    return lauf;
  }

  /**
   * Sonderposten ohne Shopify-Zugang: die Oberflaeche bekommt den Satz fuer den Laden, die
   * Einrichtungsanleitung (.env.local, Befehl) nur das Dienstprotokoll - einmal je Prozess.
   * Rundgang 26.10.: Mitarbeiter sahen Dateinamen und einen Terminalbefehl.
   */
  let sonderpostenOhneZugangGemeldet = false;
  function sonderpostenOhneZugang() {
    if (!sonderpostenOhneZugangGemeldet) { sonderpostenOhneZugangGemeldet = true; logFehler('sonderposten', KEIN_ZUGANG); }
    return { verfuegbar: false, keinZugang: true, hinweis: 'Geht an diesem Rechner nicht – der Shopify-Zugang fehlt. Bitte dem Inhaber Bescheid geben.' };
  }

  /** Angaben aus dem Versand-Dialog, begrenzt und ohne fremde Felder. */
  function versandAngaben(v) {
    const roh = v && typeof v === 'object' ? v : {};
    const nummer = String(roh.sendungsnummer ?? '').replace(/\s+/g, '').slice(0, 60) || null;
    return {
      sendungsnummer: nummer,
      versanddienst: nummer && VERSANDDIENSTE.includes(roh.versanddienst) ? roh.versanddienst : null,
      benachrichtigen: typeof roh.benachrichtigen === 'boolean' ? roh.benachrichtigen : null,
    };
  }

  /**
   * Haengt die Sendungsnummer schon an einer anderen Bestellung? Dann wird nichts geschrieben:
   * 409 mit den Bestellnummern, gebucht wird erst, wenn im Dialog ausdruecklich bestaetigt ist
   * (versand.trotzDoppelt). Ein Tippfehler oder der Einlieferungsbeleg statt der Paketnummer
   * schickte sonst zwei Kunden denselben Verfolgungslink (15.10.). Aufrufen, bevor etwas
   * geschrieben wird.
   */
  function pruefeSendungFrei({ dir, orderId, angaben, roh, modell, benutzer, actor }) {
    if (!angaben.sendungsnummer) return;
    const andere = andereBestellungenMitSendung(leseAuftragsstatus(auftragsstatusPfad(dir)), { orderId, sendungsnummer: angaben.sendungsnummer });
    if (!andere.length) return;
    const alle = modell ? [...modell.auftraege, ...modell.testauftraege] : [];
    const namen = andere.map(id => alle.find(a => a.id === id)?.name || 'eine andere Bestellung');
    if (roh?.trotzDoppelt === true) {
      merke(benutzer, actor, 'Sendungsnummer trotz Doppelung eingetragen', `${orderId}: ${angaben.sendungsnummer} steht auch an ${namen.join(', ')}`);
      return;
    }
    throw new ApiError(409, `Die Sendungsnummer ${angaben.sendungsnummer} steht schon an ${namen.join(', ')}. Jedes Paket hat seine eigene Nummer – bitte mit dem Paketaufkleber vergleichen.`,
      { doppelteSendung: { nummer: angaben.sendungsnummer, bestellungen: namen } });
  }

  /** Auftrag aus dem Bestellmodell; fehlt er (Export aelter als die Bestellung), reicht die ID fuer Shopify. */
  function auftragFuerVersand(dir, orderId) {
    const modell = ladeBestellModell(dir);
    const a = modell ? [...modell.auftraege, ...modell.testauftraege].find(x => x.id === orderId) : null;
    return a || { id: String(orderId), name: String(orderId), testbestellung: false, positionen: [] };
  }

  /**
   * Bekommt der Kunde die Versandmail? Was im Dialog angekreuzt war, sonst: ja - ausser alle
   * Positionen sind Muster, die jemand persoenlich vorbeibringt. Die Wahl steht danach an der
   * Position (versandMail) und gilt auch beim Nachholen.
   */
  function versandMailFuer(angaben, positionen) {
    if (typeof angaben.benachrichtigen === 'boolean') return angaben.benachrichtigen;
    return !(positionen.length && positionen.every(p => p?.musterHerkunft === 'eigen_vorbei'));
  }

  // Gruende, bei denen Nachholen nie hilft: kein roter Hinweis, kein Knopf - nur der Vermerk.
  const VERSAND_ENDGUELTIG = new Set(['storniert', 'nicht-gefunden', 'eingabe', 'testbestellung', 'unbekannt']);
  const vermerkStatus = grund => (grund === 'unklar' ? 'unklar' : VERSAND_ENDGUELTIG.has(grund) ? 'uebersprungen' : 'fehler');
  // Gruende je Position aus versand.mjs (ordneZu) in die Schreibweise der Gesamtgruende.
  const positionsGrund = g => (g === 'gehalten' ? 'zurueckgehalten' : g === 'nicht_buchbar' ? 'nicht-buchbar' : g);

  /**
   * "An Kunden raus" -> Versand in Shopify buchen (operations/lib/versand.mjs; Inhaber
   * 2026-10-13, Werkbank w-079). Laeuft NACH dem lokalen Schritt: der Schritt gilt immer,
   * die Ware ist ja raus. Scheitert die Buchung, steht das als Vermerk an der Position, im
   * Protokoll, im Dienstprotokoll und in der Antwort - nie still. Positionen mit Vermerk
   * "gebucht"/"bereits" werden nicht noch einmal versucht (doppelter Klick bucht nie doppelt).
   * Sendungsnummer und Mail-Wahl kommen aus dem Dialog, sonst von der Position (Nachholen).
   * Gibt die Kurzfassung fuer die Oberflaeche zurueck.
   */
  async function versandBuchen({ dir, auftrag, lineItemIds, angaben = {}, benutzer, actor, trotzVermerk = false }) {
    const file = auftragsstatusPfad(dir);
    return nacheinander(auftrag.id, async () => {
      const alle = leseAuftragsstatus(file);
      const eintrag = id => alle[positionKey(auftrag.id, id)];
      // trotzVermerk: "In Shopify nachbuchen" aus der Abweichungsliste - dort steht fest, dass
      // Shopify die Position offen fuehrt, auch wenn der Vermerk anderes sagt (Sendung in Shopify
      // storniert). bucheVersand liest frisch; doppelt gebucht wird auch dann nie.
      const ids = [...new Set(lineItemIds)].filter(id => trotzVermerk || !['gebucht', 'bereits'].includes(eintrag(id)?.shopifyVersand?.status));
      if (!ids.length) return { status: 'bereits', meldung: 'In Shopify war das schon als versendet gebucht.', gebucht: 0, bereits: lineItemIds.length, nichtGebucht: 0 };
      const am = now().toISOString();
      const nummer = angaben.sendungsnummer || ids.map(id => eintrag(id)?.sendungsnummer).find(Boolean) || null;
      const dienst = angaben.sendungsnummer ? angaben.versanddienst : (ids.map(id => eintrag(id)?.versanddienst).find(Boolean) || null);
      const gespeichert = ids.map(id => eintrag(id)?.versandMail).find(v => typeof v === 'boolean');
      const benachrichtigen = typeof angaben.benachrichtigen === 'boolean' ? angaben.benachrichtigen
        : gespeichert ?? versandMailFuer({}, (auftrag.positionen || []).filter(p => ids.includes(p.lineItemId)));
      const vermerk = (id, v) => {
        try { vermerkeShopifyVersand(file, { orderId: auftrag.id, lineItemId: id, vermerk: { am, ...v } }); } catch (e) { logFehler('versand', `${auftrag.name}: Vermerk nicht gespeichert (${String(e?.message || e).split('\n')[0]})`); }
      };
      const protokolliereFehlschlag = (status, grund, meldung, anzahl) => {
        if (status === 'uebersprungen') return; // endgueltig, kein Handlungsbedarf
        merke(benutzer, actor, status === 'unklar' ? 'Versand in Shopify unklar' : 'Versand in Shopify nicht gebucht', `${auftrag.name}: ${anzahl} Artikel · ${meldung}`);
        logFehler('versand', `${auftrag.name}: ${status} (${grund}) - ${meldung}`);
      };
      const fehlschlag = (grund, meldung) => {
        const status = vermerkStatus(grund);
        for (const id of ids) vermerk(id, { status, grund, meldung });
        protokolliereFehlschlag(status, grund, meldung, ids.length);
        audit({ actor, action: 'versand-shopify', orderId: auftrag.id, status, grund, anzahl: ids.length });
        return { status, grund, meldung, gebucht: 0, bereits: 0, nichtGebucht: ids.length };
      };
      // Testbestellungen zaehlen nirgends - und eine Versandmail an eine Testadresse hilft niemandem.
      if (auftrag.testbestellung) return fehlschlag('testbestellung', 'Testbestellung – in Shopify nicht gebucht.');
      let zugang;
      try { zugang = await shopify(); } catch (e) {
        return fehlschlag('nicht-erreichbar', `Versand nicht in Shopify gebucht: ${mitHinweis(String(e?.message || e).split('\n')[0])}`.slice(0, 400));
      }
      if (zugang?.art === 'sammeln') return fehlschlag('kein-zugang', 'Versand nicht in Shopify gebucht: kein Zugang zu Shopify eingerichtet. Bitte in Shopify „Artikel versenden“ wählen.');
      let r;
      try {
        r = await bucheVersand(zugang.proxy, { orderId: auftrag.id, lineItemIds: ids, benachrichtigen, sendungsnummer: nummer, versanddienst: dienst });
      } catch (e) {
        if (!(e instanceof VersandFehler)) {
          // Unerwarteter Fehler: ob Shopify schon gebucht hat, ist offen - also "unklar", nie "nicht gebucht".
          return fehlschlag('unklar', `Ob der Versand in Shopify gebucht wurde, ist unklar (${String(e?.message || e).split('\n')[0].slice(0, 160)}). Bitte in Shopify nachsehen.`);
        }
        const bereits = e.extra?.bereits ?? [];
        for (const id of bereits) vermerk(id, { status: 'bereits' });
        const rest = ids.filter(id => !bereits.includes(id));
        // Je Position der eigene Grund (zurueckgehalten, unbekannt ...), sonst der der Buchung.
        const einzeln = new Map((e.extra?.nichtGebucht ?? []).map(n => [n.lineItemId, n]));
        for (const id of rest) {
          const n = einzeln.get(id);
          const grund = n ? positionsGrund(n.grund) : e.grund;
          vermerk(id, { status: vermerkStatus(grund), grund, meldung: n ? `Versand nicht in Shopify gebucht: ${n.meldung}.` : e.message });
        }
        const status = vermerkStatus(e.grund);
        protokolliereFehlschlag(status, e.grund, e.message, rest.length);
        audit({ actor, action: 'versand-shopify', orderId: auftrag.id, status, grund: e.grund, anzahl: rest.length });
        return { status, grund: e.grund, meldung: e.message, gebucht: 0, bereits: ids.length - rest.length, nichtGebucht: rest.length };
      }
      for (const id of r.gebucht) vermerk(id, { status: 'gebucht', fulfillmentId: r.fulfillmentIds[0] || null, kundeBenachrichtigt: r.kundeBenachrichtigt });
      for (const id of r.bereits) vermerk(id, { status: 'bereits' });
      for (const n of r.nichtGebucht) {
        const grund = positionsGrund(n.grund);
        vermerk(n.lineItemId, { status: vermerkStatus(grund), grund, meldung: `Versand nicht in Shopify gebucht: ${n.meldung}.` });
      }
      const sendung = r.sendungsnummer ? ` · Sendung ${r.versanddienst ? `${r.versanddienst} ` : ''}${r.sendungsnummer}` : '';
      const mail = r.kundeBenachrichtigt ? ' – der Kunde bekommt die Versandmail' : ' (ohne Mail an den Kunden)';
      const pruef = r.gegenprobe === 'ok' ? '' : r.gegenprobe === 'abweichung' ? ' · Gegenprobe weicht ab, bitte in Shopify ansehen' : ' · Gegenprobe nicht lesbar';
      let meldung;
      if (r.status === 'bereits') meldung = 'In Shopify war das schon als versendet gebucht.';
      else if (r.status === 'teilweise') meldung = `${r.gebucht.length} von ${ids.length} Artikeln in Shopify als versendet gebucht${mail}. Nicht gebucht: ${r.nichtGebucht[0].meldung}.`;
      else meldung = `In Shopify als versendet gebucht${mail}.`;
      if (r.gebucht.length) {
        merke(benutzer, actor, 'Versand in Shopify gebucht', `${auftrag.name}: ${r.gebucht.length} Artikel${r.kundeBenachrichtigt ? ' · Versandmail an Kunden' : ' · ohne Mail'}${sendung}${r.aufgehoben ? ' · Zurückhaltung „Bestand fehlt“ aufgehoben' : ''}${r.antwortVerloren ? ' · Antwort verloren, per Lesen bestätigt' : ''}${pruef}`);
      }
      // Je Grund eine Zeile: "unklar" darf nie als "nicht gebucht" im Protokoll stehen.
      const jeGrund = new Map();
      for (const n of r.nichtGebucht) { const g = positionsGrund(n.grund); if (!jeGrund.has(g)) jeGrund.set(g, { meldung: n.meldung, anzahl: 0 }); jeGrund.get(g).anzahl += 1; }
      for (const [g, { meldung: m, anzahl }] of jeGrund) protokolliereFehlschlag(vermerkStatus(g), g, m, anzahl);
      audit({ actor, action: 'versand-shopify', orderId: auftrag.id, status: r.status, gebucht: r.gebucht.length, bereits: r.bereits.length, nichtGebucht: r.nichtGebucht.length, gegenprobe: r.gegenprobe });
      return {
        status: r.status, meldung, gebucht: r.gebucht.length, bereits: r.bereits.length + (lineItemIds.length - ids.length), nichtGebucht: r.nichtGebucht.length,
        kundeBenachrichtigt: r.kundeBenachrichtigt && r.gebucht.length > 0, sendungsnummer: r.sendungsnummer, gegenprobe: r.gegenprobe,
      };
    });
  }

  /**
   * Nachholen: Positionen dieses Auftrags, deren Buchung scheiterte oder unklar blieb, erneut
   * buchen. Je Sendung (Nummer, Dienst, Mail-Wahl) eine eigene Buchung - zwei Pakete mit
   * verschiedenen Nummern duerfen nicht unter einer Nummer landen.
   */
  async function versandNachholen(payload, benutzer, actor) {
    const { orderId } = payload || {};
    if (!orderId) throw new ApiError(400, 'orderId ist Pflicht', { missing: ['orderId'] });
    const dir = privatDirPath || privatDir();
    const auftrag = auftragFuerVersand(dir, String(orderId));
    const statusAlle = leseAuftragsstatus(auftragsstatusPfad(dir));
    // Ohne Positionen im Modell (Export aelter): die Vermerke in der Ablage selbst durchsuchen.
    const quelle = auftrag.positionen?.length ? auftrag
      : { ...auftrag, positionen: Object.values(statusAlle).filter(e => e?.orderId === String(orderId)).map(e => ({ lineItemId: e.lineItemId })) };
    const offen = versandNachzuholen(quelle, statusAlle);
    if (!offen) throw new ApiError(409, 'Hier ist nichts nachzubuchen – der Versand ist in Shopify gebucht oder wurde nie versucht.');
    const sendungen = new Map();
    for (const id of offen.lineItemIds) {
      const e = statusAlle[positionKey(auftrag.id, id)] || {};
      const schluessel = JSON.stringify([e.sendungsnummer || null, e.versanddienst || null, typeof e.versandMail === 'boolean' ? e.versandMail : null]);
      if (!sendungen.has(schluessel)) sendungen.set(schluessel, { angaben: { sendungsnummer: e.sendungsnummer || null, versanddienst: e.versanddienst || null, benachrichtigen: typeof e.versandMail === 'boolean' ? e.versandMail : null }, ids: [] });
      sendungen.get(schluessel).ids.push(id);
    }
    const teile = [];
    for (const { angaben, ids } of sendungen.values()) {
      // eslint-disable-next-line no-await-in-loop -- je Sendung nacheinander, dieselbe Bestellung.
      teile.push(await versandBuchen({ dir, auftrag, lineItemIds: ids, angaben, benutzer, actor }));
    }
    const schlecht = teile.find(t => !['gebucht', 'bereits'].includes(t.status));
    const shopifyErgebnis = teile.length === 1 ? teile[0] : {
      status: schlecht ? (teile.some(t => t.gebucht) ? 'teilweise' : schlecht.status) : teile.some(t => t.gebucht) ? 'gebucht' : 'bereits',
      meldung: schlecht ? schlecht.meldung : teile.map(t => t.meldung).find(Boolean),
      gebucht: teile.reduce((n, t) => n + (t.gebucht || 0), 0), bereits: teile.reduce((n, t) => n + (t.bereits || 0), 0), nichtGebucht: teile.reduce((n, t) => n + (t.nichtGebucht || 0), 0),
      kundeBenachrichtigt: teile.some(t => t.kundeBenachrichtigt),
    };
    return { ok: true, orderId: auftrag.id, shopify: shopifyErgebnis, ...versandFelder(quelle, leseAuftragsstatus(auftragsstatusPfad(dir))) };
  }

  /** Additives Feld je Auftrag: misslungene Versandbuchung, die sich nachholen laesst. */
  function versandFelder(auftrag, statusAlle) {
    const n = versandNachzuholen(auftrag, statusAlle);
    return { versandNachholen: n ? { anzahl: n.anzahl, unklar: n.unklar, ausstehend: n.ausstehend, meldung: n.meldung } : null };
  }

  /**
   * "Erledigt" -> Versand in Shopify buchen (Inhaber 2026-10-19, operations/lib/shopify-abgleich.mjs):
   * Positionen, die gerade auf "Erledigt" gegangen sind und in Shopify noch nicht als versendet
   * gelten, bucht derselbe Weg wie "raus" - mit Gegenprobe und Vermerk, aber ohne Mail an den
   * Kunden (bereiteStatusVor merkt sich das als versandMail: false, auch fuers Nachholen).
   * Gilt fuer Ware und Muster. Testbestellungen und stornierte Bestellungen bucht versandBuchen
   * ohnehin nicht. Ist danach keine Ware mehr offen, gehen Eigenleistungen (Kettelservice) mit -
   * sonst bliebe die Bestellung in Shopify "teilweise versendet". null = nichts zu buchen.
   */
  /**
   * Packstation -> Wareneingang (#1706): wer ein Muster als eingelegt abhakt oder den Umschlag packt,
   * hat es in der Hand. Positionen, die noch auf "bestellt" stehen, gehen deshalb auf "geliefert" -
   * bis dahin meldeten Zeitleiste und To-dos weiter "beim Lieferanten nachhaken" und nach 14 Tagen
   * "bestellt und nicht da", obwohl der Umschlag laengst gepackt war. Nur vorwaerts, nie bei
   * Direktversand (ueber: 'kunde'), nicht gegen eine laufende Musterautomatik oder eine offene
   * Fehlmenge. Wirft nie: scheitert der Eintrag, bleibt der Haken trotzdem gesetzt.
   */
  function wareneingangAusPackstation({ positionen, actor, notiz }) {
    const dir = privatDirPath || privatDir();
    const file = auftragsstatusPfad(dir);
    try {
      const alle = leseAuftragsstatus(file);
      const modell = ladeBestellModell(dir);
      const auftraege = new Map([...(modell?.auftraege || []), ...(modell?.testauftraege || [])].map(a => [a.id, a]));
      const angaben = [];
      for (const { orderId, lineItemId } of positionen || []) {
        const e = alle[positionKey(orderId, lineItemId)];
        if (e?.status !== 'bestellt' || e.ueber === 'kunde' || e.uebernahme?.id === 'musterautomatik') continue;
        const p = (auftraege.get(orderId)?.positionen || []).find(x => x.lineItemId === lineItemId);
        const bestellmenge = p?.bestellSoll || p?.bestellmenge || null;
        if (!darfWeiter(beschaffungsStand(e, bestellmenge), 'geliefert')) continue;
        angaben.push({ orderId, lineItemId, status: 'geliefert', actor, bestellmenge, notiz, jetzt: now() });
      }
      if (angaben.length) setzeStatusPositionen(file, angaben);
      return { anzahl: angaben.length };
    } catch (e) {
      return { anzahl: 0, fehler: e.message };
    }
  }

  async function erledigtBuchen({ dir, auftrag, lineItemIds, benutzer, actor }) {
    if (!auftrag || !lineItemIds?.length) return null;
    const alle = leseAuftragsstatus(auftragsstatusPfad(dir));
    const eintrag = id => alle[positionKey(auftrag.id, id)];
    const fertig = id => ['gebucht', 'bereits', 'uebersprungen'].includes(eintrag(id)?.shopifyVersand?.status);
    const ids = new Set(lineItemIds.filter(id => !fertig(id)));
    const stufe = id => STATUS_ORDER.indexOf(eintrag(id)?.status);
    const positionen = (auftrag.positionen || []).filter(p => p.lineItemId);
    const wareOffen = positionen.some(p => !p.eigenleistung && (p.menge ?? 1) > 0 && stufe(p.lineItemId) < STATUS_ORDER.indexOf('raus'));
    if (ids.size && !wareOffen) {
      for (const p of positionen) if (p.eigenleistung && stufe(p.lineItemId) < STATUS_ORDER.indexOf('raus') && !fertig(p.lineItemId)) ids.add(p.lineItemId);
    }
    if (!ids.size) return null;
    return versandBuchen({ dir, auftrag, lineItemIds: [...ids], angaben: { benachrichtigen: false }, benutzer, actor });
  }

  /**
   * Shopify -> Control Center: einmal je neuem Bestellexport (Groesse und Aenderungszeit von
   * orders.json). Der Dienst ist der einzige Schreiber von auftragsstatus.json - deshalb laeuft
   * der Abgleich hier und nicht im Sync-Dienst. Zwischen Lesen und Schreiben steht kein await,
   * ein Klick im selben Prozess kann sich nicht dazwischenschieben. Eine unlesbare Ablage wird
   * nie ueberschrieben (leseAlle wirft); der Fehler steht im Dienstprotokoll.
   */
  let abgleichKennung = null;
  let letzterAbgleich = null;
  function shopifyAbgleichen(dir = privatDirPath || privatDir()) {
    const ordersDatei = path.join(dir, 'bestelluebersicht', 'orders.json');
    let st;
    try { st = fs.statSync(ordersDatei); } catch { return letzterAbgleich; }
    const kennung = `${dir}:${st.size}:${st.mtimeMs}:${st.ctimeMs}:${st.ino}`;
    if (kennung === abgleichKennung) return letzterAbgleich;
    abgleichKennung = kennung;
    const orders = exportOrders(readJsonIfExists(ordersDatei));
    if (!orders) return letzterAbgleich;
    const statusDatei = auftragsstatusPfad(dir);
    const am = now().toISOString();
    let r;
    try {
      r = uebernimmAusShopify(leseAuftragsstatus(statusDatei), orders, { jetzt: now() });
      if (r.gehoben.length || r.storniert.length || r.vermerkt.length) schreibeAuftragsstatus(statusDatei, r.positionen);
    } catch (e) {
      logFehler('abgleich', `Shopify-Abgleich nicht geschrieben: ${String(e?.message || e).split('\n')[0]}`);
      letzterAbgleich = { am, fehler: String(e?.message || e).split('\n')[0], gehoben: 0, storniert: 0, vermerkt: 0 };
      return letzterAbgleich;
    }
    // Protokoll je Bestellung - wer im Dashboard nachsieht, warum etwas "raus" steht, findet es dort.
    const jeAuftrag = (liste) => {
      const m = new Map();
      for (const x of liste) m.set(x.orderName || x.orderId, (m.get(x.orderName || x.orderId) || 0) + 1);
      return m;
    };
    for (const [name, n] of jeAuftrag(r.gehoben)) merke(null, ABGLEICH_VON, 'Aus Shopify übernommen', `${name}: ${n} Artikel → An Kunden raus (in Shopify versendet)`);
    for (const [name, n] of jeAuftrag(r.storniert)) merke(null, ABGLEICH_VON, 'Aus Shopify übernommen', `${name}: ${n} Artikel → Erledigt (in Shopify storniert)`);
    if (r.gehoben.length || r.storniert.length || r.vermerkt.length) {
      audit({ actor: ABGLEICH_VON, action: 'shopify-abgleich', gehoben: r.gehoben.length, storniert: r.storniert.length, vermerkt: r.vermerkt.length });
    }
    letzterAbgleich = { am, fehler: null, gehoben: r.gehoben.length, storniert: r.storniert.length, vermerkt: r.vermerkt.length };
    return letzterAbgleich;
  }

  /** Abweichungsliste "im Dashboard abgehakt, in Shopify offen" (je Bestellung), mit Artikeltexten aus dem Modell. */
  function abweichungsListe(dir) {
    return abgleichListe(dir, shopifyAbweichungen);
  }

  /**
   * Gemeinsamer Weg der Abgleichslisten: Export und Auftragsstatus lesen, die Liste bilden und je
   * Position Titel, Farbe und Lieferant aus dem Bestellmodell dazulegen. null ohne Export.
   */
  function abgleichListe(dir, bilde) {
    const daten = readJsonIfExists(path.join(dir, 'bestelluebersicht', 'orders.json'));
    const orders = exportOrders(daten);
    if (!orders) return null;
    const modell = ladeBestellModell(dir);
    const auftraege = new Map([...(modell?.auftraege || []), ...(modell?.testauftraege || [])].map(a => [a.id, a]));
    return bilde(leseAuftragsstatus(auftragsstatusPfad(dir)), orders, { exportiertAm: daten.exportiertAm || null }).map(z => {
      const a = auftraege.get(z.orderId);
      const artikel = z.positionen.map(p => {
        const m = (a?.positionen || []).find(x => x.lineItemId === p.lineItemId);
        return { ...p, titel: m?.titel || null, farbe: m?.farbe && m.farbe !== '–' ? m.farbe : null, lieferant: m?.lieferant || null };
      });
      return { ...z, positionen: artikel, exportiertAm: daten.exportiertAm || null };
    });
  }

  /**
   * "In Shopify nachbuchen" aus der Abweichungsliste: genau die Positionen dieser Bestellung,
   * die im Dashboard raus/erledigt sind und in Shopify offen - ohne Mail an den Kunden.
   */
  async function shopifyNachbuchen(payload, benutzer, actor) {
    const { orderId } = payload || {};
    if (!orderId) throw new ApiError(400, 'orderId ist Pflicht', { missing: ['orderId'] });
    const dir = privatDirPath || privatDir();
    const zeile = (abweichungsListe(dir) || []).find(z => z.orderId === String(orderId));
    if (!zeile) throw new ApiError(409, 'Diese Bestellung weicht nicht mehr ab – im Dashboard und in Shopify steht dasselbe.');
    const auftrag = auftragFuerVersand(dir, String(orderId));
    const shopifyErgebnis = await versandBuchen({ dir, auftrag, lineItemIds: zeile.lineItemIds, angaben: { benachrichtigen: false }, benutzer, actor, trotzVermerk: true });
    const offen = (abweichungsListe(dir) || []).length;
    return { ok: true, orderId: String(orderId), shopify: shopifyErgebnis, abweichungen: offen };
  }

  /** Zeitleisten aller Auftraege (orderId -> { auftragsart, verlauf, naechsterSchritt, ... }). */
  function zeitleisten(dir, modell, statusAlle) {
    // Gepackte Umschlaege aendern nur den Text des naechsten Schritts (#1709). Eine beschaedigte
    // Packablage meldet die Packstation selbst; die Zeitleisten laufen dann ohne diese Angabe.
    let gepackt = {};
    try { gepackt = leseMusterPackStand(musterPackenPfad(dir)).gepackt; } catch { /* siehe oben */ }
    return zeitleistenFuerModell(modell, { statusAlle, verlaufAlle: leseVerlauf(auftragsverlaufPfad(dir)), gepackt, jetzt: now() });
  }

  /** Die additiven Zeitleisten-Felder eines Auftrags fuer die Antwort. */
  function zeitleistenFelder(z) {
    if (!z) return { auftragsart: null, verlauf: [], verlaufNotizen: [], naechsterSchritt: null, zeitleisteAbgeschlossen: false };
    return { auftragsart: z.auftragsart, verlauf: z.verlauf, verlaufNotizen: z.verlaufNotizen, naechsterSchritt: z.naechsterSchritt, zeitleisteAbgeschlossen: z.abgeschlossen };
  }

  /** Dringendster naechster Schritt ueber die echten Bestellungen eines Kunden, mit Bezug zur Bestellung. */
  function kundenSchritt(auftraege, zl) {
    const kandidaten = (auftraege || []).filter(a => !a.testbestellung)
      .map(a => { const n = zl.get(a.id)?.naechsterSchritt; return n ? { ...n, orderId: a.id, orderName: a.name } : null; });
    return dringendsterSchritt(kandidaten);
  }

  /**
   * Setzt einen Schritt der Zeitleiste fuer einen ganzen Auftrag.
   * - bestellt/geliefert/raus/erledigt: wie bisher je Position (auftragsstatus.json), fuer alle Positionen,
   *   die den Schritt noch nicht erreicht haben.
   * - kunde_hat_muster/nachgefasst/kunde_hat_bestellt/kein_interesse/notiz/zurueck: Ereignis je Auftrag
   *   (auftragsverlauf.json, nur anhaengen). Ein Ergebnis schliesst zusaetzlich die Positionen ab.
   */
  async function auftragsSchrittSetzen(payload, benutzer, actor) {
    const { orderId, schritt, notiz, bezug, lieferantBestellnummer, lineItemIds } = payload || {};
    if (!orderId || !schritt) throw new ApiError(400, 'orderId und schritt sind Pflicht', { missing: ['orderId', 'schritt'] });
    if (!SCHRITT_WERTE.includes(schritt)) throw new ApiError(400, `Unbekannter Schritt „${schritt}"`);
    const dir = privatDirPath || privatDir();
    const modell = ladeBestellModell(dir);
    const auftrag = modell ? [...modell.auftraege, ...modell.testauftraege].find(a => a.id === orderId) : null;
    if (!auftrag) throw new ApiError(404, 'Bestellung nicht gefunden – Bestelldaten evtl. inzwischen aktualisiert.');
    const statusDatei = auftragsstatusPfad(dir);
    const vorher = zeitleisten(dir, modell, leseAktuellenStatus(statusDatei, modell)).get(orderId);
    const art = vorher.auftragsart;
    if (!['notiz', 'zurueck'].includes(schritt) && !setzbareSchritte(art).includes(schritt)) {
      throw new ApiError(400, `Der Schritt „${schritt}" gehört nicht zu ${art === 'muster' ? 'einer Musterbestellung' : 'einer Warenbestellung'}`);
    }
    const allePositionen = auftrag.positionen.filter(p => p.lineItemId);
    // Teillieferung (Versand-Dialog): nur die angekreuzten Positionen. Ohne Angabe wie bisher alle.
    const auswahl = Array.isArray(lineItemIds) ? new Set(lineItemIds.map(String)) : null;
    if (auswahl && schritt !== 'raus') throw new ApiError(400, 'Eine Auswahl einzelner Artikel gibt es nur beim Schritt „raus“');
    const positionen = auswahl ? allePositionen.filter(p => auswahl.has(p.lineItemId)) : allePositionen;
    if (auswahl && !positionen.length) throw new ApiError(400, 'Bitte mindestens einen Artikel dieser Bestellung auswählen');
    const angaben = versandAngaben(payload?.versand);
    if (schritt === 'raus') pruefeSendungFrei({ dir, orderId, angaben, roh: payload?.versand, modell, benutzer, actor });
    // "Muster nicht verfuegbar": die angekreuzten Muster werden im Shop gesperrt; die Notiz nennt
    // ihre Farben (Pflicht - aus den Kaestchen, dazu der Freitext).
    let notizText = notiz;
    let sperrPositionen = [];
    if (schritt === 'muster_nicht_verfuegbar') {
      const gewaehlt = new Set((Array.isArray(payload?.muster) ? payload.muster : []).map(String));
      sperrPositionen = allePositionen.filter(p => p.istMuster && gewaehlt.has(p.lineItemId));
      if (sperrPositionen.length !== gewaehlt.size) throw new ApiError(400, 'Bitte nur Muster dieser Bestellung ankreuzen');
      const frei = String(notiz ?? '').trim();
      const farben = musterKurz(sperrPositionen).join('; ');
      notizText = [farben ? `Nicht verfügbar: ${farben}` : null, frei || null].filter(Boolean).join(' – ') || null;
      if (!notizText) throw new ApiError(400, 'Bitte die betroffenen Farben ankreuzen oder in der Notiz nennen');
      // Ablage vorher lesen: ist sie beschaedigt, wird gar nichts geschrieben - auch kein Schritt.
      if (sperrPositionen.length) {
        try { leseSperren(mustersperrePfad(dir)); } catch (e) { throw new ApiError(e.status || 500, e.message); }
      }
    }
    const setzePositionen = (status, text, versandMail = null) => {
      if (!positionen.length) throw new ApiError(400, 'Diese Bestellung hat keine nachverfolgbaren Positionen');
      const alle = leseAktuellenStatus(statusDatei, modell);
      const ziel = STATUS_ORDER.indexOf(status);
      const stufe = p => STATUS_ORDER.indexOf(alle[positionKey(orderId, p.lineItemId)]?.status);
      // Nur Positionen, die noch nicht so weit sind. Sind alle schon weiter, ist der Klick eine
      // bewusste Korrektur zurueck - dann gilt er fuer alle.
      const dahinter = positionen.filter(p => stufe(p) < ziel);
      const betroffen = dahinter.length ? dahinter : positionen.filter(p => stufe(p) !== ziel);
      const blockiert = positionen.map(p => alle[positionKey(orderId, p.lineItemId)]).find(e => !darfWeiter(e, status));
      if (blockiert) throw new ApiError(409, blockiert.beschaffung?.klaerung || 'Die bestätigte Fehlmenge ist noch offen. Zuerst den Wareneingang vervollständigen.');
      setzeStatusPositionen(statusDatei, betroffen.map(p => ({ orderId, lineItemId: p.lineItemId, status, actor, bestellmenge: p.bestellSoll || p.bestellmenge || null, lieferantBestellnummer, notiz: text, jetzt: now(),
        ...(status === 'raus' ? { sendungsnummer: angaben.sendungsnummer, versanddienst: angaben.versanddienst, versandMail } : {}) })));
      return betroffen.map(p => p.lineItemId);
    };
    // Nur eine neue Sendung wird gebucht: Positionen, die vor dem Klick noch nicht "raus" waren.
    // Die Korrektur von "erledigt" zurueck auf "raus" bucht nichts nachtraeglich.
    const vorRaus = () => {
      const alle = leseAktuellenStatus(statusDatei, modell);
      return new Set(positionen.filter(p => STATUS_ORDER.indexOf(alle[positionKey(orderId, p.lineItemId)]?.status) < STATUS_ORDER.indexOf('raus')).map(p => p.lineItemId));
    };
    let anzahl = 0;
    // Positionen, die in diesem Schritt raus gehen - die bucht Shopify danach als versendet.
    let rausIds = [];
    // Positionen, die in diesem Schritt erledigt werden - die bucht Shopify ohne Kundenmail, wenn
    // dort noch offen (erledigtBuchen). Ein zweiter Klick auf "Erledigt" bucht nichts erneut.
    let erledigtIds = [];
    const vorErledigt = () => {
      const alle = leseAktuellenStatus(statusDatei, modell);
      return new Set(positionen.filter(p => alle[positionKey(orderId, p.lineItemId)]?.status !== 'erledigt').map(p => p.lineItemId));
    };
    try {
      if (STATUS_ORDER.includes(schritt)) {
        const neu = schritt === 'raus' ? vorRaus() : null;
        const offenVorher = schritt === 'erledigt' ? vorErledigt() : null;
        const ids = setzePositionen(schritt, notiz, schritt === 'raus' ? versandMailFuer(angaben, positionen) : null);
        anzahl = ids.length;
        if (neu) rausIds = ids.filter(id => neu.has(id));
        if (offenVorher) erledigtIds = ids.filter(id => offenVorher.has(id));
      } else {
        // Verlauf und alle Positionsregeln pruefen, bevor irgendeine der beiden Dateien geschrieben wird.
        const ereignis = bereiteEreignisVor(auftragsverlaufPfad(dir), { orderId, schritt, actor, notiz: notizText, bezug, jetzt: now() });
        // Muster aus eigenem Bestand: "Erledigt – Kunde hat Muster" ist zugleich die Uebergabe
        // (vorbeigebracht bzw. verschickt) - sonst bliebe "raus" als Luecke im Verlauf stehen.
        if (schritt === 'kunde_hat_muster' && vorher.eigenerBestand && positionen.length) {
          const alle = leseAktuellenStatus(statusDatei, modell);
          if (positionen.some(p => STATUS_ORDER.indexOf(alle[positionKey(orderId, p.lineItemId)]?.status) < STATUS_ORDER.indexOf('raus'))) {
            const neu = vorRaus();
            // "Kunde hat Muster": der Kunde hat sie schon - eine Mail "ist unterwegs" verwirrt nur.
            // Shopify bucht trotzdem, damit die Bestellung dort nicht ewig offen steht.
            const ids = setzePositionen('raus', vorher.eigenerBestand === 'vorbei' ? 'Persönlich übergeben' : 'Aus eigenem Bestand verschickt', false);
            anzahl = ids.length;
            rausIds = ids.filter(id => neu.has(id));
          }
        }
        if (ERGEBNIS_SCHRITTE.includes(schritt) && positionen.length) {
          const offenVorher = vorErledigt();
          const ids = setzePositionen('erledigt', `Ergebnis: ${SCHRITT_LABEL.muster[schritt]}${notizText ? ` – ${notizText}` : ''}`);
          anzahl = ids.length;
          erledigtIds = ids.filter(id => offenVorher.has(id));
        }
        schreibeVerlauf(auftragsverlaufPfad(dir), ereignis.auftraege);
      }
    } catch (e) {
      if (e instanceof AuftragsverlaufFehler || e instanceof AuftragsstatusFehler) throw new ApiError(e.status || 400, e.message);
      throw e;
    }
    // Muster aus dem Lager verschickt bzw. uebergeben: abzaehlen.
    if (['raus', 'kunde_hat_muster'].includes(schritt)) lagerAbgangFestschreiben(dir, auftrag, auswahl ? [...auswahl] : null, actor);
    audit({ actor, action: 'auftragsschritt', orderId, schritt, positionen: anzahl });
    merke(benutzer, actor, 'Auftragsschritt', `${auftrag.name}: ${schritt}`);
    // Erst jetzt nach Shopify: der lokale Schritt steht, egal wie die Buchung ausgeht.
    const shopifyErgebnis = rausIds.length ? await versandBuchen({ dir, auftrag, lineItemIds: rausIds, angaben, benutzer, actor })
      : await erledigtBuchen({ dir, auftrag, lineItemIds: erledigtIds, benutzer, actor });
    // Muster nicht verfuegbar: die Farben im Shop sperren - nach dem lokalen Schritt, der gilt immer.
    const sperre = sperrPositionen.length ? await musterSperren({ dir, auftrag, positionen: sperrPositionen, benutzer, actor }) : null;
    const statusNachher = leseAktuellenStatus(statusDatei, modell);
    const nachher = zeitleisten(dir, modell, statusNachher).get(orderId);
    return { ok: true, orderId, schritt, positionen: anzahl, ...(shopifyErgebnis ? { shopify: shopifyErgebnis } : {}), ...(sperre ? { mustersperre: sperre } : {}), ...zeitleistenFelder(nachher), ...versandFelder(auftrag, statusNachher) };
  }

  // Rechte fuer die Mustersperre: einmal je Prozess bestaetigt (der Dienst haelt seinen Token im
  // Speicher - nach einer Freischaltung startet er ohnehin neu). Fehlende Rechte werden jedes Mal neu gefragt.
  let sperrRechteOk = false;

  /** Zugang fuer die Mustersperre: { proxy } oder { hindernis: { grund, fehler } } - nie eine Ausnahme. */
  async function sperrZugang() {
    let zugang;
    try { zugang = await shopify(); } catch (e) {
      return { hindernis: { grund: 'nicht-erreichbar', fehler: `Im Shop nicht gesperrt: ${mitHinweis(String(e?.message || e).split('\n')[0])}`.slice(0, 400) } };
    }
    if (zugang?.art === 'sammeln') return { hindernis: { grund: 'kein-zugang', fehler: 'Im Shop nicht gesperrt: kein Zugang zu Shopify eingerichtet. Bitte die Variante über den Link in Shopify sperren.' } };
    if (!sperrRechteOk) {
      try {
        const { fehlend } = await pruefeSperrRechte(zugang.proxy);
        if (fehlend.length) return { hindernis: { grund: 'recht-fehlt', fehler: sperrRechtFehlt(fehlend), fehlend } };
        sperrRechteOk = true;
      } catch (e) {
        return { hindernis: { grund: 'nicht-erreichbar', fehler: `Im Shop nicht gesperrt: Rechte nicht lesbar (${String(e?.message || e).split('\n')[0].slice(0, 160)})` } };
      }
    }
    return { proxy: zugang.proxy };
  }

  /**
   * Eine SKU sperren (oder es versuchen) und das Ereignis anhaengen. Laeuft je SKU nacheinander,
   * damit zwei Klicks nie gleichzeitig denselben Bestand setzen. Gibt das Ereignis zurueck,
   * oder null, wenn genau diese Sperre schon steht (zweiter Klick: nichts zu tun).
   */
  function sperreEine({ dir, sku, info, orderId, orderName, zugang, actor }) {
    const file = mustersperrePfad(dir);
    return nacheinander(`mustersperre:${sku}`, async () => {
      const aktiv = sperrStand(leseSperren(file));
      if (sperreSchonErledigt(aktiv, sku, orderId)) return null;
      let sh;
      if (zugang.hindernis) sh = { geschrieben: false, aenderungMoeglich: false, fehler: zugang.hindernis.fehler, fehlerGrund: zugang.hindernis.grund, variantId: aktiv.get(sku)?.variantId, productId: aktiv.get(sku)?.productId };
      else {
        try {
          const r = await sperreImShop(zugang.proxy, { sku, referenz: orderId || null });
          sh = { geschrieben: true, bereits: r.status === 'bereits', variantId: r.variantId, productId: r.productId, vorher: r.vorher, nachher: r.nachher, verfuegbar: r.verfuegbar, varianten: r.varianten };
        } catch (e) {
          const bekannt = e instanceof MustersperreFehler;
          sh = { geschrieben: false, aenderungMoeglich: e?.extra?.aenderungMoeglich !== false, fehler: bekannt ? e.message : `Ob das Muster im Shop gesperrt ist, ist unklar (${String(e?.message || e).split('\n')[0].slice(0, 160)}). Bitte in Shopify nachsehen.`,
            fehlerGrund: bekannt ? e.grund : 'unklar', variantId: e?.extra?.variantId, productId: e?.extra?.productId, vorher: e?.extra?.vorher, nachher: e?.extra?.nachher, varianten: e?.extra?.varianten };
          logFehler('mustersperre', `${sku}: ${sh.fehlerGrund} - ${sh.fehler}`);
        }
      }
      const [ev] = sperreAnhaengen(file, [sperrEreignis({ sku, ...info, orderId, orderName, von: actor, grund: SPERR_GRUND.GESPERRT, shopify: sh, jetzt: now() })]);
      audit({ actor, action: 'mustersperre', sku, orderId, geschrieben: sh.geschrieben, bereits: Boolean(sh.bereits), grund: sh.fehlerGrund || null });
      return ev;
    });
  }

  /** Kurztext fuer die Rueckmeldung: "2 Farben im Shop gesperrt · 1 Farbe im Shop noch zu sperren: …" */
  function sperrMeldung({ gesperrt, bereits, offen, ohneSku, fehler }) {
    const farben = n => (n === 1 ? '1 Farbe' : `${n} Farben`);
    const teile = [];
    if (gesperrt) teile.push(`${farben(gesperrt)} im Shop gesperrt`);
    if (bereits) teile.push(`${farben(bereits)} ${bereits === 1 ? 'war' : 'waren'} schon gesperrt`);
    if (offen) teile.push(`${farben(offen)} im Shop noch zu sperren${fehler ? ` – ${fehler}` : ''}`);
    if (ohneSku) teile.push(`${farben(ohneSku)} ohne Artikelnummer – im Shop von Hand sperren`);
    return teile.join(' · ');
  }

  /**
   * "Muster nicht verfuegbar": die angekreuzten Muster je SKU im Shop sperren (operations/lib/mustersperre.mjs).
   * Ohne Recht oder Zugang wird nichts geschrieben; die Sperre steht dann als "im Shop noch zu sperren"
   * in Einkauf > Musterlager. Testbestellungen sperren nie echte Varianten.
   */
  async function musterSperren({ dir, auftrag, positionen, benutzer, actor }) {
    if (auftrag.testbestellung) return { status: 'uebersprungen', meldung: 'Testbestellung – im Shop nichts gesperrt.', gesperrt: 0, bereits: 0, offen: 0, ohneSku: 0 };
    const jeSku = new Map();
    let ohneSku = 0;
    for (const p of positionen) {
      const k = musterSchluessel(p);
      if (!k) { ohneSku += 1; continue; }
      const sku = `M-${k}`;
      if (!jeSku.has(sku)) jeSku.set(sku, { farbe: p.farbe && p.farbe !== '–' ? p.farbe : null, produkt: String(p.titel || '').replace(/^\s*Muster\s*:?\s*/i, '') || null, handle: p.handle || null });
    }
    const zugang = jeSku.size ? await sperrZugang() : {};
    const z = { gesperrt: 0, bereits: 0, offen: 0, ohneSku, fehler: null };
    const gesperrtText = [];
    for (const [sku, info] of jeSku) {
      // eslint-disable-next-line no-await-in-loop -- je SKU nacheinander, wenige Muster je Auftrag.
      const ev = await sperreEine({ dir, sku, info, orderId: auftrag.id, orderName: auftrag.name, zugang, actor });
      if (!ev) { z.bereits += 1; continue; }
      if (ev.shopify.geschrieben && ev.shopify.bereits) z.bereits += 1;
      else if (ev.shopify.geschrieben) { z.gesperrt += 1; gesperrtText.push([info.produkt, info.farbe].filter(Boolean).join(' ')); }
      else { z.offen += 1; z.fehler ||= ev.shopify.fehler; }
    }
    if (gesperrtText.length) merke(benutzer, actor, 'Muster im Shop gesperrt', `${auftrag.name}: ${gesperrtText.join(', ')}`);
    if (z.offen) merke(benutzer, actor, 'Muster im Shop nicht gesperrt', `${auftrag.name}: ${z.offen} Farbe(n) · ${z.fehler}`);
    const status = z.offen || ohneSku ? (z.gesperrt || z.bereits ? 'teilweise' : 'offen') : 'gesperrt';
    return { status, meldung: sperrMeldung(z), gesperrt: z.gesperrt, bereits: z.bereits, offen: z.offen, ohneSku, ...(zugang.hindernis?.fehlend ? { fehlendeRechte: zugang.hindernis.fehlend } : {}) };
  }

  /** Aktive Sperren fuer Einkauf > Musterlager: im Shop gesperrt bzw. noch zu sperren. */
  function sperrenListe(dir) {
    let aktiv;
    try { aktiv = sperrStand(leseSperren(mustersperrePfad(dir))); } catch (e) { return { fehler: e.message, gesperrt: [], offen: [] }; }
    const zeilen = [...aktiv.values()].sort((a, b) => String(b.seit).localeCompare(String(a.seit))).map(s => ({
      sku: s.sku, farbe: s.farbe, produkt: s.produkt, seit: s.seit, von: s.von, auftraege: s.auftraege,
      imShop: s.imShop, shopPruefen: s.shopPruefen, fehler: s.fehler, fehlerGrund: s.fehlerGrund, freigabeFehler: s.freigabeFehler,
      varianten: s.varianten.length,
      // Mehrere Mustervarianten (Teppichboden- und Nach-Mass-Muster): die Produktsuche zeigt alle.
      adminLink: s.varianten.length > 1 ? sperrAdminLink({ sku: s.sku }) : sperrAdminLink({ sku: s.sku, variantId: s.variantId, productId: s.productId }),
    }));
    return { fehler: null, gesperrt: zeilen.filter(x => x.imShop), offen: zeilen.filter(x => !x.imShop) };
  }

  /**
   * "Zurück auf offen": eine oder mehrere Positionen von jedem Schritt zurueck auf "noch zu
   * bestellen". Angabe als `positionen: [{orderId, lineItemId}]` (Sammelaktion, auch ueber
   * mehrere Bestellungen) oder `orderId` mit `lineItemId`/`lineItemIds` - nur `orderId` heisst:
   * alle Positionen dieser Bestellung. Bereits offene Positionen werden uebersprungen.
   */
  function zurueckAufOffen(payload, benutzer, actor) {
    const { orderId, lineItemId, lineItemIds, positionen, notiz } = payload || {};
    const dir = privatDirPath || privatDir();
    const file = auftragsstatusPfad(dir);
    let ziele;
    if (Array.isArray(positionen) && positionen.length) ziele = positionen.map(p => ({ orderId: p?.orderId, lineItemId: p?.lineItemId }));
    else if (orderId && (lineItemId || (Array.isArray(lineItemIds) && lineItemIds.length))) ziele = (lineItemId ? [lineItemId] : lineItemIds).map(l => ({ orderId, lineItemId: l }));
    else if (orderId) {
      const alle = leseAuftragsstatus(file);
      ziele = Object.values(alle).filter(e => e?.orderId === String(orderId) && e.status).map(e => ({ orderId: e.orderId, lineItemId: e.lineItemId }));
    } else throw new ApiError(400, 'orderId oder positionen sind Pflicht', { missing: ['orderId'] });
    if (ziele.length > 500) throw new ApiError(400, 'Zu viele Positionen auf einmal');
    const eintraege = {};
    let anzahl = 0;
    try {
      for (const z of ziele) {
        const e = setzeZurueckAufOffen(file, { ...z, actor, notiz, jetzt: now() });
        if (e) { eintraege[positionKey(z.orderId, z.lineItemId)] = e; anzahl += 1; }
      }
    } catch (e) {
      if (e instanceof AuftragsstatusFehler) throw new ApiError(400, e.message);
      throw e;
    }
    audit({ actor, action: 'auftragsstatus-zurueck-auf-offen', anzahl, orderIds: [...new Set(ziele.map(z => z.orderId))].slice(0, 20) });
    merke(benutzer, actor, 'Zurück auf offen', `${anzahl} Artikel${notiz ? ` · ${notiz}` : ''}`);
    return { ok: true, anzahl, eintraege };
  }

  /**
   * Muster aus dem Musterlager ist raus: die Zuordnung festschreiben (musterherkunft-Ereignis mit
   * lagerId). Ohne das stuende die Position nach "An Kunden raus" nicht mehr als Lagerware da,
   * und Einzelmuster wuerden nie abgezaehlt. `auftrag` ist der Stand VOR dem Schritt.
   */
  function lagerAbgangFestschreiben(dir, auftrag, lineItemIds, actor) {
    const offen = lagerFestzuschreiben(auftrag, lineItemIds);
    for (const p of offen) {
      haengeWahlAn(musterherkunftPfad(dir), {
        orderId: auftrag.id, lineItemId: p.lineItemId, herkunft: p.musterHerkunft || 'eigen_versand', actor,
        notiz: `Aus dem Musterlager${p.musterLager.ort ? ` (${p.musterLager.ort})` : ''}`, lagerId: p.musterLager.id, jetzt: now(),
      });
    }
    if (offen.length) audit({ actor, action: 'musterlager-abgang', orderId: auftrag.id, anzahl: offen.length });
    return offen.length;
  }

  /** Auftrag vor einem Statuswechsel - nur geladen, wenn das Musterlager ueberhaupt etwas enthaelt. */
  function auftragFuerLager(dir, orderId) {
    try { if (!leseLager(musterlagerPfad(dir)).eintraege.length) return null; } catch { return null; }
    const modell = ladeBestellModell(dir);
    return modell ? [...modell.auftraege, ...modell.testauftraege].find(a => a.id === orderId) || null : null;
  }

  /** "Muster haben wir da": Wahl je Musterbestellung (ohne lineItemId) oder Musterposition, nur anhaengen. */
  function musterHerkunftSetzen(payload, benutzer, actor) {
    const { orderId, lineItemId, herkunft, notiz } = payload || {};
    if (!orderId || !herkunft) throw new ApiError(400, 'orderId und herkunft sind Pflicht', { missing: ['orderId', 'herkunft'] });
    if (!HERKUNFT_WERTE.includes(herkunft)) throw new ApiError(400, `Unbekannte Herkunft „${herkunft}"`);
    const dir = privatDirPath || privatDir();
    const modell = ladeBestellModell(dir);
    const auftrag = modell ? [...modell.auftraege, ...modell.testauftraege].find(a => a.id === orderId) : null;
    if (!auftrag) throw new ApiError(404, 'Bestellung nicht gefunden – Bestelldaten evtl. inzwischen aktualisiert.');
    const muster = auftrag.positionen.filter(p => p.istMuster && (!lineItemId || p.lineItemId === lineItemId));
    if (!muster.length) throw new ApiError(400, lineItemId ? 'Diese Position ist kein Muster' : 'Diese Bestellung enthält keine Muster');
    let ereignis;
    try {
      ereignis = haengeWahlAn(musterherkunftPfad(dir), { orderId, lineItemId: lineItemId || null, herkunft, actor, notiz, jetzt: now() });
    } catch (e) {
      if (e instanceof MusterherkunftFehler) throw new ApiError(400, e.message);
      throw e;
    }
    audit({ actor, action: 'musterherkunft', orderId, lineItemId: lineItemId || null, herkunft });
    merke(benutzer, actor, 'Muster-Herkunft', `${auftrag.name}${lineItemId ? ' (eine Position)' : ''}: ${HERKUNFT_LABEL[herkunft]}`);
    return { ok: true, ereignis };
  }

  async function currentUser() {
    if (userCache) return userCache;
    try { userCache = (await gh(['api', 'user', '--jq', '.login'])).trim() || null; } catch { userCache = null; }
    return userCache;
  }

  async function repoLabels() {
    if (Date.now() - labelCache.at < 5 * 60_000 && labelCache.names.length) return labelCache.names;
    const raw = await gh(['api', '--paginate', `repos/${repo}/labels?per_page=100`]);
    const names = raw.trim().replace(/\]\s*\[/g, ',').replace(/^\[?/, '[').replace(/\]?$/, ']');
    let parsed;
    try { parsed = JSON.parse(names); } catch { parsed = JSON.parse(raw); }
    labelCache = { at: Date.now(), names: parsed.map(l => l.name) };
    return labelCache.names;
  }

  async function fetchIssue(number) {
    const n = Number(number);
    if (!Number.isInteger(n) || n < 1) throw new ApiError(400, 'Ungültige Aufgabennummer');
    let raw;
    try { raw = JSON.parse(await gh(['api', `repos/${repo}/issues/${n}`])); }
    catch (e) { throw new ApiError(404, `Aufgabe #${n} nicht gefunden (${e.message.split('\n')[0]})`); }
    if (raw.pull_request) throw new ApiError(400, `#${n} ist ein Pull Request, keine Aufgabe`);
    const record = toIssueRecord(raw);
    return { raw, record, task: normalizeTask({ ...record, body: raw.body }, { now: now() }) };
  }

  async function afterWrite() {
    if (typeof rebuild === 'function') {
      try { await rebuild(); } catch (e) { return `issues.json konnte nicht neu erzeugt werden: ${e.message}`; }
    }
    return null;
  }

  return {
    /** Private Navigation fuer alle Rollen; das gemeinsame Passwort bleibt Inhaberzugang. */
    prozessLinks({ benutzer = null } = {}) {
      try {
        return { ...leseProzesslinks(prozesslinksPfad(privatDirPath || privatDir())), bearbeitbar: !benutzer || benutzer.rolle === 'inhaber' };
      } catch (e) {
        if (e instanceof ProzesslinksSpeicherFehler) throw new ApiError(500, e.message);
        throw e;
      }
    },

    prozessLinksSetzen(payload, { benutzer = null } = {}) {
      if (benutzer && benutzer.rolle !== 'inhaber') throw new ApiError(403, 'Prozessverknüpfungen kann nur der Inhaber ändern.');
      try {
        return { ...schreibeProzesslinks(prozesslinksPfad(privatDirPath || privatDir()), payload), bearbeitbar: true };
      } catch (e) {
        if (e instanceof ProzesslinksFehler) throw new ApiError(400, e.message);
        if (e instanceof ProzesslinksSpeicherFehler) throw new ApiError(500, e.message);
        throw e;
      }
    },

    async capabilities() {
      const user = await currentUser();
      let labelsAvailable = [];
      try { labelsAvailable = (await repoLabels()).filter(l => /^(status|type|priority|area|reviewer):/.test(l)); } catch { /* bleibt leer */ }
      return {
        mode: 'local', user, actions: Boolean(user), sync: true, agentRuns: true, activity: true,
        repo, labelsAvailable,
        // Links "Weitere Dashboards" (Werkbank, Laden, Montage) aus .env.local - nie im Repository.
        dashboards: dashboardLinks({ root, env }),
        note: user ? null : 'gh ist nicht angemeldet – Aktionen sind gesperrt (gh auth login).',
      };
    },

    async sync() {
      const warn = await afterWrite();
      if (warn) throw new ApiError(502, warn);
      const file = path.join(root, 'docs/ai-dashboard/issues.json');
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      return { ok: true, count: data.count, generated_at: data.generated_at };
    },

    async activityForTask(number) {
      const n = Number(number);
      if (!Number.isInteger(n) || n < 1) throw new ApiError(400, 'Ungültige Aufgabennummer');
      const [events, comments] = await Promise.all([
        gh(['api', `repos/${repo}/issues/${n}/events?per_page=100`]).then(JSON.parse),
        gh(['api', `repos/${repo}/issues/${n}/comments?per_page=100`]).then(JSON.parse),
      ]);
      const mapped = [];
      for (const e of events) {
        const actor = e.actor?.login || 'system';
        const map = {
          labeled: `Label „${e.label?.name}" gesetzt`, unlabeled: `Label „${e.label?.name}" entfernt`,
          assigned: `zugewiesen an @${e.assignee?.login}`, unassigned: `Zuweisung @${e.assignee?.login} entfernt`,
          closed: 'geschlossen', reopened: 'wieder geöffnet', renamed: `umbenannt: „${e.rename?.to}"`,
          milestoned: `Meilenstein „${e.milestone?.title}"`, referenced: 'in Commit referenziert', mentioned: 'erwähnt',
          cross_referenced: 'querverwiesen',
        };
        if (['subscribed', 'unsubscribed', 'mentioned'].includes(e.event)) continue;
        mapped.push({ at: e.created_at, actor, type: e.event, text: map[e.event] || e.event });
      }
      for (const c of comments) {
        const cc = /tp-control-center/.test(c.body || '') ? 'Control Center' : /AI-Steuerzentrale/.test(c.body || '') ? 'KI-Steuerzentrale' : 'Kommentar';
        mapped.push({ at: c.created_at, actor: c.user?.login || '?', type: cc, text: clip(c.body, 1_500) });
      }
      mapped.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
      return { number: n, events: mapped };
    },

    async activity() {
      const events = JSON.parse(await gh(['api', `repos/${repo}/issues/events?per_page=100`]));
      const out = [];
      for (const e of events) {
        if (!e.issue || e.issue.pull_request) continue;
        if (['subscribed', 'unsubscribed', 'mentioned'].includes(e.event)) continue;
        const text = e.event === 'labeled' ? `Label „${e.label?.name}"` : e.event === 'unlabeled' ? `Label „${e.label?.name}" entfernt`
          : e.event === 'assigned' ? `zugewiesen an @${e.assignee?.login}` : e.event === 'closed' ? 'geschlossen' : e.event === 'reopened' ? 'wieder geöffnet' : e.event;
        out.push({ at: e.created_at, actor: e.actor?.login || 'system', type: e.event, text: `${e.issue.title} · ${text}`, number: e.issue.number, title: e.issue.title });
      }
      return { events: out };
    },

    /** Statuswechsel mit Pflichtangaben. payload: {target, owner, comment, reason, confirmAcceptance, decision} */
    async transition(number, payload = {}, benutzer = null) {
      const actor = await currentUser();
      if (!actor) throw new ApiError(403, 'gh ist nicht angemeldet – keine Schreibaktion möglich');
      const target = String(payload.target || '');
      if (!STATUS_BY_KEY[target]) throw new ApiError(400, `Unbekannter Zielstatus „${target}"`, { missing: [`Unbekannter Zielstatus „${target}"`] });
      const { task, raw } = await fetchIssue(number);
      const missing = requirementsFor(task, target, payload);
      if (missing.length) throw new ApiError(400, 'Pflichtangaben fehlen', { missing });
      const labels = await repoLabels();
      const change = labelChangesFor(task, target, { hasLabel: l => labels.includes(l) });
      const n = task.number;

      const editArgs = ['issue', 'edit', String(n), '--repo', repo];
      for (const l of change.remove) editArgs.push('--remove-label', l);
      for (const l of change.add) editArgs.push('--add-label', l);
      const newOwner = payload.owner && payload.owner !== task.owner ? String(payload.owner).replace(/^@/, '') : null;
      if (newOwner) editArgs.push('--add-assignee', newOwner);
      // Der Grund stand bisher nur im Kommentar. Die Oberflaeche liest ihn aber aus
      // dem Abschnitt "## Blocker" im Issue - "Blocker-Grund fehlt" stand dann
      // neben einer Aufgabe, deren Grund gerade erst eingegeben worden war.
      let neuerBody = null;
      if (target === 'blockiert' && String(payload.reason || '').trim()) {
        neuerBody = mitBlockerAbschnitt(raw?.body || '', payload.reason);
        if (neuerBody !== (raw?.body || '')) editArgs.push('--body', neuerBody);
        else neuerBody = null;
      }
      if (change.remove.length || change.add.length || newOwner || neuerBody !== null) await gh(editArgs);

      const text = payload.comment || payload.reason || null;
      const heading = payload.decision && DECISION_LABEL[payload.decision] ? DECISION_LABEL[payload.decision] : `Status ${task.statusLabel} → ${STATUS_BY_KEY[target].label}`;
      const lines = [`Status: ${task.statusLabel} → ${STATUS_BY_KEY[target].label}`];
      if (newOwner) lines.push(`Owner: @${newOwner}`);
      if (payload.confirmAcceptance) lines.push('Akzeptanzkriterien: ausdrücklich bestätigt');
      if (change.note) lines.push(`Hinweis: ${change.note}`);
      if (benutzer?.name) lines.push(`Mitarbeiter (Control Center): ${benutzer.name}`);
      await gh(['issue', 'comment', String(n), '--repo', repo, '--body', buildComment({ actor, heading, lines, text })]);
      if (change.close) await gh(['issue', 'close', String(n), '--repo', repo]);
      if (change.reopen) await gh(['issue', 'reopen', String(n), '--repo', repo]);

      audit({ actor, benutzer: benutzer?.name || null, action: 'transition', issue: n, from: task.status, to: target, owner: newOwner, decision: payload.decision || null, labels: change });
      merke(benutzer, actor, 'Statuswechsel', `Issue #${n}: ${task.statusLabel} → ${STATUS_BY_KEY[target].label}`);
      const warn = await afterWrite();
      return { ok: true, issue: n, from: task.status, to: target, labels: change, note: [change.note, warn].filter(Boolean).join(' · ') || null };
    },

    async assign(number, payload = {}, benutzer = null) {
      const actor = await currentUser();
      if (!actor) throw new ApiError(403, 'gh ist nicht angemeldet – keine Schreibaktion möglich');
      const owner = String(payload.owner || '').replace(/^@/, '').trim();
      if (!/^[A-Za-z0-9-]{1,39}$/.test(owner)) throw new ApiError(400, 'Owner muss ein GitHub-Login sein', { missing: ['Owner (GitHub-Login) angeben'] });
      const { task, record } = await fetchIssue(number);
      const n = task.number;
      const args = ['issue', 'edit', String(n), '--repo', repo, '--add-assignee', owner];
      for (const a of record.assignees.filter(a => a !== owner)) args.push('--remove-assignee', a);
      await gh(args);
      const heading = payload.decision === 'delegate' ? DECISION_LABEL.delegate : 'Owner zugeordnet';
      const lines = [`Owner: ${task.owner ? `@${task.owner} → ` : ''}@${owner}`];
      if (benutzer?.name) lines.push(`Mitarbeiter (Control Center): ${benutzer.name}`);
      await gh(['issue', 'comment', String(n), '--repo', repo, '--body', buildComment({ actor, heading, lines, text: payload.comment || null })]);
      audit({ actor, benutzer: benutzer?.name || null, action: 'assign', issue: n, owner, decision: payload.decision || null });
      merke(benutzer, actor, 'Owner zugeordnet', `Issue #${n}: @${owner}`);
      const warn = await afterWrite();
      return { ok: true, issue: n, owner, note: warn };
    },

    async comment(number, payload = {}, benutzer = null) {
      const actor = await currentUser();
      if (!actor) throw new ApiError(403, 'gh ist nicht angemeldet – keine Schreibaktion möglich');
      const body = clip(payload.body, 6_000);
      if (!body) throw new ApiError(400, 'Kommentar ist leer', { missing: ['Kommentartext angeben'] });
      const { task } = await fetchIssue(number);
      const heading = payload.decision && DECISION_LABEL[payload.decision] ? DECISION_LABEL[payload.decision] : 'Kommentar';
      const lines = benutzer?.name ? [`Mitarbeiter (Control Center): ${benutzer.name}`] : [];
      await gh(['issue', 'comment', String(task.number), '--repo', repo, '--body', buildComment({ actor, heading, lines, text: body })]);
      audit({ actor, benutzer: benutzer?.name || null, action: 'comment', issue: task.number, decision: payload.decision || null });
      merke(benutzer, actor, 'Kommentar', `Issue #${task.number}`);
      const warn = await afterWrite();
      return { ok: true, issue: task.number, note: warn };
    },

    /** KI-Laeufe der Steuerzentrale + Provider-Ledger, read-only. */
    agentRuns() {
      const dir = stateDir || process.env.DASHBOARD_STATE_DIR || path.join(os.homedir(), 'Library/Application Support/TP AI Dashboard');
      const file = path.join(dir, 'dashboard-state.json');
      const runs = [];
      let source = null;
      try {
        const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
        source = file;
        for (const r of [saved.current, ...(saved.history || [])].filter(Boolean)) {
          runs.push({
            id: r.id, state: r.state, task: clip(r.task, 300), issue: r.issue ? { number: r.issue.number, title: r.issue.title } : null,
            startedAt: r.startedAt, finishedAt: r.finishedAt, message: clip(r.message, 300),
            progress: r.progress || null, risk: r.risk || r.result?.risk || null, taskType: r.taskType || r.result?.taskType || null,
            provider: r.result?.provider || null, costUsd: Number.isFinite(r.result?.costUsd) ? r.result.costUsd : null,
            summary: clip(r.result?.summary, 1_200), findings: Array.isArray(r.result?.findings) ? r.result.findings.length : 0,
            guard: r.result?.guard?.status || null, resultStatus: r.result?.status || null,
          });
        }
      } catch { /* keine Steuerzentrale-Daten */ }
      const ledger = ledgerPath || process.env.AI_ROUTER_USAGE_LEDGER || path.join(root, '.router/ai-usage.jsonl');
      let usage = null;
      try {
        const lines = fs.readFileSync(ledger, 'utf8').split('\n').filter(Boolean);
        usage = { requests: 0, costUsd: 0, byProvider: {}, last: null };
        for (const line of lines) {
          let e; try { e = JSON.parse(line); } catch { continue; }
          usage.requests += 1; usage.costUsd += Number(e.usage?.costUsd) || 0;
          const key = e.provider || 'unbekannt';
          usage.byProvider[key] = (usage.byProvider[key] || 0) + 1;
          if (!usage.last || (e.timestamp || '') > usage.last.at) usage.last = { at: e.timestamp, model: e.model, provider: e.provider };
        }
      } catch { /* kein Ledger */ }
      return { runs, source, usage, ledger: usage ? ledger : null };
    },

    /** Bestelluebersicht: offene Kundenbestellungen, gruppiert je Lieferant, plus Muster. */
    einkaufBestellungen() {
      const dir = privatDirPath || privatDir();
      shopifyAbgleichen(dir);
      const file = path.join(dir, 'bestelluebersicht', 'orders.json');
      const daten = readJsonIfExists(file);
      if (!daten) return { verfuegbar: false, quelle: file, hinweis: 'orders.json fehlt - siehe operations/lib/bestelluebersicht.mjs bzw. den Export-Lauf dafuer.' };
      let modell;
      // Der Export der Admin API liegt als {data:{orders:{nodes}}} vor;
      // ladeExport bringt beide Formen auf {orders, quellvarianten}.
      try { modell = bereiteBestellModell(daten, dir, now()); }
      catch (e) { return { verfuegbar: false, quelle: file, hinweis: `orders.json konnte nicht ausgewertet werden: ${e.message}` }; }
      // "Kunde informiert" je Auftrag (Einkauf "Je Auftrag") - aus dem Auftragsverlauf, nur lesend.
      const verlauf = leseVerlauf(auftragsverlaufPfad(dir));
      const kundeInformiert = {};
      for (const [id, v] of Object.entries(verlauf)) { const k = kundeInformiertAus(v.ereignisse); if (k) kundeInformiert[id] = k; }
      const kundentermine = readJsonIfExists(path.join(dir, 'bestelluebersicht', 'kundentermine.json')) || {};
      return { verfuegbar: true, quelle: file, exportiertAm: daten.exportiertAm || null, ...modell, kundeInformiert, kundentermine };
    },

    /** Kundensuche: Name, E-Mail, Telefon, Bestellnummer, Strasse/Ort/PLZ - waehrend des Tippens. */
    kundenSuche({ q = '', filter = '' } = {}) {
      const dir = privatDirPath || privatDir();
      const modell = ladeBestellModell(dir);
      if (!modell) return { verfuegbar: false, quelle: path.join(dir, 'bestelluebersicht', 'orders.json'), hinweis: 'orders.json fehlt - siehe operations/lib/bestelluebersicht.mjs bzw. den Export-Lauf dafuer.' };
      const statusAlle = leseAktuellenStatus(auftragsstatusPfad(dir), modell);
      // Unter zwei Zeichen ist die Suche kein Tor mehr, sondern die volle
      // Kundenliste (Inhabervorgabe) - gefiltert/sortiert wie alleKunden().
      // Ab zwei Zeichen bleibt es Freitextsuche, mit demselben Filter drauf.
      const q2 = String(q ?? '').trim();
      const roh = q2.length >= 2
        ? sucheKunden(modell, q2, { statusAlle }).map(k => kundenListenEintrag(k, { statusAlle })).filter(passtZuKundenFilter(filter))
        : alleKunden(modell, { statusAlle, filter });
      const stamm = stammKontakte(dir);
      // Additiv: der dringendste naechste Schritt je Kunde (Zeitleiste) - fuer Listen und die Heute-Seite.
      const zl = zeitleisten(dir, modell, statusAlle);
      const auftraegeJeKunde = new Map(kundenIndex(modell, { statusAlle }).map(k => [k.key, k.auftraege]));
      const ausBestellungen = roh.map(t => ({ ...t, naechsterSchritt: kundenSchritt(auftraegeJeKunde.get(t.key), zl) })).map((t) => {
        if (t.telefon && t.telefon !== '–') return t;
        const k = stamm.get(`mail:${String(t.email || '').toLowerCase()}`) || stamm.get(`name:${String(t.name || '').toLowerCase()}`);
        if (!k?.telefon) return t;
        return { ...t, telefon: k.telefon, telefonQuelle: k.telefonQuelle || 'kundenstamm' };
      });
      // Kunden aus Shopify, zu denen es hier keine Bestellung gibt, gehoeren
      // trotzdem in die Liste - sonst fehlen sie am Telefon.
      const alleKeys = new Set(ausBestellungen.map(t => t.key));
      const nurStamm = stammOhneBestellung(dir, alleKeys)
        .filter(passtZuKundenFilter(filter))
        .filter(t => q2.length < 2 || [t.name, t.email, t.telefon, t.ort].filter(Boolean).some(f => String(f).toLowerCase().includes(q2.toLowerCase())));
      const treffer = [...ausBestellungen, ...nurStamm];
      return { verfuegbar: true, treffer, gesamt: treffer.length };
    },

    /** Kunden-Detailansicht: Kontakt, Anschriften, alle Bestellungen mit Positionen. */
    kundenDetail({ key = '' } = {}) {
      const dir = privatDirPath || privatDir();
      shopifyAbgleichen(dir);
      const modell = ladeBestellModell(dir);
      if (!modell) return { verfuegbar: false, quelle: path.join(dir, 'bestelluebersicht', 'orders.json'), hinweis: 'orders.json fehlt.' };
      const statusAlle = leseAktuellenStatus(auftragsstatusPfad(dir), modell);
      const gefunden = findeKunde(modell, key, { statusAlle });
      if (gefunden) {
        // Additiv je Bestellung: auftragsart, verlauf, verlaufNotizen, naechsterSchritt (operations/lib/auftragsverlauf.mjs).
        const zl = zeitleisten(dir, modell, statusAlle);
        const kunde = { ...gefunden, auftraege: gefunden.auftraege.map(a => ({ ...a, ...zeitleistenFelder(zl.get(a.id)), ...versandFelder(a, statusAlle) })), naechsterSchritt: kundenSchritt(gefunden.auftraege, zl) };
        return { verfuegbar: true, kunde };
      }
      // Kunde aus dem Shopify-Stamm ohne Bestellung in dieser Datei: die
      // Akte zeigt dann Kontakt und Anschrift statt einer Fehlermeldung.
      const ausStamm = stammOhneBestellung(dir, new Set()).find(k => k.key === key);
      if (!ausStamm) return { verfuegbar: false, hinweis: 'Kunde nicht gefunden - Bestelldaten evtl. inzwischen aktualisiert.' };
      const roh = (readJsonIfExists(path.join(dir, 'kunden', 'kunden.json'))?.kunden ?? [])
        .find(k => (k.email && `email:${String(k.email).toLowerCase()}` === key) || (k.name && `name:${String(k.name).toLowerCase()}` === key));
      return {
        verfuegbar: true,
        nurStammdaten: true,
        kunde: {
          key,
          kunde: { name: ausStamm.name, email: ausStamm.email || '–', telefon: ausStamm.telefon || '–' },
          lieferadresse: roh?.anschrift || null,
          rechnungsadresse: null,
          auftraege: [],
          anzahlBestellungen: ausStamm.anzahlBestellungen,
          gesamtumsatz: ausStamm.gesamtumsatz,
          waehrung: ausStamm.waehrung,
          nurTestbestellungen: false,
          fortschritt: ausStamm.fortschritt,
          hinweis: ausStamm.anzahlBestellungen > 0
            ? `Shopify fuehrt ${ausStamm.anzahlBestellungen} Bestellung(en) - sie liegen ausserhalb der hier exportierten Daten.`
            : 'Noch keine Bestellung.',
        },
      };
    },

    /** Vollstaendige Bestelluebersicht (eine Zeile je Bestellung) fuer die Tabellenansicht - Sortierung/Filter/Suche laufen im Browser, das lokale Datenvolumen ist klein. */
    kundenBestellungen() {
      const dir = privatDirPath || privatDir();
      shopifyAbgleichen(dir);
      const modell = ladeBestellModell(dir);
      if (!modell) return { verfuegbar: false, quelle: path.join(dir, 'bestelluebersicht', 'orders.json'), hinweis: 'orders.json fehlt.' };
      const statusAlle = leseAktuellenStatus(auftragsstatusPfad(dir), modell);
      const rueckrufeAlle = leseRueckrufe(rueckrufePfad(dir));
      const zl = zeitleisten(dir, modell, statusAlle);
      let katalog = [];
      try { katalog = this._lexikonProdukte(); } catch { /* Optionale Kaufquelle unlesbar: keine Links, Bestellliste bleibt nutzbar. */ }
      const haken = leseBestellmarken(bestellmarkenPfad(dir));
      const musterAutomatik = musterAutomatikAnzeige(dir, { modell, statusAlle, stammdaten: leseStammdaten(stammdatenPfad(dir)) }, katalog, now());
      // Packstation als Beleg fuers Aufraeumen (#1698); ist ihre Ablage kaputt, fehlt nur dieser Beleg.
      let packen = null;
      try { packen = leseMusterPackStand(musterPackenPfad(dir)); } catch { /* Fehler meldet die Packstation selbst. */ }
      const jetzt = now().getTime();
      const zeilen = bestellliste(modell, { statusAlle, rueckrufeAlle }).map(z => ({ ...z, musterAutomatik: musterAutomatik.auftraege[z.orderId] || null, abgehakt: haken[z.orderId] || null, musterKaufLinks: musterKaufLinks(z.auftrag?.positionen, katalog), ...zeitleistenFelder(zl.get(z.orderId)), ...versandFelder(z.auftrag, statusAlle) }));
      return { verfuegbar: true, ratgeberVorlagen: RATGEBER.map(r => ({ schluessel: r.schluessel, titel: ratgeberKurzTitel(r) })), musterAutomatik: { aktiv: musterAutomatik.aktiv, hinweis: musterAutomatik.hinweis }, zeilen: zeilen.map(z => ({ ...z, aufraeumen: aufraeumFall(z, { jetzt, packen }) })) };
    },

    /** Rein lesende Aggregate, ohne Kundennamen oder zweite Bestellablage. */
    kundenMusterwirkung() {
      const dir = privatDirPath || privatDir();
      const datei = path.join(dir, 'bestelluebersicht', 'orders.json');
      const daten = readJsonGecacht(datei);
      if (!daten) {
        if (leseFehler(datei)) throw new ApiError(500, 'Die Bestelldaten für die Musteranalyse sind nicht lesbar. Bitte die Datenquelle prüfen.');
        return { verfuegbar: false, hinweis: 'Die Bestelldaten für die Musteranalyse fehlen. Bitte die Bestelldaten aktualisieren.' };
      }
      return musterwirkung(daten, { jetzt: now() });
    },

    /** Bestellung abhaken bzw. Haken zuruecknehmen - gemeinsam fuer alle, ohne Shopify-Buchung. */
    bestellungAbhaken({ orderId, erledigt } = {}, { benutzer = null } = {}) {
      const dir = privatDirPath || privatDir();
      if (typeof orderId !== 'string' || !orderId.trim() || orderId.length > 200) throw new ApiError(400, 'Bestellkennung fehlt.');
      const ergebnis = setzeBestellhaken(bestellmarkenPfad(dir), orderId, { erledigt: Boolean(erledigt), von: benutzer?.name || benutzer?.kuerzel || 'Inhaber' });
      merke(benutzer, null, 'Bestellung abgehakt', `${orderId}: ${erledigt ? 'erledigt' : 'zurückgenommen'}`);
      return { ok: true, ...ergebnis };
    },

    /**
     * Kurz-Ratgeber zur Bestellung als PDF zum Ausdrucken und Beilegen, Bestellnummer, Produkt,
     * Mass und Datum schon eingetragen. Rein lesend; Chromium startet erst beim Klick.
     */
    async kundenRatgeberDruck({ orderId = '' } = {}) {
      if (typeof orderId !== 'string' || !orderId.trim() || orderId.length > 200) throw new ApiError(400, 'Bestellkennung fehlt.');
      const dir = privatDirPath || privatDir();
      const liste = exportOrders(readJsonGecacht(path.join(dir, 'bestelluebersicht', 'orders.json')));
      if (!liste) throw new ApiError(503, 'Die Bestelldaten fehlen oder sind nicht lesbar. Bitte die Daten aktualisieren.');
      const bestellung = liste.find(o => o?.id === orderId);
      if (!bestellung) throw new ApiError(404, 'Bestellung nicht in den aktuellen Bestelldaten gefunden.');
      const teile = ratgeberFuerBestellung(bestellung);
      if (!teile.length) throw new ApiError(404, 'Zu dieser Bestellung gibt es keinen Ratgeber – sie enthält nur Muster oder Zubehör.');
      const html = ratgeberHtml(teile, { titel: `Ratgeber zu Bestellung ${bestellung.name} – Teppich Paradies` });
      const drucken = ratgeberPdf || (async h => {
        const { mitBrowser, seitenAlsPdf } = await import('../domains/shopify/ratgeber-pdf/pdf.mjs');
        return (await mitBrowser(page => seitenAlsPdf(page, h))).pdf;
      });
      return { inhalt: await drucken(html), typ: 'application/pdf', name: `Ratgeber ${String(bestellung.name || '').replace(/^#/, '')}.pdf` };
    },

    /** Leere Druckvorlage eines Ratgebers (dieselbe Datei wie in Shopify), ohne Bestellbezug. */
    kundenRatgeberVorlage({ schluessel = '' } = {}) {
      const r = RATGEBER.find(x => x.schluessel === schluessel);
      if (!r) throw new ApiError(404, 'Diesen Ratgeber gibt es nicht.');
      return { inhalt: fs.readFileSync(path.join(RATGEBER_ORDNER, 'pdf', r.datei)), typ: 'application/pdf', name: `Ratgeber ${ratgeberKurzTitel(r)}.pdf` };
    },

    /** Rein intern und lesend: weder Shopify-Abgleich noch Kundendaten im Etikett. */
    kundenMusteretiketten(orderId) {
      if (typeof orderId !== 'string' || !orderId.trim() || orderId.length > 200) throw new ApiError(400, 'Bestellkennung fehlt.');
      const dir = privatDirPath || privatDir();
      const modell = ladeBestellModell(dir);
      if (!modell) throw new ApiError(503, 'Die Bestelldaten fehlen oder sind nicht lesbar. Bitte die Daten aktualisieren.');
      const auftrag = [...(modell.auftraege || []), ...(modell.testauftraege || [])].find(a => a.id === orderId);
      if (!auftrag) throw new ApiError(404, 'Bestellung nicht in den aktuellen Bestelldaten gefunden.');
      const status = leseAktuellenStatus(auftragsstatusPfad(dir), modell);
      const orderName = String(auftrag.name || orderId);
      let druckliste;
      try { druckliste = leseMusterDruckliste({ privatDir: dir }); }
      catch (e) { if (e instanceof MusterDrucklisteFehler) throw new ApiError(e.status, e.message); throw e; }
      const produkte = new Map(this._lexikonProdukte().map(p => [p.handle, p]));
      const zeilen = musteretikettenFuerAuftrag(auftrag, produkte).map(z => {
        const quelle = { art: 'musterbestellung', orderId, orderName, lineItemId: z.lineItemId, bestellmenge: z.bestellmenge };
        const alt = druckliste.eintraege.find(e => e.quelle?.orderId === orderId && e.quelle.lineItemId === z.lineItemId);
        const schonRaus = ['raus', 'erledigt'].includes(status[positionKey(orderId, z.lineItemId)]?.status);
        const vormerkstatus = !alt ? 'nicht_vorgemerkt' : gleicheBestellungsVormerkung(alt, { quelle, etikett: z.etikett }) ? alt.status : 'geaendert';
        return { ...z, anzahl: schonRaus ? 0 : z.anzahl, vormerkstatus,
          ...(vormerkstatus === 'geaendert' ? { hinweis: 'Bestellung oder Produktdaten wurden seit dem Vormerken geändert. Bitte die Druckliste prüfen.' }
            : schonRaus ? { hinweis: 'Dieses Muster ist bereits an den Kunden raus.' } : {}) };
      });
      const gesperrt = auftrag.storniert ? 'Diese Bestellung ist storniert. Keine neuen Aufkleber vormerken.'
        : String(auftrag.erfuellt).toUpperCase() === 'FULFILLED' || !zeilen.some(z => z.anzahl !== 0)
          ? 'Für diese Bestellung sind keine offenen Muster mehr vorzubereiten.' : null;
      return { verfuegbar: true, intern: true, orderId, orderName, gesperrt, zeilen };
    },

    /**
     * Kunden → Muster packen (#1572): offene, bezahlte Musterbestellungen je Kunde, rein lesend.
     * Anschriften kommen nur aus dem privaten Bestellexport; Shopify wird nicht gefragt.
     */
    kundenMusterPacken() {
      const dir = privatDirPath || privatDir();
      const modell = ladeBestellModell(dir);
      if (!modell) return { verfuegbar: false, hinweis: 'Die Bestelldaten fehlen. Bitte „Jetzt aktualisieren“ und danach erneut öffnen.' };
      const status = leseAktuellenStatus(auftragsstatusPfad(dir), modell);
      let stand;
      try { stand = leseMusterPackStand(musterPackenPfad(dir)); } catch (e) { throw new ApiError(500, e.message); }
      // Lieferantennamen nur aus den privaten Stammdaten; ohne Eintrag bleibt das Kuerzel.
      const stammdaten = leseStammdaten(stammdatenPfad(dir));
      const liste = musterPackliste({
        auftraege: modell.auftraege || [],
        produkte: new Map(this._lexikonProdukte().map(p => [p.handle, p])),
        // Ganzer Eintrag: Bestelldatum und "Musterautomatik" fuer die Anmerkung beim Warten.
        eintragVon: (orderId, lineItemId) => status[positionKey(orderId, lineItemId)] || null,
        schluesselVon: kundenSchluessel,
        gepackt: stand.gepackt, haken: stand.haken, klaeren: stand.klaeren, gedruckt: stand.gedruckt,
        lieferantVon: id => stammdatenFuer(stammdaten, id).name,
        jetzt: now(),
      });
      try {
        const gespeicherte = leseGrossbriefe(grossbriefPfad(dir));
        return { verfuegbar: true, ...liste, kunden: liste.kunden.map(k => ({ ...k, grossbrief: grossbriefStand(k, gespeicherte) })) };
      } catch (e) { throw new ApiError(500, e.message); }
    },

    /**
     * Muster packen schreiben - nur lokal, ohne Versandbuchung. `aktion`:
     *   gepackt  { gepackt: bool }                 Umschlag gepackt / zuruecknehmen (Standard);
     *            mit { alleEingelegt: true, lineItemIds } zugleich alle noch offenen Muster abhaken -
     *            nur, wenn die Seite genau diese offenen Muster gezeigt hat
     *   haken    { lineItemIds: [...], an: bool }  Muster ueberklebt und eingelegt
     *   klaeren  { klaeren: bool, notiz? }         unvollstaendig -> zu klaeren (fehlend = alle
     *            nicht abgehakten Muster, vom Server bestimmt) bzw. "Fehlendes ist da"
     *   gedruckt { gedruckt: bool, seit? }         Aufkleber und Adresse gedruckt: Umschlag vorbereitet,
     *            wartet auf Muster (fuer alle Geraete). `seit` (ISO, hoechstens 30 Tage alt) uebernimmt
     *            einen frueheren Druckzeitpunkt; nicht fuer gepackte Umschlaege
     */
    kundenMusterPackenSetzen(payload = {}, benutzer = null) {
      if (benutzer?.rolle === 'lesen') throw new ApiError(403, 'Dieser Zugang darf Muster packen nur ansehen.');
      const pk = typeof payload?.packSchluessel === 'string' ? payload.packSchluessel.trim() : '';
      if (!pk) throw new ApiError(400, 'Kein Kunde angegeben.');
      const aktion = payload.aktion ?? 'gepackt';
      if (aktion === 'grossbrief') {
        const kunde = (this.kundenMusterPacken().kunden || []).find(k => k.packSchluessel === pk);
        if (!kunde || kunde.grossbrief.kontext !== payload.kontext) throw new ApiError(409, 'Bestellungen, Muster oder Adresse haben sich geändert. Bitte neu öffnen.');
        try {
          return { ok: true, grossbrief: speichereGrossbrief(grossbriefPfad(privatDirPath || privatDir()), kunde.grossbrief.kontext, payload.version, payload.messung, { von: benutzer?.name || benutzer?.kuerzel || 'Inhaber', jetzt: now() }) };
        } catch (e) { throw new ApiError(e instanceof GrossbriefSpeicherFehler ? e.status : 500, e.message); }
      }
      if (!['gepackt', 'haken', 'klaeren', 'gedruckt'].includes(aktion)) throw new ApiError(400, 'Unbekannte Aktion.');
      const wert = aktion === 'gepackt' ? payload.gepackt : aktion === 'haken' ? payload.an : aktion === 'gedruckt' ? payload.gedruckt : payload.klaeren;
      if (typeof wert !== 'boolean') throw new ApiError(400, `Angabe „${aktion === 'haken' ? 'an' : aktion}“ fehlt.`);
      const liste = this.kundenMusterPacken();
      const kunde = (liste.kunden || []).find(k => k.packSchluessel === pk);
      // Nur, was gerade in der Liste steht: eine veraltete Seite darf keinen fremden Stand schreiben.
      if (!kunde) throw new ApiError(409, 'Diese Bestellungen stehen nicht mehr so in der Liste. Bitte neu laden.');
      const datei = musterPackenPfad(privatDirPath || privatDir());
      const von = benutzer?.name || benutzer?.kuerzel || 'Inhaber';
      const nummern = kunde.bestellungen.map(b => b.orderName).join(', ');
      let ergebnis;
      let eingang = null;
      try {
        if (aktion === 'gepackt') {
          const restumfangBestaetigt = kunde.restumfangPruefen === true && kunde.hinweise?.length === 1 && kunde.hinweise[0] === 'Teilweise erstattet – offene Muster und Versandumfang prüfen.' && payload.restumfangGeprueft === true;
          // Die bewusste Restumfangpruefung gilt nur fuer Teilrueckerstattung, nie fuer Direktversand.
          const hinweisBlockiert = (kunde.hinweise?.length || 0) > 0 && !restumfangBestaetigt;
          const offeneMuster = kunde.muster.filter(m => !m.abgehakt).map(m => m.lineItemId);
          // "Alle eingelegt": die Person bestaetigt jedes gezeigte offene Muster; kam inzwischen eins dazu
          // oder hat jemand anders abgehakt, stimmt ihre Seite nicht mehr.
          const alleEingelegt = wert && payload.alleEingelegt === true;
          if (alleEingelegt) {
            const gezeigt = Array.isArray(payload.lineItemIds) ? [...new Set(payload.lineItemIds.filter(id => typeof id === 'string'))].sort() : [];
            if (!offeneMuster.length || JSON.stringify(gezeigt) !== JSON.stringify([...offeneMuster].sort())) {
              throw new ApiError(409, 'Die Muster dieses Umschlags haben sich geändert. Bitte neu laden und erneut prüfen.');
            }
          }
          if (wert && (kunde.fehlt.length || kunde.direktversand || hinweisBlockiert || kunde.klaeren || (!alleEingelegt && offeneMuster.length))) {
            throw new ApiError(409, 'Bitte zuerst alle Muster tatsächlich einlegen und abhaken sowie offene Angaben und Klärungen prüfen.');
          }
          if (alleEingelegt) setzeHaken(datei, offeneMuster, { an: true, von, jetzt: now() });
          ergebnis = setzeGepackt(datei, pk, { gepackt: wert, von, jetzt: now(), restumfangGeprueft: restumfangBestaetigt });
          if (wert) eingang = wareneingangAusPackstation({ positionen: kunde.muster, actor: von, notiz: 'Umschlag gepackt (Packstation)' });
          // Gepackt erledigt auch ein "zu klaeren".
          if (wert && kunde.klaeren) setzeKlaeren(datei, kunde.schluessel, { klaeren: false });
          merke(benutzer, null, wert ? 'Muster gepackt' : 'Gepackt zurückgenommen', nummern);
        } else if (aktion === 'haken') {
          const eigene = new Set(kunde.muster.map(m => m.lineItemId));
          const ids = Array.isArray(payload.lineItemIds) ? payload.lineItemIds.filter(id => typeof id === 'string') : [];
          if (!ids.length || ids.some(id => !eigene.has(id))) throw new ApiError(400, 'Dieses Muster gehört nicht zu diesem Kunden.');
          ergebnis = setzeHaken(datei, ids, { an: wert, von, jetzt: now() });
          if (wert) eingang = wareneingangAusPackstation({ positionen: kunde.muster.filter(m => ids.includes(m.lineItemId)), actor: von, notiz: 'Eingelegt in der Packstation' });
        } else if (aktion === 'gedruckt') {
          if (wert && kunde.gepackt) throw new ApiError(409, 'Dieser Umschlag ist schon gepackt.');
          // Nur ein belegbarer frueherer Zeitpunkt; alles andere zaehlt ab jetzt.
          const seit = typeof payload.seit === 'string' ? new Date(payload.seit) : null;
          const zeit = seit && !Number.isNaN(seit.getTime()) && seit <= now() && now() - seit <= 30 * 24 * 60 * 60 * 1000 ? seit : null;
          ergebnis = setzeGedruckt(datei, pk, { gedruckt: wert, von, zeit, jetzt: now() });
          merke(benutzer, null, wert ? 'Umschlag vorbereitet (Aufkleber gedruckt)' : 'Druckvermerk zurückgenommen', nummern);
        } else {
          const fehlt = kunde.muster.filter(m => !m.abgehakt).map(m => m.lineItemId);
          if (wert && !fehlt.length) throw new ApiError(400, 'Alle Muster sind abgehakt – der Umschlag ist vollständig.');
          const notiz = typeof payload.notiz === 'string' ? payload.notiz : '';
          ergebnis = setzeKlaeren(datei, kunde.schluessel, { klaeren: wert, fehlt, notiz, von, jetzt: now() });
          merke(benutzer, null, wert ? 'Muster zu klären' : 'Fehlende Muster sind da', nummern);
        }
      } catch (e) { throw e instanceof ApiError ? e : new ApiError(500, e.message); }
      if (eingang?.anzahl) merke(benutzer, null, 'Wareneingang aus der Packstation', `${nummern}: ${eingang.anzahl} Muster angekommen`);
      return { ok: true, ...ergebnis, ...(eingang ? { wareneingang: eingang } : {}) };
    },

    /**
     * Schreibweg der Packstation (POST kunden/muster-packen). Alle Aktionen wie kundenMusterPackenSetzen;
     * dazu `aktion: 'verschickt'` fuer einen gepackten Umschlag (#1810, Knopf "Verschickt – Kunde
     * informieren"): je Bestellung des Umschlags der Schritt "raus" fuer deren Muster - lokal, Lagerabgang
     * und in Shopify als versendet mit Versandbestaetigung (Ausnahme wie beim Schritt "raus": persoenlich
     * vorbeigebrachte Muster ohne Mail).
     *
     * Auf dem Server statt je Bestellung aus dem Browser (Pruefung 29.10.): der Packschluessel ergibt sich
     * aus den noch offenen Bestellungen. Bei zwei Bestellungen zerfiel der Umschlag, sobald die erste
     * "raus" war; scheiterte die zweite, stand ihr Rest wieder als "packbereit" da - ohne Gepackt-Vermerk.
     * Deshalb: erst fuer ALLE Bestellungen pruefen, ob "raus" geht (sonst 409, nichts geschrieben), dann
     * alle lokalen Schritte schreiben, bevor die erste Shopify-Buchung abgewartet wird. `versand` sagt je
     * Bestellung, was in Shopify passiert ist.
     */
    async kundenMusterPackenSchreiben(payload = {}, benutzer = null) {
      if (payload?.aktion !== 'verschickt') return this.kundenMusterPackenSetzen(payload, benutzer);
      if (benutzer?.rolle === 'lesen') throw new ApiError(403, 'Dieser Zugang darf Muster packen nur ansehen.');
      const pk = typeof payload.packSchluessel === 'string' ? payload.packSchluessel.trim() : '';
      if (!pk) throw new ApiError(400, 'Kein Kunde angegeben.');
      const kunde = (this.kundenMusterPacken().kunden || []).find(k => k.packSchluessel === pk);
      if (!kunde) throw new ApiError(409, 'Dieser Umschlag steht nicht mehr so in der Liste – vielleicht schon verschickt. Bitte neu laden.');
      if (!kunde.gepackt) throw new ApiError(409, 'Dieser Umschlag ist noch nicht gepackt.');
      const dir = privatDirPath || privatDir();
      const actor = benutzer?.name || benutzer?.kuerzel || 'Inhaber';
      const modell = ladeBestellModell(dir);
      const statusDatei = auftragsstatusPfad(dir);
      const alle = leseAktuellenStatus(statusDatei, modell);
      // Nur, was noch nicht raus ist: der Schritt "raus" auf schon Erledigtes waere eine Korrektur zurueck.
      // Testbestellungen stehen in testauftraege, nicht in auftraege.
      const plan = kunde.bestellungen.map(b => ({ b, auftrag: [...(modell?.auftraege || []), ...(modell?.testauftraege || [])].find(a => a.id === b.orderId) || null,
        ids: kunde.muster.filter(m => m.orderId === b.orderId && STATUS_ORDER.indexOf(alle[positionKey(b.orderId, m.lineItemId)]?.status) < STATUS_ORDER.indexOf('raus')).map(m => m.lineItemId) }));
      for (const { b, auftrag, ids } of plan) {
        const blockiert = ids.map(id => alle[positionKey(b.orderId, id)]).find(e => !darfWeiter(e, 'raus'));
        try {
          if (blockiert) throw new ApiError(409, blockiert.beschaffung?.klaerung || 'Die bestätigte Fehlmenge ist noch offen. Zuerst den Wareneingang vervollständigen.');
          bereiteStatusPositionenVor(statusDatei, ids.map(id => {
            const p = auftrag?.positionen?.find(x => x.lineItemId === id);
            return { orderId: b.orderId, lineItemId: id, status: 'raus', actor, bestellmenge: p?.bestellSoll || p?.bestellmenge || null, jetzt: now() };
          }));
        } catch (e) {
          throw new ApiError(e.status || 409, `Nicht verschickt, keine Mail – ${b.orderName}: ${String(e?.message || e).split('\n')[0]}`);
        }
      }
      // Ohne await gestartet: jeder Aufruf schreibt seinen lokalen Schritt synchron, bevor irgendeine
      // Shopify-Buchung abgewartet wird.
      const laeufe = plan.map(({ b, ids }) => (ids.length
        ? auftragsSchrittSetzen({ orderId: b.orderId, schritt: 'raus', lineItemIds: ids, notiz: 'Verschickt aus der Packstation' }, benutzer, actor)
        : Promise.resolve({ shopify: { status: 'bereits', meldung: 'Schon als versendet vermerkt – nichts erneut gebucht.' } })));
      const ausgang = await Promise.allSettled(laeufe);
      const versand = ausgang.map((x, i) => {
        const { b } = plan[i];
        if (x.status === 'fulfilled') return { orderId: b.orderId, orderName: b.orderName, status: x.value?.shopify?.status || null, meldung: x.value?.shopify?.meldung || null, kundeBenachrichtigt: x.value?.shopify?.kundeBenachrichtigt === true };
        const meldung = `Nicht als verschickt eingetragen: ${String(x.reason?.message || x.reason).split('\n')[0]}`;
        merke(benutzer, actor, 'Verschicken aus der Packstation gescheitert', `${b.orderName}: ${meldung}`);
        logFehler('versand', `${b.orderName}: Packstation - ${meldung}`);
        return { orderId: b.orderId, orderName: b.orderName, status: 'fehler', meldung };
      });
      // Blieb eine Bestellung stehen, bildet sie jetzt einen eigenen Umschlag: der ist gepackt und gehoert
      // unter "Gepackt", nie zurueck ins Packen.
      const stehen = new Set(ausgang.map((x, i) => (x.status === 'rejected' ? plan[i].b.orderId : null)).filter(Boolean));
      if (stehen.size) {
        try {
          const datei = musterPackenPfad(dir);
          for (const rest of (this.kundenMusterPacken().kunden || []).filter(k => !k.gepackt && k.bestellungen.some(b => stehen.has(b.orderId)))) {
            setzeGepackt(datei, rest.packSchluessel, { gepackt: true, von: actor, jetzt: now() });
          }
        } catch (e) { logFehler('versand', `Packstation: Gepackt-Vermerk fuer den Rest nicht gesetzt (${String(e?.message || e).split('\n')[0]})`); }
      }
      return { ok: true, packSchluessel: pk, versand };
    },

    /**
     * Einmal nachholen (#1706): Haken und gepackte Umschlaege aus der Zeit vor dieser Regel in den
     * Wareneingang uebernehmen - dieselbe Regel wie beim Klick. Kein HTTP-Weg; nur bei angehaltenem
     * Dienst aufrufen, damit auftragsstatus.json einen Schreiber behaelt.
     */
    packstationWareneingangNachholen({ actor = 'Packstation (nachgeholt)' } = {}) {
      const dir = privatDirPath || privatDir();
      const stand = leseMusterPackStand(musterPackenPfad(dir));
      const modell = ladeBestellModell(dir);
      const alle = [...(modell?.auftraege || []), ...(modell?.testauftraege || [])];
      const muster = a => (a.positionen || []).filter(p => p.lineItemId && p.istMuster).map(p => ({ orderId: a.id, lineItemId: p.lineItemId }));
      const jePosition = new Map(alle.flatMap(muster).map(p => [p.lineItemId, p]));
      const tag = iso => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.` : 'unbekanntem Tag'; };
      const ergebnisse = [
        ...Object.entries(stand.haken).filter(([id]) => jePosition.has(id))
          .map(([id, h]) => wareneingangAusPackstation({ positionen: [jePosition.get(id)], actor, notiz: `Aus der Packstation übernommen: eingelegt am ${tag(h?.zeit)}` })),
        ...Object.entries(stand.gepackt).map(([key, g]) => {
          const ids = new Set(key.split(','));
          return wareneingangAusPackstation({ positionen: alle.filter(a => ids.has(a.id)).flatMap(muster), actor, notiz: `Aus der Packstation übernommen: Umschlag gepackt am ${tag(g?.zeit)}` });
        }),
      ];
      return { anzahl: ergebnisse.reduce((s, r) => s + r.anzahl, 0), fehler: ergebnisse.map(r => r.fehler).filter(Boolean) };
    },

    async kundenMusteretikettenVormerken(payload = {}, benutzer = null) {
      if (benutzer?.rolle === 'lesen') throw new ApiError(403, 'Dieser Zugang darf Musteraufkleber nur ansehen.');
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)
        || typeof payload.vorgangId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.vorgangId)) throw new ApiError(400, 'Gültige Vorgangskennung fehlt.');
      const actor = benutzer?.name || await currentUser();
      if (!actor) throw new ApiError(403, 'Bitte anmelden – wer vormerkt, wird festgehalten.');
      const plan = this.kundenMusteretiketten(payload.orderId);
      if (plan.gesperrt) throw new ApiError(409, plan.gesperrt);
      const aktiv = plan.zeilen.filter(z => z.anzahl !== 0);
      if (aktiv.some(z => z.fehlt.length || z.vormerkstatus === 'geaendert')) throw new ApiError(409, 'Musterzuordnung oder Drucklistenstand muss zuerst geprüft werden. Es wurde nichts vorgemerkt.');
      const eintraege = aktiv.map(z => {
        // Stabile ID pro Quellposition; gleiche SKU in einer zweiten Position bleibt getrennt.
        const h = createHash('sha256').update(JSON.stringify(['musteretikett-v1', plan.orderId, z.lineItemId])).digest('hex');
        const id = `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
        return { id, produktHandle: z.produktHandle, produktTitel: z.produktTitel, bezeichnung: z.bezeichnung, etikett: z.etikett, anzahl: z.anzahl,
          quelle: { art: 'musterbestellung', orderId: plan.orderId, orderName: plan.orderName, lineItemId: z.lineItemId, bestellmenge: z.bestellmenge } };
      });
      let ergebnis;
      try { ergebnis = aendereMusterDruckliste({ privatDir: privatDirPath || privatDir(), aktion: 'bestellung_hinzufuegen', vorgangId: payload.vorgangId, eintraege, actor, now: now() }); }
      catch (e) { if (e instanceof MusterDrucklisteFehler) throw new ApiError(e.status, e.message); throw e; }
      return { ...this.kundenMusteretiketten(plan.orderId), vormerkung: { neu: ergebnis.neu, bereits: ergebnis.bereits } };
    },

    /**
     * Textvorlage "Muster nachfassen" (Konzept des Inhabers, liegt nur im Privatordner):
     * Betreff und Text der ersten Nachfrage und der Erinnerung. Die Liste selbst rechnet der
     * Browser aus /api/kunden/bestellungen (docs/ai-dashboard/lib/muster-nachfassen.mjs).
     */
    kundenMusterTexte() {
      const dir = privatDirPath || privatDir();
      const file = path.join(dir, 'muster-nachfassen-texte.md');
      // Seit w-119 (automatischer Versand) haengen zwei Dinge mit dran, die die Karte ebenfalls
      // zeigt: der Stand des Versands (eingerichtet? letzter Lauf?) und die Stoppliste.
      const zusatz = () => {
        let abgemeldet = [];
        let stopplisteFehler = null;
        try { abgemeldet = Object.entries(leseStoppliste(stopplistePfad(dir))).map(([email, e]) => ({ email, am: e.am || null, von: e.von || null })); }
        catch (e) { stopplisteFehler = e.message; }
        const versand = nachfassVersandStand(dir, { jetzt: now() });
        return { versand: stopplisteFehler ? { ...versand, hinweis: versand.hinweis || stopplisteFehler } : versand, abgemeldet };
      };
      // "Muster nicht verfuegbar" gibt es immer: aus der Vorlage, wenn sie den Abschnitt hat, sonst der eingebaute Vorschlag.
      let md;
      try { md = fs.readFileSync(file, 'utf8'); }
      catch (e) {
        if (e?.code === 'ENOENT') return { verfuegbar: false, hinweis: 'Die Textvorlage fehlt: muster-nachfassen-texte.md im Privatordner ablegen.', nichtVerfuegbar: NICHT_VERFUEGBAR_VORLAGE, ...zusatz() };
        console.error(`[daten] ${file}: ${e?.message || e}`);
        return { verfuegbar: false, hinweis: 'Die Textvorlage ist nicht lesbar.', nichtVerfuegbar: NICHT_VERFUEGBAR_VORLAGE, ...zusatz() };
      }
      const texte = texteAusMarkdown(md);
      const nichtVerfuegbar = texte.nichtVerfuegbar || NICHT_VERFUEGBAR_VORLAGE;
      if (!texte.erste && !texte.erinnerung) {
        return { verfuegbar: false, hinweis: 'In der Textvorlage fehlen die Abschnitte „Text 1“ und „Erinnerung“ mit einer Zeile „**Betreff:**“.', nichtVerfuegbar, ...zusatz() };
      }
      return { verfuegbar: true, texte, nichtVerfuegbar, ...zusatz() };
    },

    /**
     * Stoppliste "Muster nachfassen": der Kunde hat mit "Abmelden" geantwortet (Knopf
     * "Abgemeldet" in der Karte). Ab jetzt schreibt ihn weder der Lauf noch jemand per Klick
     * an; die Karte zeigt ihn unter "abgemeldet". Antwort traegt den frischen Stand der Karte.
     */
    kundenNachfassenAbmelden(payload = {}, benutzer = null) {
      if (benutzer?.rolle === 'lesen') throw new ApiError(403, 'Rolle „lesen“ darf keine Änderungen vornehmen.');
      const actor = benutzer?.name || null;
      if (!actor) throw new ApiError(403, 'Bitte anmelden – wer die Abmeldung einträgt, wird festgehalten.');
      const dir = privatDirPath || privatDir();
      let r;
      try {
        r = trageAbmeldungEin(stopplistePfad(dir), { email: payload?.email, von: actor, grund: payload?.grund || undefined, orderId: payload?.orderId || null, jetzt: now() });
      } catch (e) {
        if (e instanceof NachfassFehler) throw new ApiError(e.status, e.message);
        throw e;
      }
      audit({ actor, action: 'nachfassen-abgemeldet', orderId: payload?.orderId || null, neu: r.neu });
      merke(benutzer, actor, 'Nachfassen abgemeldet', payload?.orderId ? String(payload.orderName || payload.orderId) : 'Kunde');
      return { ok: true, neu: r.neu, eintrag: r.eintrag, stand: this.kundenMusterTexte() };
    },

    /**
     * Der Versandlauf (taeglich, scripts/muster-nachfassen-senden.mjs; Inhaber w-119, Option A):
     * faellige Nachfragen aus musterNachfassen() (Kaufpruefung steckt in der Zeitleiste), Text 1
     * bzw. Erinnerung aus der Vorlage, Versand ueber das Firmenpostfach, danach der
     * Zeitleisten-Schritt "nachgefasst" mit von = "automatisch".
     *
     * Reihenfolge je Kunde: erst der Vermerk "sendet" im Versandprotokoll, dann die Mail, dann
     * "gesendet", dann die Zeitleiste, dann "vermerkt". Bricht der Lauf dazwischen ab, schickt
     * der naechste keine zweite Mail, sondern holt nur den Zeitleisten-Schritt nach.
     *
     * Nichts geht raus, wenn: die Vorlage fehlt, das Postfach nicht eingerichtet ist, die
     * Stoppliste nicht lesbar ist, ein Platzhalter stehen bliebe. --probe listet nur.
     *
     * @param {object} [p]
     * @param {boolean} [p.probe]   nur auflisten, nichts senden, nichts schreiben
     * @param {Function} [p.senden] Versandfunktion (Tests: Fake-Server oder Attrappe)
     */
    async kundenNachfassenSenden({ probe = false, senden = smtpSenden } = {}) {
      const dir = privatDirPath || privatDir();
      const jetzt = now();
      const ergebnis = { status: 'ok', probe, hinweis: null, kopie: null, geplant: [], verschickt: [], nachgetragen: [], uebersprungen: [], fehler: [] };
      const abbruch = (status, hinweis) => ({ ...ergebnis, status, hinweis });

      const vorlage = this.kundenMusterTexte();
      if (!vorlage.verfuegbar) return abbruch('keine-vorlage', vorlage.hinweis);
      const pf = lesePostfach(postfachPfad(dir));
      // Ohne Postfach wird nichts verschickt - die Probe zeigt trotzdem, was anstuende.
      if (!pf.zugang && !probe) return abbruch('kein-zugang', pf.hinweis);
      let stoppliste;
      let versand;
      try {
        stoppliste = abgemeldeteAdressen(leseStoppliste(stopplistePfad(dir)));
        versand = leseVersand(versandPfad(dir));
      } catch (e) {
        // Stoppliste oder Protokoll unlesbar: lieber niemanden anschreiben als einen Abgemeldeten.
        return abbruch('stoerung', e.message);
      }
      const bestellungen = this.kundenBestellungen();
      if (!bestellungen.verfuegbar) return abbruch('keine-daten', bestellungen.hinweis || 'Bestelldaten fehlen.');

      const { offen, abgemeldet } = musterNachfassen(bestellungen.zeilen, { jetzt, abgemeldet: stoppliste });
      for (const e of abgemeldet) ergebnis.uebersprungen.push({ orderId: e.orderId, orderName: e.orderName, stufe: e.stufe, grund: 'abgemeldet' });
      const kopieAn = pf.zugang && kopieNoetig({ ersterVersandAm: versand.ersterVersandAm, jetzt, immer: pf.zugang.kopieImmer }) ? pf.zugang.kopie : null;
      ergebnis.kopie = kopieAn;
      // Probe ohne Postfach: dieselbe Unterschrift wie der echte Lauf ohne eigene Angabe.
      const unterschrift = pf.zugang?.unterschrift || UNTERSCHRIFT_STANDARD;
      const schrittSetzen = (e, betreff) => auftragsSchrittSetzen(
        { orderId: e.orderId, schritt: 'nachgefasst', notiz: `${STUFE_LABEL[e.stufe]} automatisch per E-Mail: „${betreff}“` },
        { name: AUTOMATISCH, rolle: 'system' }, AUTOMATISCH,
      );
      const sichern = () => { if (!probe) schreibeVersand(versandPfad(dir), versand); };

      for (const e of offen) {
        const kurz = { orderId: e.orderId, orderName: e.orderName, stufe: e.stufe, kundenname: e.kundenname };
        if (e.kontakt.weg !== 'email') {
          ergebnis.uebersprungen.push({ ...kurz, grund: e.kontakt.weg === 'rueckruf' ? 'Rückruf gewünscht – anrufen' : 'keine E-Mail-Adresse' });
          continue;
        }
        const mail = fuelleText(vorlageFuer(vorlage.texte, e), { kundenname: e.kundenname, absender: unterschrift, produkte: e.produkte });
        if (!platzhalterFrei(mail)) {
          ergebnis.fehler.push({ ...kurz, fehler: mail ? 'In der Vorlage bliebe ein Platzhalter stehen – nicht verschickt.' : `Die Vorlage für „${STUFE_LABEL[e.stufe]}“ fehlt.` });
          continue;
        }
        const an = e.kontakt.email;
        const vorher = schonVerschickt(versand, e.orderId, e.stufe);
        if (vorher) {
          // Mail ging schon raus, nur der Zeitleisten-Schritt fehlt (Abbruch im letzten Lauf): nachtragen, nicht neu senden.
          if (probe) { ergebnis.nachgetragen.push({ ...kurz, am: vorher.am }); continue; }
          try {
            await schrittSetzen(e, vorher.betreff || mail.betreff);
            vorher.status = 'vermerkt';
            ergebnis.nachgetragen.push({ ...kurz, am: vorher.am });
          } catch (err) {
            ergebnis.fehler.push({ ...kurz, fehler: `Zeitleiste nicht nachgetragen: ${err?.message || err}` });
          }
          sichern();
          continue;
        }
        if (probe) { ergebnis.geplant.push({ ...kurz, an, betreff: mail.betreff, text: mail.text }); continue; }

        const eintrag = { am: jetzt.toISOString(), orderId: e.orderId, orderName: e.orderName, stufe: e.stufe, an, betreff: mail.betreff, kopie: kopieAn, status: 'sendet', messageId: null, fehler: null };
        versand.sendungen.push(eintrag);
        sichern();
        try {
          const r = await senden(pf.zugang, { von: { name: pf.zugang.absenderName, adresse: pf.zugang.absender }, an: [an], bcc: kopieAn ? [kopieAn] : [], betreff: mail.betreff, text: mail.text, datum: jetzt });
          eintrag.status = 'gesendet';
          eintrag.messageId = r?.messageId || null;
          if (!versand.ersterVersandAm) versand.ersterVersandAm = jetzt.toISOString();
        } catch (err) {
          eintrag.status = 'fehler';
          eintrag.fehler = String(err?.message || err).slice(0, 300);
          sichern();
          ergebnis.fehler.push({ ...kurz, fehler: eintrag.fehler });
          continue;
        }
        sichern();
        try {
          await schrittSetzen(e, mail.betreff);
          eintrag.status = 'vermerkt';
        } catch (err) {
          // Die Mail ist raus - das bleibt im Protokoll stehen, der naechste Lauf traegt die Zeitleiste nach.
          ergebnis.fehler.push({ ...kurz, fehler: `E-Mail verschickt, Zeitleiste nicht geschrieben: ${err?.message || err}` });
        }
        sichern();
        ergebnis.verschickt.push({ ...kurz, an, betreff: mail.betreff, kopie: kopieAn });
      }
      if (!probe) {
        versand.letzterLauf = { am: jetzt.toISOString(), verschickt: ergebnis.verschickt.length, nachgetragen: ergebnis.nachgetragen.length, uebersprungen: ergebnis.uebersprungen.length, fehler: ergebnis.fehler.length, kopie: kopieAn };
        // Protokoll schlank halten: die letzten 500 Sendungen reichen fuer Doppelschutz und Rueckblick.
        if (versand.sendungen.length > 500) versand.sendungen = versand.sendungen.slice(-500);
        sichern();
        audit({ actor: AUTOMATISCH, action: 'nachfassen-lauf', ...versand.letzterLauf });
      }
      return ergebnis;
    },

    /**
     * Knopf "Jetzt senden" in der Karte: EINE Nachfrage sofort vom Firmenpostfach, mit dem Text,
     * den der Mitarbeiter im Feld sieht (und ggf. angepasst hat). Dieselben Schutzregeln wie der
     * Lauf: Empfaenger kommt nur aus den Bestelldaten (nie aus dem Browser), Stoppliste und
     * Versandprotokoll werden frisch gelesen, kein Platzhalter erreicht den Kunden, dieselbe
     * Stufe geht nie zweimal raus. Danach Zeitleiste "nachgefasst" mit dem Namen des Absenders.
     *
     * @param {{orderId: string, stufe?: string, betreff?: string, text?: string}} payload
     * @param {object} [o]
     * @param {Function} [o.senden] Versandfunktion (Tests: SMTP-Attrappe)
     */
    async kundenNachfassenEinzeln(payload = {}, benutzer = null, { senden = smtpSenden } = {}) {
      if (benutzer?.rolle === 'lesen') throw new ApiError(403, 'Rolle „lesen“ darf keine E-Mails verschicken.');
      const actor = benutzer?.name || null;
      if (!actor) throw new ApiError(403, 'Bitte anmelden – wer die E-Mail verschickt, wird festgehalten.');
      const orderId = String(payload?.orderId || '');
      if (!orderId) throw new ApiError(400, 'orderId ist Pflicht', { missing: ['orderId'] });
      const dir = privatDirPath || privatDir();
      const jetzt = now();

      const pf = lesePostfach(postfachPfad(dir));
      if (!pf.zugang) throw new ApiError(409, pf.hinweis || 'Das Firmenpostfach ist nicht eingerichtet.');
      let stoppliste;
      let versand;
      try {
        stoppliste = abgemeldeteAdressen(leseStoppliste(stopplistePfad(dir)));
        versand = leseVersand(versandPfad(dir));
      } catch (e) {
        throw new ApiError(409, `Nicht verschickt: ${e.message}`);
      }
      const bestellungen = this.kundenBestellungen();
      if (!bestellungen.verfuegbar) throw new ApiError(409, bestellungen.hinweis || 'Bestelldaten fehlen.');
      const { offen, abgemeldet } = musterNachfassen(bestellungen.zeilen, { jetzt, abgemeldet: stoppliste });
      if (abgemeldet.some(a => a.orderId === orderId)) throw new ApiError(409, 'Der Kunde hat sich abgemeldet – keine Nachfragen mehr.');
      const e = offen.find(o => o.orderId === orderId);
      if (!e) throw new ApiError(409, 'Für diese Bestellung steht keine Nachfrage mehr an – schon nachgefasst? Seite neu laden.');
      if (payload?.stufe && payload.stufe !== e.stufe) throw new ApiError(409, 'Der Stand hat sich inzwischen geändert – Seite neu laden.');
      if (e.kontakt.weg !== 'email') throw new ApiError(409, 'Für diesen Kunden ist keine E-Mail-Adresse hinterlegt.');
      const vorher = schonVerschickt(versand, orderId, e.stufe);
      if (vorher) throw new ApiError(409, `Diese E-Mail ist schon am ${new Date(vorher.am).toLocaleDateString('de-DE')} rausgegangen – nichts doppelt verschickt.`);

      // Text aus dem Feld der Karte; ohne Angabe die Vorlage, unterschrieben vom Absender.
      let mail;
      if (payload?.text != null) {
        mail = { betreff: String(payload.betreff ?? '').trim(), text: String(payload.text).replace(/\r\n/g, '\n').trim() };
      } else {
        const vorlage = this.kundenMusterTexte();
        mail = vorlage.verfuegbar ? fuelleText(vorlageFuer(vorlage.texte, e), { kundenname: e.kundenname, absender: actor, produkte: e.produkte }) : null;
        if (!mail) throw new ApiError(409, vorlage.hinweis || `Die Vorlage für „${STUFE_LABEL[e.stufe]}“ fehlt.`);
      }
      if (!mail.betreff || /[\r\n]/.test(mail.betreff) || mail.betreff.length > 200) throw new ApiError(400, 'Bitte einen Betreff in einer Zeile angeben (höchstens 200 Zeichen).');
      if (!mail.text || mail.text.length > 20000) throw new ApiError(400, 'Der Text der E-Mail fehlt oder ist zu lang.');
      if (!platzhalterFrei(mail)) throw new ApiError(400, 'Im Text steht noch ein Platzhalter in {geschweiften Klammern} – bitte ersetzen.');

      const an = e.kontakt.email;
      const kopieAn = kopieNoetig({ ersterVersandAm: versand.ersterVersandAm, jetzt, immer: pf.zugang.kopieImmer }) ? pf.zugang.kopie : null;
      const sichern = () => schreibeVersand(versandPfad(dir), versand);
      // Reihenfolge wie im Lauf: erst "sendet" vermerken, dann senden - ein Abbruch fuehrt nie zu einer zweiten Mail.
      const eintrag = { am: jetzt.toISOString(), orderId, orderName: e.orderName, stufe: e.stufe, an, betreff: mail.betreff, kopie: kopieAn, von: actor, status: 'sendet', messageId: null, fehler: null };
      versand.sendungen.push(eintrag);
      sichern();
      try {
        const r = await senden(pf.zugang, { von: { name: pf.zugang.absenderName, adresse: pf.zugang.absender }, an: [an], bcc: kopieAn ? [kopieAn] : [], betreff: mail.betreff, text: mail.text, datum: jetzt });
        eintrag.status = 'gesendet';
        eintrag.messageId = r?.messageId || null;
        if (!versand.ersterVersandAm) versand.ersterVersandAm = jetzt.toISOString();
      } catch (err) {
        eintrag.status = 'fehler';
        eintrag.fehler = String(err?.message || err).slice(0, 300);
        sichern();
        audit({ actor, action: 'nachfassen-einzeln', orderId, stufe: e.stufe, status: 'fehler' });
        throw new ApiError(502, `E-Mail nicht verschickt: ${eintrag.fehler}`);
      }
      sichern();
      let zeitleisteFehler = null;
      try {
        await auftragsSchrittSetzen({ orderId, schritt: 'nachgefasst', notiz: `${STUFE_LABEL[e.stufe]} per E-Mail aus dem Control Center: „${mail.betreff}“` }, benutzer, actor);
        eintrag.status = 'vermerkt';
      } catch (err) {
        // Die Mail ist raus; der naechste Lauf traegt die Zeitleiste nach (schonVerschickt), statt neu zu senden.
        zeitleisteFehler = String(err?.message || err);
      }
      sichern();
      audit({ actor, action: 'nachfassen-einzeln', orderId, stufe: e.stufe, status: eintrag.status, kopie: kopieAn });
      merke(benutzer, actor, 'Muster nachgefasst per E-Mail', String(e.orderName || orderId));
      return { ok: true, an, kopie: kopieAn, stufe: e.stufe, zeitleisteFehler, stand: this.kundenMusterTexte() };
    },

    /**
     * "Kunde fertig": setzt ALLE offenen Positionen einer Bestellung auf
     * Erledigt - bewusster Sammelschritt mit Rueckfrage im Browser und
     * Protokolleintrag (wer/wann je Position ueber merke()), nie ein
     * stiller Massenwechsel.
     */
    async kundenBestellungFertig(payload = {}, benutzer = null) {
      const actor = benutzer?.name || await currentUser();
      if (!actor) throw new ApiError(403, 'gh ist nicht angemeldet – keine Schreibaktion möglich');
      const { orderId, lineItemIds, notiz } = payload || {};
      if (!orderId || !Array.isArray(lineItemIds) || !lineItemIds.length) {
        throw new ApiError(400, 'orderId und lineItemIds sind Pflicht', { missing: ['orderId', 'lineItemIds'] });
      }
      const dir = privatDirPath || privatDir();
      const file = auftragsstatusPfad(dir);
      const modell = ladeBestellModell(dir);
      const auftrag = [...(modell?.auftraege || []), ...(modell?.testauftraege || [])].find(a => a.id === orderId) || null;
      const positionen = auftrag?.positionen || [];
      const ids = [...new Set(lineItemIds.map(String))];
      // Was vorher noch nicht erledigt war, wird gleich in Shopify gebucht (ohne Kundenmail).
      const vorher = leseAuftragsstatus(file);
      const neuErledigt = ids.filter(id => vorher[positionKey(orderId, id)]?.status !== 'erledigt');
      let eintraege;
      try {
        eintraege = setzeStatusPositionen(file, ids.map(lineItemId => { const p = positionen.find(p => p.lineItemId === lineItemId); return { orderId, lineItemId, status: 'erledigt', actor, bestellmenge: p?.bestellSoll || p?.bestellmenge || null, notiz: notiz || 'Kunde fertig (Sammelschritt)', jetzt: now() }; }));
      } catch (e) {
        if (e instanceof AuftragsstatusFehler) throw new ApiError(e.status, e.message);
        throw e;
      }
      audit({ actor, action: 'auftragsstatus-kunde-fertig', orderId, anzahl: eintraege.length });
      merke(benutzer, actor, 'Kunde fertig', `${auftrag?.name || orderId}: ${eintraege.length} Artikel`);
      const shopifyErgebnis = await erledigtBuchen({ dir, auftrag: auftrag || auftragFuerVersand(dir, String(orderId)), lineItemIds: neuErledigt, benutzer, actor });
      const stand = leseAuftragsstatus(file);
      // Eintraege nach der Buchung (mit Versandvermerk), in derselben Reihenfolge wie bisher.
      return { ok: true, anzahl: eintraege.length, eintraege: eintraege.map(e => stand[positionKey(e.orderId, e.lineItemId)] || e), ...(shopifyErgebnis ? { shopify: shopifyErgebnis } : {}) };
    },

    /** Rueckruf-/Beratungs-Arbeitsliste, aelteste Bestellung zuerst, mit lokalem Bearbeitungsstatus. */
    kundenRueckrufe() {
      const dir = privatDirPath || privatDir();
      const modell = ladeBestellModell(dir);
      if (!modell) return { verfuegbar: false, quelle: path.join(dir, 'bestelluebersicht', 'orders.json'), hinweis: 'orders.json fehlt.' };
      const statusAlle = leseRueckrufe(rueckrufePfad(dir));
      const zeilen = rueckrufliste(modell).map(z => {
        const s = statusAlle[z.orderId];
        return {
          ...z, status: s?.status || 'offen', notiz: s?.notiz || null,
          aktualisiertAm: s?.aktualisiertAm || null, aktualisiertVon: s?.aktualisiertVon || null,
          wiedervorlage: s?.wiedervorlage || null,
        };
      });
      return { verfuegbar: true, zeilen };
    },

    /**
     * Setzt den Bearbeitungsstatus eines Rueckrufs (offen/angerufen/erledigt).
     *
     * Rein lokal - es wird eine JSON-Datei geschrieben, nichts auf GitHub.
     * Frueher verlangte diese Funktion trotzdem ein angemeldetes gh und brach
     * sonst mit 403 ab; ausserdem stand am Eintrag der GitHub-Login statt der
     * Person, die wirklich angerufen hat.
     */
    async kundenRueckrufSetzen(payload = {}, benutzer = null) {
      const actor = benutzer?.name || benutzer?.kuerzel || await currentUser() || 'Unbekannt';
      const { orderId, status, notiz, wiedervorlage } = payload || {};
      if (!orderId) throw new ApiError(400, 'orderId ist Pflicht');
      if (!RUECKRUF_STATUS.includes(status)) throw new ApiError(400, `Unbekannter Status „${status}"`, { missing: [`Status muss einer von ${RUECKRUF_STATUS.join(', ')} sein`] });
      const dir = privatDirPath || privatDir();
      const file = rueckrufePfad(dir);
      let eintrag;
      try {
        eintrag = setzeRueckrufStatus(file, { orderId, status, actor, notiz, wiedervorlage, jetzt: now() });
      } catch (e) {
        if (e instanceof RueckrufFehler) throw new ApiError(400, e.message);
        throw e;
      }
      audit({ actor, action: 'rueckruf', orderId, status });
      merke(benutzer, actor, 'Rückruf', `${orderId}: ${status}`);
      return { ok: true, eintrag };
    },

    /** Service-Anfragen (Verlegeservice, Treppe, Aufmass): alle, neueste zuerst. */
    async kundenServiceanfragen() {
      const dir = privatDirPath || privatDir();
      const eintraege = leseServiceanfragen(serviceanfragenPfad(dir))
        .slice().sort((a, b) => (b.datum || '').localeCompare(a.datum || '') || (b.id || '').localeCompare(a.id || ''));
      const abgleich = await serviceLaden.abrufen(eintraege);
      if (!abgleich.verfuegbar) return { verfuegbar: true, eintraege };
      return { verfuegbar: true, eintraege: serviceMitLaden(eintraege, abgleich, abgleich.basis),
        ladenAbgleich: { verfuegbar: abgleich.verfuegbar, grund: abgleich.grund || null } };
    },

    /**
     * Anfrage anlegen (ohne `id`) oder aendern (mit `id`). Rein lokal - die
     * Datei enthaelt Namen und Telefonnummern und gehoert nicht ins Repository.
     */
    kundenServiceanfrageSetzen(payload = {}, benutzer = null) {
      const actor = benutzer?.name || benutzer?.kuerzel || 'Inhaber';
      const { id = null, ...felder } = payload || {};
      const file = serviceanfragenPfad(privatDirPath || privatDir());
      try {
        if (id) {
          const eintrag = serviceanfrageAendern(file, String(id), felder, { actor, jetzt: now() });
          merke(benutzer, actor, 'Service-Anfrage', `${eintrag.id}: ${eintrag.status}`);
          return { ok: true, eintrag };
        }
        const { eintrag, doppelt } = serviceanfrageAnlegen(file, felder, { actor, jetzt: now() });
        if (!doppelt) merke(benutzer, actor, 'Service-Anfrage', `${eintrag.id}: angelegt`);
        return { ok: true, eintrag, doppelt };
      } catch (e) {
        if (e instanceof ServiceanfrageFehler) throw new ApiError(400, e.message);
        throw e;
      }
    },

    /**
     * Lieferantenbelege aus dem Postfach (AB, Lieferschein, Avis, Storno): je Beleg Art,
     * Zuordnung zur Bestellung (sicher / Vorschlag / keine) und der Abgleich je Auftrag gegen
     * Auftragsfluss und Shopify. Gelesen wird nur die private Ablage - das Postfach liest der
     * geplante Claude-Lauf (operations/scripts/lieferbelege.mjs). Siehe ARCHITEKTUR §25.
     */
    einkaufBelege() {
      const dir = privatDirPath || privatDir();
      let ablage;
      try { ablage = leseBelege(lieferbelegePfad(dir)); }
      catch (e) { if (e instanceof LieferbelegFehler) return { verfuegbar: false, fehler: true, hinweis: e.message }; throw e; }
      const k = this._lieferantenKontext();
      // Ohne Bestellungen ist weder "kein Shop-Auftrag" noch "nichts zu pruefen" belegt.
      if (!k.modell || !k.exportGueltig) return { verfuegbar: false, fehler: true, hinweis: k.hinweis || 'orders.json hat kein gültiges Bestellformat – bitte die Daten aktualisieren.' };
      const zeilen = k.modell ? bestellliste(k.modell, { statusAlle: k.statusAlle }) : [];
      const kandidaten = kandidatenAus(zeilen, k.statusAlle);
      // Lieferant: aus der Absenderdomain; ohne Treffer der, den ein Mensch beim Zuordnen gewaehlt hat.
      const mitLieferant = Object.values(ablage.belege).map(b => {
        const domain = domainVon(b.von);
        return { ...b, domain, lieferant: lieferantZurDomain(domain, { stammdaten: k.stammdaten, absender: ablage.absender }) || b.entscheidung?.lieferant || null };
      });
      const belege = ordneAlleZu(mitLieferant, kandidaten, { absender: ablage.absender })
        .sort((a, b) => String(b.datum).localeCompare(String(a.datum)));
      const { zeilen: abgleichZeilen, abweichungen } = belegAbgleich({ belege, kandidaten, jetzt: now() });
      // Name und Nummer nur der Bestellungen, die eine Zeile, ein Beleg oder ein Vorschlag nennt.
      const genannt = new Set([...abgleichZeilen.map(z => z.orderId), ...belege.flatMap(b => b.zuordnung.orderIds)]);
      const auftraege = Object.fromEntries(kandidaten.filter(c => genannt.has(c.orderId)).map(c => [c.orderId, { orderName: c.orderName, kundenname: c.kundenname, datum: c.datum }]));
      // Fuer "Zu Bestellung zuordnen": Shop-Bestellungen der letzten 120 Tage mit Lieferanten-Positionen.
      const grenze = now().getTime() - 120 * 86400000;
      const auswahl = kandidaten.filter(c => c.lieferanten.length && Date.parse(c.datum) >= grenze)
        .sort((a, b) => String(b.datum).localeCompare(String(a.datum)))
        .map(c => ({ orderId: c.orderId, orderName: c.orderName, kundenname: c.kundenname, lieferanten: c.lieferanten }));
      const lieferanten = Object.fromEntries(Object.entries(k.stammdaten.lieferanten || {}).map(([id, l]) => [id, l.name || id]));
      return {
        verfuegbar: true, hinweis: k.hinweis,
        letzterLauf: ablage.laeufe.at(-1) || null,
        belege, zeilen: abgleichZeilen, abweichungen, auftraege, auswahl, lieferanten,
        absender: ablage.absender,
      };
    },

    /** Entscheidung zu einem Beleg oder Absender. Person aus der Sitzung; Bestellungen gegen das Modell geprueft. */
    einkaufBelegSetzen(payload = {}, benutzer = null) {
      const actor = benutzer?.name || benutzer?.kuerzel || 'Inhaber';
      const dir = privatDirPath || privatDir();
      const p = payload && typeof payload === 'object' ? payload : {};
      let pruefung = {};
      if (p.aktion === 'zuordnen') {
        const k = this._lieferantenKontext();
        const zeilen = k.modell ? bestellliste(k.modell, { statusAlle: k.statusAlle }) : [];
        const jeAuftrag = new Map(kandidatenAus(zeilen, k.statusAlle).map(c => [c.orderId, c.lieferanten]));
        let absender = {};
        try { absender = leseBelege(lieferbelegePfad(dir)).absender; } catch { /* entscheide() meldet die kaputte Ablage */ }
        pruefung = {
          gueltigeOrderIds: new Set(zeilen.map(z => z.orderId)),
          gueltigeLieferanten: new Set([...Object.keys(k.stammdaten.lieferanten || {}), ...[...jeAuftrag.values()].flat()]),
          lieferantenJeAuftrag: jeAuftrag,
          absenderLieferant: b => lieferantZurDomain(b.domain, { stammdaten: k.stammdaten, absender }),
        };
      }
      try {
        const e = belegEntscheiden(lieferbelegePfad(dir), p, { person: actor, jetzt: now(), ...pruefung });
        merke(benutzer, actor, 'Lieferbeleg', `${p.aktion}${e.domain ? ` ${e.domain}` : ''}`);
      } catch (e) {
        if (e instanceof LieferbelegFehler) throw new ApiError(400, e.message);
        throw e;
      }
      return { ok: true, ...this.einkaufBelege() };
    },

    /**
     * Produktdaten-Status: eine Zeile je PRODUKT (nicht je Variante/Feld -
     * das waeren bei 3.300 Varianten und ~10 Feldern mehrere zehntausend
     * Einzelpunkte und keine brauchbare Arbeitsliste). Dimension (Titel,
     * Gruppe, Varianten) kommt aus dem Einkauf-Dry-Run (plan.json), die
     * tatsaechlich noch offenen Felder aus dem frischeren Klaerungslauf
     * (einkauf-klaerung/offen.json) - plan.json selbst kann ein aelterer
     * Zwischenstand sein. Filter: 'blockierend' (nur was eine Bestellung
     * verhindert), 'handarbeit' (nur was eine Person klaeren muss),
     * '' = alle offenen Produkte.
     */
    einkaufProduktstatus({ page = 1, pageSize = 50, q = '', gruppe = '', filter = '' } = {}) {
      const dir = privatDirPath || privatDir();
      const lexikonFile = path.join(dir, 'lexikon', 'produkte.json');
      const planFile = path.join(dir, 'einkauf-dryrun', 'plan.json');
      const offenFile = path.join(dir, 'einkauf-klaerung', 'offen.json');
      // Vorrang hat das Lexikon (laufend erneuert); die Septemberdateien nur, wenn es keins gibt.
      const lexikon = readJsonGecacht(lexikonFile);
      let planRows;
      let offenRows;
      let quelle;
      let stand = null;
      if (Array.isArray(lexikon?.produkte)) {
        ({ planRows, offenRows } = produktstatusAusLexikon(lexikon.produkte));
        quelle = lexikonFile;
        stand = lexikon.erstellt || null;
      } else {
        planRows = readJsonIfExists(planFile);
        if (!Array.isArray(planRows)) return { verfuegbar: false, quelle: lexikonFile, hinweis: 'Noch keine Lexikon-Daten exportiert.', befehl: 'npm run daten:aktualisieren -- --nur lexikon' };
        offenRows = readJsonIfExists(offenFile);
        if (!Array.isArray(offenRows)) return { verfuegbar: false, quelle: offenFile, hinweis: 'offen.json fehlt (einkauf-klaerung) - Klaerungslauf vorher lokal ausfuehren.' };
        quelle = `${planFile} + ${offenFile}`;
      }

      const eintraege = produktstatusAufbauen(planRows, offenRows);
      const gruppen = {};
      for (const e of eintraege) {
        const g = gruppen[e.gruppe] || (gruppen[e.gruppe] = { gruppe: e.gruppe, vollstaendig: 0, handarbeit: 0, automatisch: 0 });
        g[e.status] += 1;
      }
      const gesamt = {
        anzahl: eintraege.length,
        vollstaendig: eintraege.filter(e => e.status === 'vollstaendig').length,
        handarbeit: eintraege.filter(e => e.status === 'handarbeit').length,
        automatisch: eintraege.filter(e => e.status === 'automatisch').length,
        // Rueckwaertskompatibel: "offen" = nicht vollstaendig.
        offen: eintraege.filter(e => e.status !== 'vollstaendig').length,
      };

      let offene = eintraege.filter(e => e.status !== 'vollstaendig');
      if (gruppe) offene = offene.filter(e => e.gruppe === gruppe);
      if (filter === 'blockierend') offene = offene.filter(e => e.blockiertBestellung);
      else if (filter === 'handarbeit') offene = offene.filter(e => e.status === 'handarbeit');
      if (q) offene = offene.filter(e => produktSucheTreffer(e, q));
      offene.sort((a, b) => b.dringlichkeit - a.dringlichkeit || a.titel.localeCompare(b.titel, 'de'));

      const size = Math.min(Math.max(Number(pageSize) || 50, 1), 200);
      const p = Math.max(Number(page) || 1, 1);
      const start = (p - 1) * size;
      const seite = offene.slice(start, start + size);

      return {
        verfuegbar: true, quelle, stand,
        gesamt, gruppen: Object.values(gruppen).sort((a, b) => (b.handarbeit + b.automatisch) - (a.handarbeit + a.automatisch)),
        offen: { count: offene.length, page: p, pageSize: size, pages: Math.max(Math.ceil(offene.length / size), 1), items: seite },
      };
    },

    /**
     * Gemeinsame Grundlage der drei Lieferanten-Endpunkte: Bestellmodell,
     * Auftragsfluss-Status und die privaten Stammdaten. Fehlende Dateien sind
     * kein Fehler - `modell` ist dann null, die Stammdaten "nicht hinterlegt".
     */
    _lieferantenKontext() {
      const dir = privatDirPath || privatDir();
      const stammdaten = leseStammdaten(stammdatenPfad(dir));
      const ordersDatei = path.join(dir, 'bestelluebersicht', 'orders.json');
      const daten = readJsonIfExists(ordersDatei);
      let modell = null;
      let hinweis = null;
      if (!daten) hinweis = leseFehler(ordersDatei) || 'orders.json fehlt - Bestelldaten noch nicht exportiert (npm run daten:aktualisieren).';
      else {
        try { modell = bereiteBestellModell(daten, dir, now()); }
        catch (e) { hinweis = `orders.json konnte nicht ausgewertet werden: ${e.message}`; }
      }
      return {
        modell, hinweis, stammdaten,
        // Der bisherige Loader normalisiert fehlende GraphQL-nodes zu []. Fuer Belege
        // darf eine beschaedigte Exportstruktur keine leere Arbeitsliste bestaetigen.
        exportGueltig: exportOrders(daten) !== null && !(daten?.data?.orders && !Array.isArray(daten.data.orders.nodes)),
        statusAlle: leseAktuellenStatus(auftragsstatusPfad(dir), modell),
        stammdatenDatei: {
          vorhanden: stammdaten.vorhanden,
          quelle: stammdaten.quelle,
          fehler: stammdaten.fehler,
          hinweis: stammdaten.vorhanden ? null : 'Lieferanten-Stammdaten nicht hinterlegt - Vorlage: operations/lib/lieferanten.beispiel.json.',
          absenderHinterlegt: !!(stammdaten.absender.firma || stammdaten.absender.kontaktName || stammdaten.absender.lieferanschrift),
        },
      };
    },

    async musterBestellungenAutomatisch({ probe = false, senden = smtpSenden } = {}) {
      const dir = privatDirPath || privatDir();
      return musterAutomatikLauf({ dir, kontext: () => this._lieferantenKontext(), katalog: () => this._lexikonProdukte(), jetzt: now(), probe, senden });
    },

    /** Alle Lieferanten mit Stammdaten, offenen Positionen je Stufe und ueberfaelligen Bestellungen. */
    einkaufLieferanten() {
      const k = this._lieferantenKontext();
      return {
        verfuegbar: !!k.modell,
        hinweis: k.hinweis,
        stammdatenDatei: k.stammdatenDatei,
        ...lieferantenUebersicht(k.modell, { statusAlle: k.statusAlle, stammdaten: k.stammdaten, jetzt: now() }),
      };
    },

    /** Ein Lieferant mit allen offenen Positionen. */
    einkaufLieferant({ id = '' } = {}) {
      if (!String(id).trim()) throw new ApiError(400, 'id ist Pflicht', { missing: ['id'] });
      const k = this._lieferantenKontext();
      const lieferant = lieferantDetail(k.modell, id, { statusAlle: k.statusAlle, stammdaten: k.stammdaten, jetzt: now() });
      if (!lieferant) throw new ApiError(404, 'Lieferant nicht gefunden');
      return { verfuegbar: !!k.modell, hinweis: k.hinweis, stammdatenDatei: k.stammdatenDatei, lieferant };
    },

    /** Fertige Bestellung (Ware je Gruppe bzw. offene Muster) als Mailtext + mailto:-Link. Sendet nichts. */
    einkaufBestellmail({ lieferant = '', art = 'ware', gruppe = '', ziel = '', auftrag = '' } = {}) {
      const k = this._lieferantenKontext();
      if (!k.modell) return { verfuegbar: false, hinweis: k.hinweis, stammdatenDatei: k.stammdatenDatei, mails: [] };
      try {
        return {
          verfuegbar: true,
          stammdatenDatei: k.stammdatenDatei,
          ...bestellmail({ modell: filtereAuftrag(k.modell, auftrag), lieferant, art, gruppe: gruppe || null, ziel: ziel || null, statusAlle: k.statusAlle, stammdaten: k.stammdaten, jetzt: now() }),
        };
      } catch (e) {
        if (e instanceof LieferantenFehler) throw new ApiError(400, e.message);
        throw e;
      }
    },

    einkaufKettelversand({orderId} = {}) {
      const dir=privatDirPath || privatDir(); const k=this._lieferantenKontext();
      const auftrag=k.modell?.auftraege.find(a=>a.id===orderId);
      if(!auftrag) throw new ApiError(404, 'Bestellung nicht gefunden.');
      const stand=leseKettelversand(dir).auftraege[orderId] || {revision:0,positionen:{},pakete:[]};
      const abholPlz=k.stammdaten.absender?.kettelservice?.plz;
      const tarif=kettelTarife(path.join(dir,'versandkosten','tarife.json')).tarif;
      const rohAuftrag = exportOrders(readJsonGecacht(path.join(dir, 'bestelluebersicht', 'orders.json')))?.find(a => a.id === orderId);
      const rohPositionen = Array.isArray(rohAuftrag?.lineItems) ? rohAuftrag.lineItems
        : Array.isArray(rohAuftrag?.lineItems?.nodes) ? rohAuftrag.lineItems.nodes
          : Array.isArray(rohAuftrag?.lineItems?.edges) ? rohAuftrag.lineItems.edges.map(e => e.node).filter(Boolean) : [];
      let katalog = [];
      try { katalog = this._lexikonProdukte(); } catch { /* Optionale Materialhilfe bleibt unbekannt. */ }
      let portale={};
      try { const p=readJsonIfExists(path.join(dir,'versandkosten','portale.json')); for(const name of ['GLS','GEL']) if(typeof p?.[name]==='string' && /^https:\/\//.test(p[name])) portale[name]=p[name]; } catch { /* Optionaler Portalzugang */ }
      return {verfuegbar:true,orderId,name:auftrag.name,revision:stand.revision,
        positionen:auftrag.positionen.filter(kettelPosition).map(p=>{
          const produkte = p.handle ? katalog.filter(x => x?.handle === p.handle) : [];
          const roh = rohPositionen.filter(x => x?.id === p.lineItemId);
          return {id:p.lineItemId,titel:p.titel,farbe:p.farbe,ausfuehrung:p.ausfuehrung,stand:stand.positionen[p.lineItemId] || {},
            packhilfe:packhilfeDaten({position:p,rohPosition:roh.length === 1 ? roh[0] : null,produkt:produkte.length === 1 ? produkte[0] : null})};
        }),
        pakete:stand.pakete.map(p=>({...p,vergleich:packVergleich(p,tarif,{zielPlz:auftrag.details?.lieferadresse?.plz,abholPlz})})),portale};
    },

    /** Auftragsfluss-Status je Position, rein lokal (nie im Repository). */
    einkaufAuftragsstatus() {
      const dir = privatDirPath || privatDir();
      shopifyAbgleichen(dir);
      const file = auftragsstatusPfad(dir);
      const positionen = leseAktuellenStatus(file);
      return { verfuegbar: true, quelle: file, positionen };
    },

    /**
     * Abgleich mit Shopify (operations/lib/shopify-abgleich.mjs): Bestellungen, die im Dashboard
     * abgehakt sind (raus/erledigt), in Shopify aber offen - je Bestellung eine Zeile, dazu der
     * letzte Lauf Shopify -> Dashboard. Lesend fuer alle Rollen; nachgebucht wird ueber
     * POST /api/einkauf/auftragsstatus (aktion "shopifyNachbuchen", Schreibpfad).
     */
    einkaufShopifyAbgleich() {
      const dir = privatDirPath || privatDir();
      const quelle = path.join(dir, 'bestelluebersicht', 'orders.json');
      const lauf = shopifyAbgleichen(dir);
      let liste;
      let entfernt;
      try {
        liste = abweichungsListe(dir);
        // Aus der Kundenbestellung entfernt, beim Lieferanten bestellt: stornieren (#1056).
        entfernt = liste ? abgleichListe(dir, entfernteBestellt) : null;
      } catch (e) {
        // Beschaedigte Ablage: sichtbar als Stoerung, nie als "alles gleich".
        return { verfuegbar: true, fehler: String(e?.message || e).split('\n')[0], abweichungen: [], entfernt: [], letzterAbgleich: lauf || null };
      }
      if (!liste) return { verfuegbar: false, quelle, hinweis: leseFehler(quelle) || 'orders.json fehlt.' };
      return { verfuegbar: true, fehler: null, abweichungen: liste, entfernt: entfernt || [], letzterAbgleich: lauf || null };
    },

    /** Fuer den Zeitgeber im Dienst: Shopify -> Dashboard nach jedem neuen Export, auch ohne offene Seite. */
    shopifyAbgleich() {
      return shopifyAbgleichen();
    },

    /** Setzt den Status einer Bestellposition (Bestellt/Geliefert/Raus/Erledigt). */
    async einkaufAuftragsstatusSetzen(payload = {}, benutzer = null) {
      if (benutzer?.rolle === 'lesen') throw new ApiError(403, 'Rolle „lesen“ darf keine Änderungen vornehmen.');
      // Im Mehrbenutzerbetrieb ist der angemeldete Dashboard-Benutzer die handelnde Person -
      // gh-Anmeldung ist fuer diese rein lokale Aktion dann nicht mehr Voraussetzung. Ohne
      // Anmeldung (Notzugang) bleibt der bisherige gh-Login die handelnde Person.
      const actor = benutzer?.name || await currentUser();
      if (!actor) throw new ApiError(403, 'gh ist nicht angemeldet – keine Schreibaktion möglich');
      if (['bestellVorbereitung', 'bestellPruefen'].includes(payload?.aktion)) {
        // Kein Shopify-Abgleich: diese Aktionen bereiten nur vor bzw. lesen frisch gegen.
        const scope = Object.fromEntries(['lieferant', 'art', 'gruppe', 'ziel', 'auftrag'].map(k => [k, payload[k] ?? (k === 'art' ? 'ware' : '')]));
        if (Object.values(scope).some(v => typeof v !== 'string')) throw new ApiError(400, 'Bestellparameter müssen Text sein.');
        const vorlage = this.einkaufBestellmail(scope);
        if (!vorlage.verfuegbar) throw new ApiError(409, vorlage.hinweis || 'Bestelldaten fehlen.');
        const stand = vorbereitungStand(vorlage, scope);
        const mails = (vorlage.mails || []).map(m => ({ ...m, vorbereitungStand: vorbereitungStand({ mails: [m] }, scope) }));
        const mailAuswahl = payload.aktion === 'bestellPruefen' && payload.mailStand !== undefined
          ? mails.filter(m => typeof payload.mailStand === 'string' && m.vorbereitungStand === payload.mailStand) : mails;
        if (payload.aktion === 'bestellPruefen' && payload.mailStand !== undefined && mailAuswahl.length !== 1) throw new ApiError(409, 'Dieser Teil der Bestellvorlage hat sich geändert. Bitte neu vorbereiten und prüfen.');
        const positionen = [...new Map(mailAuswahl.flatMap(m => m.positionen || []).map(p => [positionKey(p.orderId, p.lineItemId), { orderId: p.orderId, lineItemId: p.lineItemId }])).values()];
        const file = auftragsstatusPfad(privatDirPath || privatDir());
        try {
          if (payload.aktion === 'bestellPruefen') {
            if (payload.mailStand === undefined && (typeof payload.vorbereitungStand !== 'string' || payload.vorbereitungStand !== stand)) throw new ApiError(409, 'Die Bestellvorlage hat sich geändert. Bitte neu vorbereiten und prüfen.');
            const status = leseAuftragsstatus(file);
            const id = bestellPersonId(benutzer, actor);
            if (positionen.some(p => !id || status[positionKey(p.orderId, p.lineItemId)]?.uebernahme?.id !== id)) throw new ApiError(409, 'Die Bestellarbeit ist nicht mehr von dir übernommen. Bitte neu vorbereiten.');
          } else if (positionen.length) {
            arbeitsuebernahme(file, { positionen, aktion: 'nehmen', person: benutzer, actor, jetzt: now() });
            audit({ actor, action: 'bestell-vorbereitung', anzahl: positionen.length });
          }
        } catch (e) {
          if (e instanceof BeschaffungFehler) throw new ApiError(e.status, e.message);
          throw e;
        }
        return { ...vorlage, mails, vorbereitungStand: stand };
      }
      // Erst den neuesten Shopify-Stand uebernehmen, dann die Aenderung darauf anwenden.
      shopifyAbgleichen();
      // Bis zu den lokalen Writes kein await: Vorpruefung und Uebernahmesperre werden
      // im selben JS-Schritt frisch gelesen; asynchron bleibt nur die bestehende Versandbuchung.
      const { orderId, lineItemId, status, lieferantBestellnummer, notiz, aktion } = payload || {};
      if (aktion === 'kettelversand') {
        const dir=privatDirPath || privatDir(), k=this._lieferantenKontext();
        try {
          aendereKettelversand(dir,{...payload,aktion:payload.kettelAktion},{auftrag:k.modell?.auftraege.find(a=>a.id===orderId),statusAlle:k.statusAlle,actor,tarif:kettelTarife(path.join(dir,'versandkosten','tarife.json')).tarif,abholPlz:k.stammdaten.absender?.kettelservice?.plz,jetzt:now()});
          merke(benutzer,actor,'Kettler / Packstück',payload.kettelAktion);
          return {ok:true,...this.einkaufKettelversand({orderId})};
        } catch(e) {throw new ApiError(409,e.message);}
      }
      // Ware ueber unseren Kettelservice bzw. Muster direkt vom Lieferanten zum Kunden: nur diese
      // Werte, alles andere nimmt den Vermerk zurueck.
      const ueber = payload?.ueber === undefined ? undefined : UEBER_WERTE.includes(payload.ueber) ? payload.ueber : null;
      if (aktion === 'beschaffung' || aktion === 'uebernahme') {
        const dir = privatDirPath || privatDir();
        const modell = ladeBestellModell(dir);
        if (!modell) throw new ApiError(409, 'Die Bestelldaten sind nicht lesbar. Es wurde nichts verändert.');
        const allePositionen = [...(modell.auftraege || []), ...(modell.testauftraege || [])].flatMap(a => a.positionen || []);
        const ziele = aktion === 'beschaffung' ? [{ orderId, lineItemId }] : payload.positionen;
        if (!Array.isArray(ziele) || !ziele.length || ziele.length > 200 || ziele.some(p => !p || typeof p !== 'object' || !p.orderId || !p.lineItemId || !allePositionen.some(z => String(z.orderId) === String(p.orderId) && String(z.lineItemId) === String(p.lineItemId)))) throw new ApiError(400, 'Die ausgewählte Position gehört nicht zu den vorliegenden Bestellungen.');
        try {
          const file = auftragsstatusPfad(dir);
          if (aktion === 'uebernahme') {
            const eintraege = arbeitsuebernahme(file, { positionen: ziele, aktion: payload.uebernahmeAktion, person: benutzer, actor, jetzt: now() });
            audit({ actor, action: 'einkauf-uebernahme', aktion: payload.uebernahmeAktion, anzahl: Object.keys(eintraege).length });
            merke(benutzer, actor, payload.uebernahmeAktion === 'freigeben' ? 'Einkaufsarbeit freigegeben' : 'Einkaufsarbeit übernommen', `${Object.keys(eintraege).length} Positionen`);
            return { ok: true, eintraege };
          }
          const p = allePositionen.find(z => String(z.orderId) === String(orderId) && String(z.lineItemId) === String(lineItemId));
          const menge = p.bestellSoll || p.bestellmenge;
          const eintrag = bestaetigeBeschaffung(file, { orderId, lineItemId, felder: payload.felder, soll: menge?.menge, einheit: menge?.einheit, actor, jetzt: now() });
          audit({ actor, action: 'beschaffung-bestaetigt', orderId, lineItemId });
          merke(benutzer, actor, 'Liefertermin / Wareneingang bestätigt', `${p.orderName} · ${p.titel}`);
          return { ok: true, eintrag };
        } catch (e) {
          if (e instanceof BeschaffungFehler) throw new ApiError(e.status, e.message);
          throw e;
        }
      }
      // Zeitleiste: ein Schritt fuer den ganzen Auftrag (alle Positionen bzw. ein Ereignis je Auftrag).
      // Additiv - ohne `aktion` verhaelt sich der Endpunkt exakt wie bisher.
      if (aktion === 'schritt') return auftragsSchrittSetzen(payload, benutzer, actor);
      if (aktion === 'versandNachholen') return versandNachholen(payload, benutzer, actor);
      if (aktion === 'shopifyNachbuchen') return shopifyNachbuchen(payload, benutzer, actor);
      if (aktion === 'zurueckAufOffen') return zurueckAufOffen(payload, benutzer, actor);
      if (aktion === 'musterHerkunft') return musterHerkunftSetzen(payload, benutzer, actor);
      if (!orderId || !lineItemId) throw new ApiError(400, 'orderId und lineItemId sind Pflicht', { missing: ['orderId', 'lineItemId'] });
      // "Wieder öffnen" macht einen Abschluss rueckgaengig (z. B. versehentlich "Ohne Einkauf
      // abschliessen"). Eigener Weg statt eines Pseudo-Status, damit der Abschluss im Verlauf
      // der Position erhalten bleibt statt ueberschrieben zu werden.
      if (aktion === 'wiederOeffnen') {
        const file = auftragsstatusPfad(privatDirPath || privatDir());
        let eintrag;
        try {
          eintrag = oeffneWieder(file, { orderId, lineItemId, actor, notiz, jetzt: now() });
        } catch (e) {
          if (e instanceof AuftragsstatusFehler) throw new ApiError(400, e.message);
          throw e;
        }
        audit({ actor, action: 'auftragsstatus-wieder-geoeffnet', orderId, lineItemId, status: eintrag.status });
        merke(benutzer, actor, 'Auftragsstatus wieder geöffnet', `${orderId}/${lineItemId}: ${eintrag.status || 'noch nicht bestellt'}`);
        return { ok: true, eintrag };
      }
      if (aktion) throw new ApiError(400, `Unbekannte Aktion „${aktion}"`);
      if (!STATUS_ORDER.includes(status)) throw new ApiError(400, `Unbekannter Status „${status}"`, { missing: [`Status muss einer von ${STATUS_ORDER.join(', ')} sein`] });
      const dir = privatDirPath || privatDir();
      const file = auftragsstatusPfad(dir);
      // Stand vor dem Wechsel: danach hat die Position einen Status und gilt nicht mehr als offen.
      const vorLager = status === 'raus' ? auftragFuerLager(dir, orderId) : null;
      const angaben = versandAngaben(payload?.versand);
      const modell = ladeBestellModell(dir);
      if (status === 'raus') pruefeSendungFrei({ dir, orderId, angaben, roh: payload?.versand, modell, benutzer, actor });
      const p = [...(modell?.auftraege || []), ...(modell?.testauftraege || [])].flatMap(a => a.positionen || []).find(p => p.orderId === orderId && p.lineItemId === lineItemId);
      const vorher = leseAktuellenStatus(file, modell)[positionKey(orderId, lineItemId)];
      let eintrag;
      try {
        eintrag = setzeStatus(file, { orderId, lineItemId, status, actor, bestellmenge: p?.bestellSoll || p?.bestellmenge || null, lieferantBestellnummer, notiz, ueber, jetzt: now(),
          ...(status === 'raus' ? { sendungsnummer: angaben.sendungsnummer, versanddienst: angaben.versanddienst, versandMail: angaben.benachrichtigen } : {}) });
      } catch (e) {
        if (e instanceof AuftragsstatusFehler) throw new ApiError(e.status, e.message);
        throw e;
      }
      if (vorLager) lagerAbgangFestschreiben(dir, vorLager, [lineItemId], actor);
      audit({ actor, action: 'auftragsstatus', orderId, lineItemId, status });
      merke(benutzer, actor, 'Auftragsstatus', `${orderId}/${lineItemId}: ${status}`);
      // "raus" ueber diesen Einzelweg bucht NICHT sofort: wer Positionen einzeln in einer Schleife
      // setzt, erzeugte sonst je Artikel eine Buchung und eine Versandmail. Die Oberflaeche nimmt den
      // Versand-Dialog (aktion "schritt"); hier steht nur der Vermerk "ausstehend", und
      // "In Shopify buchen" bucht alle wartenden Artikel der Bestellung als ein Paket.
      if (status === 'raus' && STATUS_ORDER.indexOf(vorher?.status) < STATUS_ORDER.indexOf('raus')) {
        eintrag = vermerkeShopifyVersand(file, { orderId, lineItemId, vermerk: { status: 'ausstehend', grund: 'ohne-dialog', am: now().toISOString(),
          meldung: 'Noch nicht in Shopify gebucht – „In Shopify buchen“ bucht alle wartenden Artikel dieser Bestellung als ein Paket.' } }) || eintrag;
        return { ok: true, eintrag, shopify: { status: 'ausstehend', meldung: eintrag.shopifyVersand?.meldung || null, gebucht: 0, bereits: 0, nichtGebucht: 1 } };
      }
      // "Erledigt" bucht in Shopify, wenn dort noch offen - ohne Mail, deshalb auch je Artikel unbedenklich.
      if (status === 'erledigt' && vorher?.status !== 'erledigt') {
        const shopifyErgebnis = await erledigtBuchen({ dir, auftrag: auftragFuerVersand(dir, String(orderId)), lineItemIds: [lineItemId], benutzer, actor });
        if (shopifyErgebnis) return { ok: true, eintrag: leseAuftragsstatus(file)[positionKey(orderId, lineItemId)] || eintrag, shopify: shopifyErgebnis };
      }
      return { ok: true, eintrag };
    },

    /**
     * Musterlager: was wir an Mustern selbst da haben, wo es liegt, welche offenen
     * Musterbestellungen daraus bedient werden - und Vorschlaege, was einzulagern lohnt
     * (eingetroffene Probestuecke, mehrfach gefragte Farben). Kundennamen nur zur Anzeige.
     */
    einkaufMusterlager() {
      const dir = privatDirPath || privatDir();
      let lager;
      try { lager = leseLager(musterlagerPfad(dir)); } catch (e) {
        return { verfuegbar: false, fehler: true, hinweis: e.message };
      }
      const modell = ladeBestellModell(dir);
      const stand = modell?.musterlagerStand || new Map();
      let statusAlle = {};
      try { statusAlle = leseAuftragsstatus(auftragsstatusPfad(dir)); } catch { /* Vorschlaege dann ohne "eingetroffen" */ }
      const kunde = a => (a.details?.kunde?.name && a.details.kunde.name !== '–' ? a.details.kunde.name : null);
      const offen = new Map();
      for (const a of modell?.auftraege ?? []) {
        for (const p of a.positionen ?? []) {
          if (p.musterHerkunftQuelle !== 'lager' || !p.musterLager?.id) continue;
          if (!offen.has(p.musterLager.id)) offen.set(p.musterLager.id, []);
          // Gemischte Bestellung: das Lagermuster wartet, bis die Lieferanten-Muster da sind.
          offen.get(p.musterLager.id).push({ orderId: a.id, orderName: a.name, kunde: kunde(a), wartetAufLieferant: lagerWartetAufLieferant(a, statusAlle) });
        }
      }
      const gruppen = new Map(this._lexikonProdukte().map(x => [x.handle, x.produktgruppe || null]));
      const { index: acIndex, jeSku } = this._resteIndex();
      return {
        verfuegbar: true,
        arten: LAGER_ARTEN,
        zaehlbar: LAGER_ZAEHLBAR,
        musterGroesse: MUSTER_GROESSE,
        knappAb: LAGER_KNAPP_AB,
        probestueckPreis: PROBESTUECK_PREIS,
        bestellungenStand: modell?.erstellt || null,
        eintraege: lager.eintraege.map(e => ({
          id: e.id, titel: e.titel, farbe: e.farbe, handle: e.handle, art: e.art, artLabel: LAGER_ARTEN[e.art], anzahl: e.anzahl ?? null,
          ort: e.ort, notiz: e.notiz, leer: !!e.leer, angelegtAm: e.angelegtAm, angelegtVon: e.angelegtVon, geaendertAm: e.geaendertAm, geaendertVon: e.geaendertVon,
          stand: stand.get(e.id) || { verbraucht: 0, reserviert: 0, rest: null, reichtNoch: null, jeStueck: null },
          offeneBestellungen: offen.get(e.id) || [],
          verlauf: (e.verlauf || []).slice(-5),
        })),
        vorschlaege: modell ? lagerVorschlaege(modell, {
          lager, statusAlle, produktgruppe: h => gruppen.get(h) ?? null, jetzt: now(),
          acTreffer: p => { const v = jeSku.get(String(p.sku ?? '').trim().toUpperCase()); return v ? resteAcTreffer(acIndex, v) : []; },
        }) : [],
        reste: { gruppen: RESTE_GRUPPEN, lieferanten: RESTE_LIEFERANTEN },
        // Im Shop gesperrte Muster ("Muster nicht verfuegbar") - eine beschaedigte Ablage meldet nur diesen Block.
        sperren: sperrenListe(dir),
      };
    },

    /** Sperren allein (GET /api/einkauf/mustersperre). */
    einkaufMustersperre() {
      return { verfuegbar: true, ...sperrenListe(privatDirPath || privatDir()) };
    },

    /**
     * Mustersperre schreiben: "freigeben" (Wieder verfuegbar - Stand vor der Sperre im Shop
     * zurueck) oder "nachholen" (eine noch nicht im Shop stehende Sperre erneut versuchen).
     * Beides nur anhaengen, protokolliert.
     */
    async einkaufMustersperreSetzen(payload = {}, benutzer = null) {
      const actor = benutzer?.name || await currentUser();
      if (!actor) throw new ApiError(403, 'gh ist nicht angemeldet – keine Schreibaktion möglich');
      const dir = privatDirPath || privatDir();
      const file = mustersperrePfad(dir);
      const { aktion } = payload || {};
      const sku = String(payload?.sku ?? '').trim().toUpperCase();
      if (!sku) throw new ApiError(400, 'sku ist Pflicht', { missing: ['sku'] });
      if (!['freigeben', 'nachholen'].includes(aktion)) throw new ApiError(400, `Unbekannte Aktion „${aktion}"`);
      let aktiv;
      try { aktiv = sperrStand(leseSperren(file)); } catch (e) { throw new ApiError(e.status || 500, e.message); }
      const s = aktiv.get(sku);
      if (!s) throw new ApiError(409, 'Dieses Muster ist nicht (mehr) gesperrt – bitte neu laden.');
      const info = { farbe: s.farbe, produkt: s.produkt, handle: s.handle };
      const name = [s.produkt, s.farbe].filter(Boolean).join(' · ') || sku;
      if (aktion === 'nachholen') {
        if (s.imShop) throw new ApiError(409, 'Dieses Muster ist im Shop schon gesperrt.');
        const zugang = await sperrZugang();
        const letzter = s.auftraege.at(-1) || {};
        const ev = await sperreEine({ dir, sku, info, orderId: letzter.orderId || null, orderName: letzter.orderName || null, zugang, actor });
        if (!ev?.shopify?.geschrieben) throw new ApiError(502, ev?.shopify?.fehler || 'Im Shop nicht gesperrt.');
        merke(benutzer, actor, 'Muster im Shop gesperrt', `${name} (nachgeholt)`);
        return { ok: true, meldung: ev.shopify.bereits ? `${name}: war im Shop schon gesperrt` : `${name}: im Shop gesperrt` };
      }
      // freigeben
      return nacheinander(`mustersperre:${sku}`, async () => {
        // Ein vorher wartender Sperr-/Freigabeversuch kann den persistierten Stand geaendert haben.
        const s = sperrStand(leseSperren(file)).get(sku);
        if (!s) throw new ApiError(409, 'Dieses Muster ist nicht (mehr) gesperrt – bitte neu laden.');
        const info = { farbe: s.farbe, produkt: s.produkt, handle: s.handle };
        const name = [s.produkt, s.farbe].filter(Boolean).join(' · ') || sku;
        let sh = { geschrieben: false };
        if (s.shopPruefen) {
          const zugang = await sperrZugang();
          if (zugang.hindernis) throw new ApiError(503, zugang.hindernis.fehler.replace('Im Shop nicht gesperrt', 'Im Shop nicht freigegeben').replace('die Variante über den Link in Shopify sperren', 'die Variante über den Link in Shopify freigeben'));
          try {
            // Jede gesperrte Mustervariante bekommt ihren eigenen Vorstand zurueck (Teppichboden- und Nach-Mass-Muster).
            const r = await freigebenImShop(zugang.proxy, { sku, vorher: s.vorher, varianten: s.varianten, vorherUnklar: s.vorherUnklar });
            sh = { geschrieben: true, bereits: r.status === 'bereits', variantId: r.variantId, productId: r.productId, nachher: r.nachher, verfuegbar: r.verfuegbar, varianten: r.varianten };
          } catch (e) {
            const meldung = e instanceof MustersperreFehler ? e.message : `Ob das Muster wieder freigegeben ist, ist unklar (${String(e?.message || e).split('\n')[0].slice(0, 160)}).`;
            sperreAnhaengen(file, [sperrEreignis({ sku, ...info, von: actor, grund: SPERR_GRUND.FREI, shopify: { geschrieben: false, fehler: meldung, fehlerGrund: e?.grund || 'unklar' }, jetzt: now() })]);
            audit({ actor, action: 'mustersperre-frei', sku, geschrieben: false });
            logFehler('mustersperre', `${sku} freigeben: ${meldung}`);
            throw new ApiError(502, meldung);
          }
        }
        sperreAnhaengen(file, [sperrEreignis({ sku, ...info, von: actor, grund: SPERR_GRUND.FREI, shopify: sh, jetzt: now() })]);
        audit({ actor, action: 'mustersperre-frei', sku, geschrieben: sh.geschrieben });
        merke(benutzer, actor, 'Muster wieder verfügbar', `${name}${s.shopPruefen ? ' · im Shop freigegeben' : ' · war im Shop nicht gesperrt'}`);
        return { ok: true, meldung: s.shopPruefen ? `${name}: im Shop wieder bestellbar` : `${name}: aus der Liste genommen` };
      });
    },


    /**
     * Verlegereste (Regel 2026-10-21): fuehrt Lieferant A oder C diese Ware? Fuer Bestellungen
     * direkt beim Hersteller oder anderswo, die nicht ueber den Shop laufen. Nur lesend.
     */
    einkaufResteAbgleich({ hersteller = '', qualitaet = '', farbnummer = '' } = {}) {
      const kurz = v => String(v ?? '').trim().slice(0, 120);
      const q = { hersteller: kurz(hersteller), qualitaet: kurz(qualitaet), farbnummer: kurz(farbnummer) };
      if (!q.hersteller && !q.qualitaet) throw new ApiError(400, 'Hersteller oder Qualität angeben', { missing: ['hersteller', 'qualitaet'] });
      const { index } = this._resteIndex();
      if (!index.length) return { verfuegbar: false, hinweis: 'Lexikon nicht geladen – „Aktualisieren“ ausführen.' };
      let imLager = new Set();
      try { imLager = new Set(leseLager(musterlagerPfad(privatDirPath || privatDir())).eintraege.filter(e => !e.leer).flatMap(e => e.schluessel)); } catch { /* ohne Kennzeichen */ }
      const treffer = resteSucheBeiAC(index, q).map(t => ({
        ...t, titel: lagerKurzTitel(t.titel),
        farben: t.farben.map(f => ({ ...f, imLager: imLager.has(f.sku) })),
      }));
      return { verfuegbar: true, frage: q, treffer };
    },

    /** Suchindex fuer den Reste-Abgleich, neu nur wenn sich der Lexikon-Export aendert. */
    _resteIndex() {
      const produkte = this._lexikonProdukte();
      if (this._resteCache?.produkte !== produkte) {
        const jeSku = new Map();
        for (const p of produkte) for (const v of p.varianten || []) if (v?.sku) jeSku.set(String(v.sku).trim().toUpperCase(), v);
        this._resteCache = { produkte, index: resteIndex(produkte), jeSku };
      }
      return this._resteCache;
    },

    /** Farben eines Lexikon-Produkts zum Einlagern, mit Kennzeichen "schon im Lager". */
    einkaufMusterlagerFarben({ handle = '' } = {}) {
      const dir = privatDirPath || privatDir();
      const ziel = this._musterlagerProdukt(handle);
      if (!ziel) return { verfuegbar: false, hinweis: 'Produkt nicht im Lexikon gefunden – Lexikon aktualisieren oder anders suchen.' };
      let imLager = new Set();
      try { imLager = new Set(leseLager(musterlagerPfad(dir)).eintraege.filter(e => !e.leer).flatMap(e => e.schluessel)); } catch { /* Lager kaputt: nur ohne Kennzeichen */ }
      return {
        verfuegbar: true, handle: ziel.produkt.handle, titel: lagerKurzTitel(ziel.produkt.titel), produktgruppe: ziel.produkt.produktgruppe || null,
        bild: ziel.produkt.bild || null,
        farben: ziel.farben.map(f => ({ ...f, imLager: f.schluessel.some(k => imLager.has(k)) })),
      };
    },

    /** Lexikon-Produkt samt Musterprodukt und Farben; auch wenn das Musterprodukt selbst gewaehlt wurde. */
    _musterlagerProdukt(handle) {
      const h = String(handle || '').trim();
      if (!h) return null;
      const produkte = this._lexikonProdukte();
      const je = new Map(produkte.map(x => [x.handle, x]));
      const gewaehlt = je.get(h);
      if (!gewaehlt) return null;
      // Gewaehlt werden kann das Produkt oder sein Musterprodukt (muster-<handle>) - beide zaehlen.
      const istMuster = h.startsWith('muster-');
      const original = istMuster ? je.get(h.slice(7)) || null : gewaehlt;
      const muster = istMuster ? gewaehlt : (gewaehlt.muster?.handle ? je.get(gewaehlt.muster.handle) || null : null);
      return { produkt: original || gewaehlt, muster, farben: lagerFarbenFuer(original, muster) };
    },

    /**
     * Musterlager schreiben: einlagern (aus dem Lexikon: handle + farben, oder aus einem
     * Vorschlag: schluessel + titel + farbe), aendern (Platz, Anzahl, Art, Notiz, leer),
     * entfernen. Nur lokal, Shopify wird nie geschrieben.
     */
    async einkaufMusterlagerSetzen(payload = {}, benutzer = null) {
      const actor = benutzer?.name || await currentUser();
      if (!actor) throw new ApiError(403, 'gh ist nicht angemeldet – keine Schreibaktion möglich');
      const dir = privatDirPath || privatDir();
      const file = musterlagerPfad(dir);
      const { aktion } = payload || {};
      try {
        if (aktion === 'einlagern') {
          const { handle, farben, schluessel, titel, farbe, art, anzahl, ort, notiz } = payload;
          let ziele;
          if (handle && Array.isArray(farben) && farben.length) {
            const z = this._musterlagerProdukt(handle);
            if (!z) throw new ApiError(404, 'Produkt nicht im Lexikon gefunden – Lexikon aktualisieren oder anders suchen.');
            const gesucht = new Set(farben.map(f => String(f)));
            ziele = z.farben.filter(f => gesucht.has(f.farbe)).map(f => ({ titel: lagerKurzTitel(z.produkt.titel), farbe: f.farbe, handle: z.produkt.handle, schluessel: f.schluessel }));
            const fehlen = [...gesucht].filter(f => !ziele.some(x => x.farbe === f));
            if (fehlen.length) throw new ApiError(400, `Für ${fehlen.join(', ')} fehlt die Artikelnummer – im Lexikon prüfen.`);
          } else if (Array.isArray(schluessel) && schluessel.length) {
            ziele = [{ titel, farbe, handle: handle || null, schluessel }];
          } else throw new ApiError(400, 'Produkt und Farbe wählen', { missing: ['handle', 'farben'] });
          if (ziele.length > 60) throw new ApiError(400, 'Höchstens 60 Farben auf einmal');
          const ergebnisse = ziele.map(z => lagerEinlagern(file, { ...z, art, anzahl, ort, notiz, actor, jetzt: now() }));
          audit({ actor, action: 'musterlager-einlagern', anzahl: ergebnisse.length });
          merke(benutzer, actor, 'Musterlager', `eingelagert: ${ziele.map(z => [z.titel, z.farbe].filter(Boolean).join(' ')).slice(0, 5).join(', ')}${ziele.length > 5 ? ' …' : ''}`);
          return { ok: true, anzahl: ergebnisse.length, neu: ergebnisse.filter(r => r.neu).length, eintraege: ergebnisse.map(r => r.eintrag) };
        }
        if (aktion === 'aendern') {
          const { id } = payload;
          const felder = {};
          for (const k of ['art', 'anzahl', 'ort', 'notiz', 'leer']) if (k in payload) felder[k] = payload[k];
          const e = lagerAendern(file, String(id || ''), felder, { actor, jetzt: now() });
          audit({ actor, action: 'musterlager-aendern', id: e.id, felder: Object.keys(felder) });
          merke(benutzer, actor, 'Musterlager', `${[e.titel, e.farbe].filter(Boolean).join(' ')}: ${e.verlauf?.at(-1)?.was || 'geändert'}`);
          return { ok: true, eintrag: e };
        }
        if (aktion === 'entfernen') {
          const e = lagerEntfernen(file, String(payload.id || ''), { actor, jetzt: now() });
          audit({ actor, action: 'musterlager-entfernen', id: e.id });
          merke(benutzer, actor, 'Musterlager', `entfernt: ${[e.titel, e.farbe].filter(Boolean).join(' ')}`);
          return { ok: true, id: e.id };
        }
        throw new ApiError(400, `Unbekannte Aktion „${aktion}"`);
      } catch (e) {
        if (e instanceof MusterlagerFehler) throw new ApiError(400, e.message);
        throw e;
      }
    },

    /** Offene Klaerungsfaelle des Einkaufs, falls das Team sie bereits exportiert hat. */
    einkaufKlaerung() {
      const dir = privatDirPath || privatDir();
      const basis = path.join(dir, 'einkauf-klaerung');
      const klaerung = readJsonIfExists(path.join(basis, 'klaerung.json'));
      const offen = readJsonIfExists(path.join(basis, 'offen.json'));
      if (!klaerung && !offen) return { verfuegbar: false, quelle: basis, hinweis: 'Noch keine Klaerungsdaten exportiert (klaerung.json/offen.json fehlen).' };
      return { verfuegbar: true, quelle: basis, klaerung: klaerung || null, offen: offen || null };
    },

    /**
     * Shop-Kennzahlen der letzten 7/30 Tage fuer die Startseite "Heute".
     *
     * Erwartetes Format (noch kein Export vorhanden - siehe
     * docs/control-center/ARCHITEKTUR.md, Abschnitt 9):
     *   { erstellt, zeitraeume: { "7": {bestellungen, umsatz, waehrung, durchschnitt}, "30": {...} }, topProdukte: [...] }
     * Fehlt die Datei, liefert diese Funktion nur den Hinweis samt Befehl,
     * der den Export erzeugen wuerde - keine erfundenen Zahlen.
     */
    einkaufKennzahlen() {
      const dir = privatDirPath || privatDir();
      const file = path.join(dir, 'kennzahlen', 'shop-snapshot.json');
      const daten = readJsonIfExists(file);
      if (!daten || !daten.zeitraeume) {
        return {
          verfuegbar: false,
          quelle: file,
          hinweis: 'Noch kein Export der Shop-Kennzahlen vorhanden.',
          befehl: 'npm run kennzahlen:export -- --ziel ' + file,
        };
      }
      return { verfuegbar: true, quelle: file, erstellt: daten.erstellt || null, zeitraeume: daten.zeitraeume, topProdukte: daten.topProdukte || [] };
    },

    /**
     * Lexikon: "Kunde nennt den Produktnamen, wir finden das Original beim
     * Lieferanten" - Nachschlagewerk fuer den Kundenkontakt. Liest
     * ausschliesslich die lokale Exportdatei ($TP_PRIVAT_DIR/lexikon/produkte.json,
     * siehe domains/lexikon/ fuer das Format), nie im Repository. Suche und
     * Paginierung laufen serverseitig, damit die potenziell grosse Datei nie
     * komplett an den Browser geht.
     */
    lexikonDruckliste() {
      try { return leseMusterDruckliste({ privatDir: privatDirPath || privatDir() }); }
      catch (e) {
        if (e instanceof MusterDrucklisteFehler) throw new ApiError(e.status, e.message);
        throw e;
      }
    },

    /** Gemeinsame Vormerkung: Etikettdaten kommen immer aus dem privaten Lexikon. */
    async lexikonDrucklisteSetzen(payload = {}, benutzer = null) {
      if (benutzer?.rolle === 'lesen') throw new ApiError(403, 'Rolle „lesen“ darf die Druckliste nicht ändern.');
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new ApiError(400, 'Drucklisten-Aktion fehlt.');
      const actor = benutzer?.name || await currentUser();
      if (!actor) throw new ApiError(403, 'Bitte anmelden – wer die Druckliste ändert, wird festgehalten.');
      const { aktion, vorgangId, eintraege, druckauftragId, entfernenIds } = payload;
      let eintrag;
      if (aktion === 'vormerken') {
        const produkte = this._lexikonProdukte();
        const je = new Map(produkte.map(p => [p.handle, p]));
        const produkt = je.get(payload.handle);
        if (!produkt) throw new ApiError(404, 'Produkt nicht im Lexikon gefunden. Bitte neu suchen.');
        const auswahl = etikettenAusLexikon(produkt, je).find(e => e.key === payload.key);
        if (!auswahl) throw new ApiError(409, 'Die Ausführung hat sich geändert. Produkt bitte neu öffnen.');
        if (auswahl.etikett.fehlt.length) throw new ApiError(400, `Etikett unvollständig: ${auswahl.etikett.fehlt.join(', ')}. Bitte Produktdaten prüfen.`);
        eintrag = { id: vorgangId, produktHandle: produkt.handle, produktTitel: produkt.titel, bezeichnung: auswahl.bezeichnung, etikett: auswahl.etikett, anzahl: payload.anzahl };
      } else if (!['reservieren', 'freigeben', 'erledigen', 'entfernen', 'auftrag_entfernen'].includes(aktion)) {
        throw new ApiError(400, 'Unbekannte Drucklisten-Aktion.');
      }
      if (aktion === 'reservieren' && Array.isArray(eintraege)) {
        // Dieselbe UUID-Normalisierung wie die Ablage, damit kein gueltiger Verweis die Quellenpruefung umgeht.
        const gewaehlt = new Set(eintraege.map(e => typeof e?.id === 'string' ? e.id.toLowerCase() : null));
        const plaene = new Map();
        for (const e of this.lexikonDruckliste().eintraege.filter(e => gewaehlt.has(e.id) && e.quelle)) {
          const id = e.quelle.orderId;
          if (!plaene.has(id)) plaene.set(id, this.kundenMusteretiketten(id));
          const plan = plaene.get(id), zeile = plan.zeilen.find(z => z.lineItemId === e.quelle.lineItemId);
          if (plan.gesperrt || !zeile || zeile.anzahl === 0 || zeile.fehlt.length || zeile.vormerkstatus === 'geaendert') {
            throw new ApiError(409, 'Eine zugehörige Musterbestellung ist geändert, versendet oder storniert. Bitte die Bestellung und Druckliste vor dem Druck prüfen.');
          }
        }
      }
      try {
        return aendereMusterDruckliste({ privatDir: privatDirPath || privatDir(), aktion: aktion === 'vormerken' ? 'hinzufuegen' : aktion, vorgangId, eintraege, druckauftragId, entfernenIds, eintrag, actor, now: now() });
      } catch (e) {
        if (e instanceof MusterDrucklisteFehler) throw new ApiError(e.status, e.message);
        throw e;
      }
    },

    /** Aktueller Katalogcheck, ohne Ablage, Druckliste oder Shopify zu veraendern. */
    lexikonEtikettenStatus({ q = '', status = 'pruefen', page = 1 } = {}) {
      const file = path.join(privatDirPath || privatDir(), 'lexikon', 'produkte.json');
      const daten = readJsonGecacht(file);
      if (!daten || !Array.isArray(daten.produkte)) return { verfuegbar: false, fehler: true,
        hinweis: leseFehler(file) || 'Der Lexikonbestand fehlt. Bitte die Produktdaten aktualisieren.' };
      const stand = musterEtikettenStatus(daten);
      const suchtext = String(q || '').trim().toLocaleLowerCase('de');
      const filter = ['alle', 'bereit', 'pruefen', 'datenstand'].includes(status) ? status : 'pruefen';
      const zeilen = stand.zeilen.filter(z => (filter === 'alle' || z.status === filter || (filter === 'pruefen' && z.status === 'datenstand'))
        && (!suchtext || [z.titel, z.handle, ...z.etiketten.map(e => e.bezeichnung)].join(' ').toLocaleLowerCase('de').includes(suchtext)));
      const pageSize = 20, pages = Math.max(1, Math.ceil(zeilen.length / pageSize));
      const seite = Math.min(pages, Math.max(1, Math.floor(Number(page) || 1)));
      return { verfuegbar: true, intern: true, erstellt: stand.erstellt, zaehler: stand.zaehler,
        vollstaendig: stand.vollstaendig, treffer: { count: zeilen.length, page: seite, pages,
          items: zeilen.slice((seite - 1) * pageSize, seite * pageSize) } };
    },

    lexikonListe({ q = '', page = 1, pageSize = 20 } = {}) {
      const dir = privatDirPath || privatDir();
      const file = path.join(dir, 'lexikon', 'produkte.json');
      const daten = readJsonGecacht(file);
      if (!daten || !Array.isArray(daten.produkte)) {
        const kaputt = leseFehler(file);
        return {
          verfuegbar: false, quelle: file, fehler: Boolean(kaputt),
          hinweis: kaputt || 'Noch keine Lexikon-Daten exportiert.',
          befehl: 'npm run lexikon:export',
        };
      }
      const begriffe = suchbegriffe(q);
      const passendJe = new Map();
      const treffer = begriffe.length
        ? daten.produkte.filter(p => {
          const t = lexikonTreffer(p, begriffe);
          if (t.passt) passendJe.set(p, t.varianten);
          return t.passt;
        })
        : daten.produkte;
      const size = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
      const p = Math.max(Number(page) || 1, 1);
      const start = (p - 1) * size;
      // Je Treffer: in wie vielen offenen Bestellungen steckt das Produkt? (Ware und Muster getrennt)
      const offenMap = offeneBestellungenMap(dir);
      const seite = treffer.slice(start, start + size).map(prod => {
        const offen = offeneZuProdukt(offenMap, prod);
        const anzahl = liste => new Set(liste.map(o => o.orderId)).size;
        return {
          ...lexikonListenEintrag(prod), ...lexikonSuchHinweis(prod, passendJe.get(prod) || [], begriffe),
          offeneBestellungen: anzahl(offen.filter(o => !o.istMuster)), offeneMuster: anzahl(offen.filter(o => o.istMuster)),
        };
      });
      return {
        verfuegbar: true, quelle: file, erstellt: daten.erstellt || null, anzahl: daten.anzahl ?? daten.produkte.length,
        treffer: { count: treffer.length, page: p, pageSize: size, pages: Math.max(Math.ceil(treffer.length / size), 1), items: seite },
      };
    },

    /**
     * Mengenhilfe fuer den Bestellblock: Kundenmenge -> Bestellmenge beim
     * Lieferanten. Nutzt ausschliesslich operations/lib/umrechnung.mjs (keine
     * neuen Rechenregeln) - laesst sich die Bestelleinheit einer Variante
     * nicht sicher zuordnen oder fehlt eine noetige Produktangabe
     * (Rollenbreite, m² pro Paket), kommt ein ehrlicher UNGEKLAERT-Hinweis
     * statt einer geschaetzten Zahl.
     */
    lexikonMengenhilfe({ handle, variantenId, kundenmengeM2, kundenlaengeCm } = {}) {
      const dir = privatDirPath || privatDir();
      const file = path.join(dir, 'lexikon', 'produkte.json');
      const daten = readJsonGecacht(file);
      if (!daten || !Array.isArray(daten.produkte)) {
        const kaputt = leseFehler(file);
        return {
          verfuegbar: false, quelle: file, fehler: Boolean(kaputt),
          hinweis: kaputt || 'Noch keine Lexikon-Daten exportiert.',
          befehl: 'npm run lexikon:export',
        };
      }
      const produkt = daten.produkte.find(p => p.handle === handle);
      if (!produkt) return { verfuegbar: false, hinweis: `Kein Produkt mit Handle "${handle}" im Lexikon.` };
      const variante = (produkt.varianten || []).find(v => v.id === variantenId) || (produkt.varianten || [])[0];
      if (!variante) return { verfuegbar: false, hinweis: 'Keine Variante gefunden.' };
      const einheit = variante.einkauf?.bestelleinheit;
      const flaeche = Number(String(kundenmengeM2 ?? '').replace(',', '.'));
      const laenge = Number(String(kundenlaengeCm ?? '').replace(',', '.'));

      // m²-Ware ohne Paket (Teppich nach Mass direkt vom Hersteller): bestellt
      // wird die Flaeche selbst, auf 0,01 m² aufgerundet.
      if (einheit === 'm2' && !produkt.eigenschaften?.qmProPaket) {
        if (!(flaeche > 0)) return { verfuegbar: true, ergebnis: null, grund: 'Kundenmenge (m²) eingeben' };
        const m2 = Math.ceil(flaeche * 100 - 1e-9) / 100;
        return { verfuegbar: true, ergebnis: { text: `${m2.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`, m2 } };
      }
      if (einheit === 'paket' || einheit === 'm2') {
        const qm = produkt.eigenschaften?.qmProPaket;
        if (!qm) return { verfuegbar: true, ergebnis: null, grund: 'Bestellmenge ungeklaert - m² pro Paket ist am Produkt nicht hinterlegt' };
        if (!(flaeche > 0)) return { verfuegbar: true, ergebnis: null, grund: 'Kundenmenge (m²) eingeben' };
        try {
          const r = paketware({ bedarfM2: flaeche, qmProPaket: qm });
          return { verfuegbar: true, ergebnis: { text: `${r.pakete} Paket${r.pakete === 1 ? '' : 'e'} (${formatDe(r.qmGesamt)} m² gesamt)`, ...r } };
        } catch (e) { return { verfuegbar: true, ergebnis: null, grund: String(e.message) }; }
      }
      if (einheit === 'rolle' || einheit === 'lfm') {
        // Letzter Weg wie im Einkauf (resolve.mjs): "80 cm breit (je lfm)" im Variantentitel.
        const breiteM = rollenbreiteInMetern(variante.rollenbreiteM ?? produkt.eigenschaften?.rollenbreite ?? ausVariantentitel(variante.titel).variantBreiteCm);
        if (!breiteM && produkt.produktgruppe === 'Teppich nach Maß') {
          return { verfuegbar: true, ergebnis: null, grund: 'Teppich nach Maß: die Rolle ergibt sich aus den Maßen der Bestellung – die Bestellmenge rechnet der Einkauf dort aus.' };
        }
        if (!breiteM) return { verfuegbar: true, ergebnis: null, grund: 'Bestellmenge ungeklaert - Rollenbreite ist am Produkt nicht hinterlegt' };
        if (!(flaeche > 0) && !(laenge > 0)) return { verfuegbar: true, ergebnis: null, grund: 'Kundenmenge (m² oder Länge in cm) eingeben' };
        try {
          const r = rollenware({ flaecheM2: flaeche > 0 ? flaeche : undefined, laengeCm: laenge > 0 ? laenge : undefined, breiteM });
          const rasterHinweis = r.raster === MENGE_UNGEKLAERT ? ' (Lieferantenraster ungeklärt, auf 1 cm genau)' : '';
          return { verfuegbar: true, ergebnis: { text: `${r.text}${rasterHinweis}`, ...r } };
        } catch (e) { return { verfuegbar: true, ergebnis: null, grund: String(e.message) }; }
      }
      if (einheit === 'stueck') {
        if (!(flaeche > 0)) return { verfuegbar: true, ergebnis: null, grund: 'Kundenmenge (Stück) eingeben' };
        try {
          const r = stueckware({ menge: flaeche });
          return { verfuegbar: true, ergebnis: { text: `${r.stueck} Stück`, ...r } };
        } catch (e) { return { verfuegbar: true, ergebnis: null, grund: String(e.message) }; }
      }
      return { verfuegbar: true, ergebnis: null, grund: einheit ? `Bestellmenge ungeklaert - Umrechnung fuer "${einheit}" ist noch nicht hinterlegt` : 'Bestellmenge ungeklaert - Bestelleinheit ist am Produkt nicht hinterlegt' };
    },

    /** Ein einzelnes Lexikon-Produkt fuer die Detailansicht (per Handle). */
    lexikonProdukt(handle) {
      const dir = privatDirPath || privatDir();
      const file = path.join(dir, 'lexikon', 'produkte.json');
      const daten = readJsonGecacht(file);
      if (!daten || !Array.isArray(daten.produkte)) {
        const kaputt = leseFehler(file);
        return {
          verfuegbar: false, quelle: file, fehler: Boolean(kaputt),
          hinweis: kaputt || 'Noch keine Lexikon-Daten exportiert.',
          befehl: 'npm run lexikon:export',
        };
      }
      const produkt = daten.produkte.find(p => p.handle === handle);
      if (!produkt) return { verfuegbar: false, quelle: file, hinweis: `Kein Produkt mit Handle "${handle}" im Lexikon.` };
      // Rueckweg zum Kunden: wer wartet gerade auf genau dieses Produkt? Wer im
      // Kundengespraech nachschlaegt, sieht so sofort, dass da noch etwas offen
      // ist - ohne in die Kundenliste zu wechseln.
      const wartende = this.kundenFaelle?.() ?? { verfuegbar: false };
      const offen = wartende.verfuegbar
        ? (wartende.faelle ?? []).flatMap(k => (k.punkte ?? [])
          .filter(pt => (pt.produkte ?? []).some(pr => pr.handle === handle))
          .map(pt => ({ kunde: k.name, schluessel: k.schluessel, bezug: pt.bezug, schritt: pt.schritt.text, tage: pt.tage })))
        : [];
      // Schnellzugriff zum Lieferanten auch ohne Link: der Bestellweg aus den Stammdaten
      // (Mail, Portal, Telefon) an jeder Variante, die weder Direkt- noch Suchlink hat.
      const stammdaten = leseStammdaten(stammdatenPfad(dir));
      const offeneBestellungen = offeneZuProdukt(offeneBestellungenMap(dir), produkt);
      return { verfuegbar: true, quelle: file, produkt: lexikonProduktMitSchnellzugriff(produkt, stammdaten), wartendeKunden: offen, offeneBestellungen };
    },

    /**
     * Kunden als eigene Datenart (nicht aus Bestellungen abgeleitet) - liest
     * die von operations/scripts/aktualisieren.mjs (Teil "kunden") bereits
     * aufbereitete Datei. Lesend, nur mit optionaler Textsuche ueber Name/
     * E-Mail/Telefon, damit die potenziell grosse Datei nicht komplett an
     * den Browser geht.
     */
    kundenListe({ q = '' } = {}) {
      const dir = privatDirPath || privatDir();
      const file = path.join(dir, 'kunden', 'kunden.json');
      const daten = readJsonIfExists(file);
      if (!daten || !Array.isArray(daten.kunden)) {
        return { verfuegbar: false, quelle: file, hinweis: 'Noch keine Kundendaten exportiert.', befehl: 'npm run daten:aktualisieren -- --nur kunden' };
      }
      const suchtext = String(q || '').trim().toLowerCase();
      const kunden = suchtext
        ? daten.kunden.filter(k => [k.name, k.email, k.telefon].filter(Boolean).some(f => String(f).toLowerCase().includes(suchtext)))
        : daten.kunden;
      return { verfuegbar: true, quelle: file, erstellt: daten.erstellt || null, anzahl: daten.anzahl ?? daten.kunden.length, kunden };
    },

    // -- Aufgaben & Organisation ------------------------------------------
    // Jede Leseabfrage filtert serverseitig nach Sichtbarkeit: persoenliche
    // Notizen duerfen das Geraet eines anderen Benutzers nie erreichen. Ein
    // Ausblenden allein in der Oberflaeche waere kein Schutz.

    _orgDatei() { return orgDatei(privatDirPath || privatDir()); },

    _orgSichtbar(daten, benutzer) { return daten.eintraege.filter(e => darfSehen(e, benutzer)); },

    /** Team aus dem vorhandenen Benutzersystem - keine fest verdrahtete Namensliste. */
    orgTeam() {
      try {
        return orgLeseBenutzer().filter(b => b.aktiv !== false)
          .map(b => ({ name: b.name, kuerzel: b.kuerzel || b.name, rolle: b.rolle }));
      } catch { return []; }
    },

    /** bereich: meine-aufgaben | meine-notizen | team-aufgaben | team-notizen | archiv */
    orgListe({ bereich = 'meine-aufgaben', ansicht = 'fokus', person = '', gruppe = '', prioritaet = '', q = '', benutzer = null } = {}) {
      let gruppenZaehlung = {};
      const datei = this._orgDatei();
      const daten = orgLies(datei);
      const jetzt = new Date();
      const ich = benutzer?.kuerzel || benutzer?.name || 'inhaber';
      const suchtext = String(q || '').trim().toLowerCase();
      let liste = this._orgSichtbar(daten, benutzer);

      if (bereich === 'meine-aufgaben') {
        // Zugewiesenes plus herrenlose Technik: fuer Website und Shop bin ich
        // zustaendig, auch ohne Namen. Unzugewiesenes Geschaeftliches dagegen
        // steht im Team - sonst sammelt sich bei dem, der es aufgeschrieben
        // hat, Arbeit an, die er gar nicht macht.
        liste = liste.filter(e => e.typ === 'TASK'
          && (istPerson(e.verantwortlich, ich) || (!e.verantwortlich && istTechnisch(e.bereich))));
        if (ansicht && ansicht !== 'alle') liste = liste.filter(e => passtZuAnsicht(e, ansicht, jetzt));
      } else if (bereich === 'meine-notizen') {
        liste = liste.filter(e => e.typ === 'NOTE' && istPerson(e.besitzer, ich) && e.sichtbarkeit === 'PRIVAT');
      } else if (bereich === 'team-aufgaben') {
        // Das Team hat mit Shop und Website nichts zu tun - was dort auftaucht,
        // sucht dort niemand. Standardmaessig zeigt die Liste das, wofuer das
        // Team ueberhaupt hereinschaut: Kunden, Bestellungen, kleine Auftraege.
        liste = liste.filter(e => e.typ === 'TASK' && e.sichtbarkeit !== 'PRIVAT' && !istTechnisch(e.bereich));
        // Ohne Bereich bleibt ein Eintrag sichtbar - sonst verschwindet er
        // genau dort, wo ihn jemand einsortieren muesste.
        if (person === 'unzugewiesen') liste = liste.filter(e => !e.verantwortlich);
        else if (person) liste = liste.filter(e => istPerson(e.verantwortlich, person));
        if (ansicht && ansicht !== 'alle') liste = liste.filter(e => passtZuAnsicht(e, ansicht, jetzt));
      } else if (bereich === 'team-notizen') {
        liste = liste.filter(e => e.typ === 'NOTE' && e.sichtbarkeit !== 'PRIVAT');
      } else if (bereich === 'archiv') {
        liste = liste.filter(e => e.status === 'DONE');
      } else if (bereich === 'alle-aufgaben') {
        // Startseite "Heute": alle sichtbaren Aufgaben, Team wie Technik - die To-do-Ableitung
        // (docs/ai-dashboard/lib/todos.mjs) teilt sie nach `technisch` und Zustaendigkeit auf.
        liste = liste.filter(e => e.typ === 'TASK' && (!ansicht || ansicht === 'alle' || passtZuAnsicht(e, ansicht, jetzt)));
      }

      if (suchtext) {
        liste = liste.filter(e => [e.titel, e.beschreibung, e.bereich, e.verantwortlich,
          ...(e.kommentare ?? []).map(k => k.text)].filter(Boolean)
          .some(f => String(f).toLowerCase().includes(suchtext)));
      }

      if (['meine-aufgaben', 'team-aufgaben'].includes(bereich)) {
        if (prioritaet === 'REST') liste = liste.filter(e => ['NORMAL', 'LOW'].includes(e.prioritaet));
        else if (['URGENT', 'HIGH'].includes(prioritaet)) liste = liste.filter(e => e.prioritaet === prioritaet);
      }

      // Gruppen nach Art der Arbeit (ARBEITSGRUPPEN) - fuer jeden Bereich,
      // nicht nur fuer die Teamliste. Die Zahl an jeder Gruppe zaehlt den Stand
      // NACH allen anderen Filtern, aber VOR der Gruppenwahl: sonst zeigte die
      // gewaehlte Gruppe ihre eigene Zahl und alle anderen eine Null.
      for (const e of liste) gruppenZaehlung[gruppeVon(e)] = (gruppenZaehlung[gruppeVon(e)] || 0) + 1;
      if (gruppe && gruppe !== 'alles') liste = liste.filter(e => gruppeVon(e) === gruppe);

      return {
        verfuegbar: true, quelle: datei, bereiche: daten.bereiche, team: this.orgTeam(), ich,
        anzahl: liste.length,
        gruppen: ARBEITSGRUPPEN.map(([key, label]) => ({ key, label, anzahl: gruppenZaehlung[key] || 0 })),
        eintraege: orgSortiere(liste, jetzt).slice(0, 200)
          .map(e => ({ ...e, dringlichkeit: e.typ === 'TASK' ? dringlichkeitsGruppe(e, jetzt) : null,
            darfAendern: darfAendern(e, benutzer), technisch: istTechnisch(e.bereich) })),
      };
    },

    /**
     * Der Stand als Text fuer ChatGPT. Ohne ihn liefert ChatGPT jedes Mal
     * dieselben Punkte neu - es kann ja nicht wissen, was schon dasteht.
     */
    orgExportText({ benutzer = null } = {}) {
      const daten = orgLies(this._orgDatei());
      const ich = benutzer?.kuerzel || benutzer?.name || 'inhaber';
      const offen = this._orgSichtbar(daten, benutzer)
        .filter(e => e.typ === 'TASK' && e.status !== 'DONE');
      const zeile = (e) => {
        const wer = istPerson(e.verantwortlich, ich) ? 'ich'
          : e.verantwortlich ? e.verantwortlich
          : istTechnisch(e.bereich) ? 'ich' : 'Team';
        const was = String(e.beschreibung || '').replace(/\s+/g, ' ').trim().slice(0, 200);
        return `- [${e.bereich || 'Sonstiges'}] ${e.titel} (${wer}${e.faellig ? `, bis ${e.faellig}` : ''})${was ? ` :: ${was}` : ''}`;
      };
      const meine = offen.filter(e => istPerson(e.verantwortlich, ich) || (!e.verantwortlich && istTechnisch(e.bereich)));
      const rest = offen.filter(e => !meine.includes(e));
      const text = [
        `Stand vom ${new Date().toLocaleDateString('de-DE')} - das steht bereits im Dashboard.`,
        'Leg nichts davon noch einmal an; ergaenze nur, was fehlt, oder sag mir, was sich geaendert hat.',
        '',
        `Meine Aufgaben (${meine.length}):`,
        ...(meine.length ? meine.map(zeile) : ['- (nichts offen)']),
        '',
        `Team (${rest.length}):`,
        ...(rest.length ? rest.map(zeile) : ['- (nichts offen)']),
      ].join('\n');
      return { verfuegbar: true, anzahl: offen.length, text };
    },

    /**
     * Fotos vom fertigen Raum. Sie landen als Eintrag im Aufgabensystem -
     * damit haengen Anhaenge, Verlauf und Freigabe schon dran, statt dass
     * daneben ein zweiter Speicher entsteht, in den keiner schaut.
     */
    fotosNeu({ auftrag = '', boden = '', notiz = '', einwilligung = false, fotos = [] } = {}, { benutzer = null } = {}) {
      let eingang;
      try { eingang = pruefeEingang({ auftrag, boden, einwilligung, fotos }); }
      catch (e) { throw new ApiError(400, e instanceof FotoFehler ? e.message : 'Eingabe unvollständig'); }

      const treffer = eingang.boden ? passendeProdukte(eingang.boden, this._lexikonProdukte()) : [];
      const hinweis = produktHinweis(treffer);
      const text = [
        eingang.boden ? `Verlegter Boden laut Auftragszettel: ${eingang.boden}.` : '',
        hinweis.text,
        String(notiz || '').trim(),
        'Der Kunde hat der Verwendung der Fotos zugestimmt.',
      ].filter(Boolean).map(t => (/[.!?]$/.test(t) ? t : `${t}.`)).join(' ');

      const datei = this._orgDatei();
      const daten = orgLies(datei);
      const eintrag = baueEintrag({
        typ: 'TASK',
        titel: titelFuer(eingang),
        beschreibung: text,
        // "Baustelle" statt "Marketing": Marketing gehoert weder zur Technik
        // noch zur Teamarbeit - solche Eintraege standen in keiner der
        // Standardlisten und waren nur ueber die Fotoseite auffindbar.
        bereich: 'Baustelle',
        status: 'INBOX',
        erfolgskriterium: 'Beitrag ist veröffentlicht oder bewusst verworfen.',
        verknuepft: {
          art: FOTO_ART,
          auftrag: eingang.auftrag || null,
          boden: eingang.boden || null,
          produkt: hinweis.handle,
          produktTitel: hinweis.titel,
          farbe: hinweis.farbe ?? null,
          sicher: hinweis.sicher,
          einwilligung: true,
        },
      }, { benutzer });

      const abgelegt = [];
      try {
        for (const f of fotos) {
          abgelegt.push(speichereAnhang(eintrag, f, { dir: privatDirPath || privatDir(), benutzer }));
        }
      } catch (e) { throw new ApiError(400, e.message); }

      daten.eintraege.push(eintrag);
      orgSchreib(daten, datei);
      return { ok: true, id: eintrag.id, anzahl: abgelegt.length, produkt: hinweis, eintrag };
    },

    /** Was bisher hereingekommen ist - neueste zuerst. */
    fotosListe({ offen = false, benutzer = null } = {}) {
      const daten = orgLies(this._orgDatei());
      let liste = this._orgSichtbar(daten, benutzer).filter(e => e.verknuepft?.art === FOTO_ART);
      if (offen) liste = liste.filter(e => e.status !== 'DONE');
      liste.sort((a, b) => String(b.erstelltAm).localeCompare(String(a.erstelltAm)));
      return {
        verfuegbar: true,
        anzahl: liste.length,
        eintraege: liste.slice(0, 100).map(e => ({
          id: e.id, titel: e.titel, status: e.status, beschreibung: e.beschreibung,
          erstelltAm: e.erstelltAm, wer: e.besitzer, ...e.verknuepft,
          fotos: (e.anhaenge ?? []).map(a => ({ datei: a.datei, name: a.name, typ: a.typ })),
        })),
      };
    },

    /** Produktvorschlaege zu einem Bodennamen - fuer die Eingabe unterwegs. */
    fotosProdukt({ boden = '' } = {}) {
      const treffer = passendeProdukte(boden, this._lexikonProdukte());
      return {
        verfuegbar: true,
        hinweis: produktHinweis(treffer),
        vorschlaege: treffer.map(t => ({ handle: t.produkt.handle, titel: t.produkt.titel })),
      };
    },

    _lexikonProdukte() {
      const file = path.join(privatDirPath || privatDir(), 'lexikon', 'produkte.json');
      const daten = readJsonGecacht(file);
      return Array.isArray(daten?.produkte) ? daten.produkte : [];
    },

    /**
     * Team verwalten - bisher ging das nur im Terminal, deshalb gab es bis
     * heute keinen einzigen Mitarbeiterzugang. Ohne Zugaenge bleibt jede
     * Rechteregelung wirkungslos: alles laeuft als "Inhaber".
     */
    _benutzerDatei() { return path.join(privatDirPath || privatDir(), 'benutzer.json'); },

    /**
     * Upload-Links der Monteure fuer Baustellenfotos (Ansicht "Social Media").
     *
     * Der Link IST der Zugang. Das Social-Modul speichert davon nur den Hash
     * (upload-zugaenge.json); damit Inhaber und Mitarbeiter ihn spaeter noch
     * kopieren koennen, legt das Control Center den Klartext beim Anlegen in
     * upload-links.json daneben ab - beides nur im Privatordner, Rechte 600.
     * Angezeigt wird ein gemerkter Link nur, solange sein Zugang aktiv ist:
     * wer per `npm run social -- zugang sperren` sperrt, sperrt auch hier.
     */
    _socialDir() { return path.join(privatDirPath || privatDir(), 'social'); },
    _uploadBasis() {
      const dir = this._socialDir();
      const basis = ladeUmgebung(env, { dir, repo: root }).SOCIAL_UPLOAD_BASIS_URL || '';
      return /^https?:\/\/[^\s<>]+$/.test(basis) ? basis.replace(/\/+$/, '') : '';
    },
    _uploadLinksDatei() { return path.join(this._socialDir(), 'upload-links.json'); },
    _uploadLinks() {
      try { return JSON.parse(fs.readFileSync(this._uploadLinksDatei(), 'utf8')).links ?? []; } catch { return []; }
    },

    socialZugaenge() {
      const dir = this._socialDir();
      const liste = liesZugaenge(path.join(dir, 'upload-zugaenge.json'));
      const basis = this._uploadBasis();
      const gemerkt = this._uploadLinks();
      // Gueltig = aktiv und nicht abgelaufen (Links gelten 180 Tage, social/lib/eingang.mjs).
      const jetzt = now();
      const gueltig = liste.filter(z => zugangGueltig(z, jetzt));
      const namen = [...new Set(gueltig.map(z => z.name))];
      const zugaenge = namen.map(name => {
        const aktive = gueltig.filter(z => z.name === name);
        // Juengster noch gueltiger gemerkter Link dieses Namens.
        const treffer = gemerkt.filter(l => l.name === name && findeZugang(l.token, aktive, { jetzt }))
          .sort((a, b) => String(b.angelegt).localeCompare(String(a.angelegt)))[0];
        return {
          name,
          seit: aktive.map(z => z.angelegt).sort()[0] || null,
          // Bis wann der laengste noch gueltige Link dieses Namens gilt - danach ist ein neuer faellig.
          bis: aktive.map(ablaufVon).filter(Boolean).sort().at(-1) || null,
          link: treffer && basis ? `${basis}/u/${treffer.token}` : null,
        };
      });
      return { basisVorhanden: Boolean(basis), zugaenge };
    },

    socialLinkNeu({ name = '' } = {}, { benutzer = null } = {}) {
      const sauber = String(name || '').trim().slice(0, 40);
      if (!sauber) throw new ApiError(400, 'Bitte einen Namen eintragen, z. B. „Team“.');
      const basis = this._uploadBasis();
      if (!basis) throw new ApiError(409, 'Die öffentliche Upload-Adresse ist am Mac noch nicht eingetragen.');
      const dir = this._socialDir();
      // Ein weiterer Link fuer denselben Namen sperrt den alten nicht: die
      // Monteure benutzen ihn vielleicht gerade auf der Baustelle.
      const z = zugangAnlegen(sauber, { datei: path.join(dir, 'upload-zugaenge.json'), jetzt: now() });
      const links = this._uploadLinks();
      links.push({ name: z.name, token: z.token, angelegt: now().toISOString() });
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this._uploadLinksDatei(), JSON.stringify({ links }, null, 2), { mode: 0o600 });
      fs.chmodSync(this._uploadLinksDatei(), 0o600);
      merke(benutzer, null, 'Upload-Link angelegt', z.name);
      return { ok: true, ...this.socialZugaenge() };
    },

    /** Dieselbe Sperre wie `npm run social -- zugang sperren "Name"`: alle Links dieses Namens. */
    socialSperren({ name = '' } = {}, { benutzer = null } = {}) {
      const sauber = String(name || '').trim();
      if (!sauber) throw new ApiError(400, 'Welcher Zugang? Der Name fehlt.');
      const dir = this._socialDir();
      const n = zugangSperren(sauber, { datei: path.join(dir, 'upload-zugaenge.json') });
      if (!n) throw new ApiError(404, `Kein aktiver Zugang „${sauber}“.`);
      // Den gemerkten Klartext gleich mit entfernen - ein gesperrter Link soll nirgends mehr liegen.
      const links = this._uploadLinks();
      const rest = links.filter(l => l.name.toLowerCase() !== sauber.toLowerCase());
      if (rest.length !== links.length) {
        fs.writeFileSync(this._uploadLinksDatei(), JSON.stringify({ links: rest }, null, 2), { mode: 0o600 });
      }
      merke(benutzer, null, 'Upload-Link gesperrt', sauber);
      return { ok: true, gesperrt: n, ...this.socialZugaenge() };
    },

    teamListe() {
      const liste = orgLeseBenutzer(this._benutzerDatei());
      return {
        verfuegbar: true,
        rollen: ROLLEN,
        eingerichtet: liste.length > 0,
        benutzer: liste.map(b => ({
          name: b.name, kuerzel: b.kuerzel, rolle: b.rolle, aktiv: b.aktiv !== false,
        })),
      };
    },

    /**
     * Anlegen, Rolle aendern, Passwort neu setzen, sperren. Passwoerter werden
     * nur als Hash gespeichert (operations/lib/benutzer.mjs) und nie
     * zurueckgegeben - auch nicht an den Inhaber.
     */
    teamAendern({ was = '', name = '', kuerzel = '', passwort = '', rolle = '' } = {}, { benutzer = null } = {}) {
      // Serverseitig pruefen, nicht nur im Frontend: wer kein Inhaber ist,
      // darf hier nichts - auch nicht ueber einen selbstgebauten Aufruf.
      if (benutzer && benutzer.rolle !== 'inhaber') throw new ApiError(403, 'Nur der Inhaber darf das Team verwalten');
      const datei = this._benutzerDatei();
      const liste = orgLeseBenutzer(datei);
      try {
        let neu;
        if (was === 'anlegen') {
          // Der erste Zugang MUSS der Inhaber sein. Sobald benutzer.json
          // existiert, verlangt jede Seite eine Anmeldung - wer als erstes
          // einen Mitarbeiter anlegt, sperrt sich selbst aus.
          const ersterZugang = liste.length === 0;
          const gewuenscht = ersterZugang ? 'inhaber' : (rolle || 'mitarbeiter');
          if (ersterZugang && rolle && rolle !== 'inhaber') {
            throw new BenutzerFehler('Der erste Zugang muss dein eigener sein (Rolle „Inhaber") – sonst kommst du selbst nicht mehr herein');
          }
          neu = benutzerAnlegen(liste, { name, kuerzel, passwort, rolle: gewuenscht });
        } else if (was === 'passwort') {
          neu = passwortSetzen(liste, kuerzel, passwort);
        } else if (was === 'rolle') {
          validiereRolle(rolle);
          const idx = liste.findIndex(b => String(b.kuerzel).toLowerCase() === String(kuerzel).toLowerCase());
          if (idx < 0) throw new BenutzerFehler(`Benutzer „${kuerzel}" nicht gefunden`);
          // Der letzte aktive Inhaber darf sich nicht selbst entmachten -
          // sonst kann niemand mehr Zugaenge verwalten.
          if (liste[idx].rolle === 'inhaber' && rolle !== 'inhaber'
            && liste.filter(b => b.rolle === 'inhaber' && b.aktiv !== false).length <= 1) {
            throw new BenutzerFehler('Das ist der einzige Inhaber - sonst kann niemand mehr Zugänge verwalten');
          }
          neu = liste.slice();
          neu[idx] = { ...neu[idx], rolle };
        } else if (was === 'sperren' || was === 'entsperren') {
          const ziel = liste.find(b => String(b.kuerzel).toLowerCase() === String(kuerzel).toLowerCase());
          if (ziel?.rolle === 'inhaber' && was === 'sperren'
            && liste.filter(b => b.rolle === 'inhaber' && b.aktiv !== false).length <= 1) {
            throw new BenutzerFehler('Das ist der einzige Inhaber - er lässt sich nicht sperren');
          }
          neu = benutzerDeaktivieren(liste, kuerzel, was === 'entsperren');
        } else {
          throw new BenutzerFehler('Unbekannte Aktion');
        }
        schreibeBenutzer(neu, datei);
        merke(benutzer, benutzer?.kuerzel || 'inhaber', 'Team', `${was}: ${kuerzel || name}`);
        // Sperre, Rollenwechsel und neues Passwort gelten sofort - die
        // laufenden Sitzungen dieses Zugangs verlieren damit ihre Wirkung.
        if (['sperren', 'rolle', 'passwort'].includes(was) && typeof sitzungenVerwerfen === 'function') {
          try { sitzungenVerwerfen(kuerzel); } catch { /* Abmelden darf die Aenderung nicht verhindern */ }
        }
        return { ok: true, ersterZugang: liste.length === 0, ...this.teamListe() };
      } catch (e) {
        if (e instanceof BenutzerFehler) throw new ApiError(400, e.message);
        throw e;
      }
    },

    /**
     * Eigenes Passwort aendern. Bisher konnte das nur der Inhaber - fuer
     * andere. Wer sein Passwort fuer sich behalten will (oder es jemandem
     * genannt hat), musste darum bitten.
     */
    eigenesPasswort({ alt = '', neu = '' } = {}, { benutzer = null } = {}) {
      if (!benutzer?.kuerzel) throw new ApiError(400, 'Dafür musst du angemeldet sein');
      const datei = this._benutzerDatei();
      const liste = orgLeseBenutzer(datei);
      const ich = liste.find(b => String(b.kuerzel).toLowerCase() === String(benutzer.kuerzel).toLowerCase());
      if (!ich) throw new ApiError(404, 'Zugang nicht gefunden');
      // Das alte Passwort wird verlangt, damit ein offener Rechner nicht
      // reicht, um jemanden auszusperren.
      if (!pruefePasswort(alt, ich.passwortHash)) throw new ApiError(403, 'Das bisherige Passwort stimmt nicht');
      try {
        schreibeBenutzer(passwortSetzen(liste, ich.kuerzel, neu), datei);
      } catch (e) {
        if (e instanceof BenutzerFehler) throw new ApiError(400, e.message);
        throw e;
      }
      merke(benutzer, benutzer.kuerzel, 'Team', 'eigenes Passwort geändert');
      return { ok: true };
    },

    orgKennzahlen({ benutzer = null } = {}) {
      const daten = orgLies(this._orgDatei());
      const jetzt = new Date();
      const ich = benutzer?.kuerzel || benutzer?.name || 'inhaber';
      const sichtbar = this._orgSichtbar(daten, benutzer).filter(e => e.typ === 'TASK');
      const meine = sichtbar.filter(e => istPerson(e.verantwortlich, ich)
        || (!e.verantwortlich && istTechnisch(e.bereich)));
      // Die Team-Kennzahl zaehlt alles, was im Team-Reiter steht - nur
      // Technisches nicht, dafuer ist das Team nicht zustaendig.
      const teamArbeit = sichtbar.filter(e => !istTechnisch(e.bereich) && e.sichtbarkeit !== 'PRIVAT');
      const zaehl = (l) => ({
        offen: l.filter(e => e.status !== 'DONE').length,
        heute: l.filter(e => e.status !== 'DONE' && tageBis(e.faellig, jetzt) === 0).length,
        dringend: l.filter(e => e.status !== 'DONE' && e.prioritaet === 'URGENT').length,
        warten: l.filter(e => e.status === 'WAITING').length,
        pruefung: l.filter(e => e.status === 'REVIEW').length,
        ueberfaellig: l.filter(e => istUeberfaellig(e, jetzt)).length,
      });
      return {
        verfuegbar: true, meine: zaehl(meine),
        team: zaehl(teamArbeit),
        naechste: orgSortiere(meine.filter(e => passtZuAnsicht(e, 'fokus', jetzt)), jetzt).slice(0, 5),
      };
    },

    /**
     * Was zu diesem Kunden notiert wurde. Die Verknuepfung entsteht beim
     * Anlegen aus der Kundenakte heraus - ohne diese Liste sieht man in der
     * Akte nicht, was beim letzten Anruf besprochen wurde.
     */
    orgZuKunde({ key = '', benutzer = null } = {}) {
      const gesucht = String(key || '').trim();
      if (!gesucht) return { verfuegbar: true, anzahl: 0, eintraege: [] };
      const daten = orgLies(this._orgDatei());
      // Bei gleichem Zeitstempel (zwei Notizen in derselben Sekunde) entscheidet
      // die Reihenfolge in der Datei - sonst steht die aeltere oben.
      const liste = this._orgSichtbar(daten, benutzer)
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => e.verknuepft?.art === 'kunde' && String(e.verknuepft.id || '') === gesucht)
        .sort((a, b) => String(b.e.erstelltAm).localeCompare(String(a.e.erstelltAm)) || (b.i - a.i))
        .map(({ e }) => e);
      return {
        verfuegbar: true,
        anzahl: liste.length,
        eintraege: liste.slice(0, 50).map(e => ({
          id: e.id, typ: e.typ, titel: e.titel, beschreibung: e.beschreibung, status: e.status,
          verantwortlich: e.verantwortlich, faellig: e.faellig, erstelltAm: e.erstelltAm,
          kommentare: (e.kommentare ?? []).length,
        })),
      };
    },

    /** Vorschlag zu einer Eingabe - ohne zu speichern, samt moeglicher Doppelgaenger. */
    orgAnalyse({ text = '', benutzer = null } = {}) {
      const daten = orgLies(this._orgDatei());
      const vorschlag = orgAnalysiere(text, { mitarbeiter: this.orgTeam(), bereiche: daten.bereiche, benutzer });
      const doppelt = findeDoppelgaenger(text, this._orgSichtbar(daten, benutzer))
        .map(d => ({ id: d.eintrag.id, titel: d.eintrag.titel, status: d.eintrag.status, wert: Math.round(d.wert * 100) }));
      return { verfuegbar: true, vorschlag, doppelgaenger: doppelt };
    },

    /**
     * Liste einfuegen: eine Zeile je Aufgabe. So kommen Sammlungen aus
     * ChatGPT, aus einer Mail oder vom Zettel herein. Erst Vorschau
     * (`speichern: false`), dann Anlegen - jede Zeile mit Duplikatpruefung.
     */
    orgListeEinfuegen({ text = '', speichern = false, zeilen = null } = {}, { benutzer = null } = {}) {
      const datei = this._orgDatei();
      const daten = orgLies(datei);
      const sichtbar = this._orgSichtbar(daten, benutzer);

      if (!speichern) {
        const vorschlaege = orgAusListe(text, { mitarbeiter: this.orgTeam(), bereiche: daten.bereiche, benutzer });
        return {
          verfuegbar: true,
          anzahl: vorschlaege.length,
          vorschlaege: vorschlaege.map(v => ({
            ...v,
            doppelgaenger: findeDoppelgaenger(v.titel, sichtbar)
              .map(d => ({ id: d.eintrag.id, titel: d.eintrag.titel, status: d.eintrag.status, wert: Math.round(d.wert * 100) })),
          })),
        };
      }

      const anzulegen = Array.isArray(zeilen) ? zeilen : [];
      const angelegt = [];
      for (const roh of anzulegen) {
        angelegt.push(mitEingabepruefung(() => baueEintrag(roh, { benutzer })));
      }
      daten.eintraege.push(...angelegt);
      if (angelegt.length) orgSchreib(daten, datei);
      return { ok: true, angelegt: angelegt.length, eintraege: angelegt };
    },

    orgNeu(roh = {}, { benutzer = null } = {}) {
      const datei = this._orgDatei();
      const daten = orgLies(datei);
      const eintrag = mitEingabepruefung(() => baueEintrag(roh, { benutzer }));
      daten.eintraege.push(eintrag);
      orgSchreib(daten, datei);
      return { ok: true, eintrag };
    },

    orgAendern({ id, felder = {} } = {}, { benutzer = null } = {}) {
      const datei = this._orgDatei();
      const daten = orgLies(datei);
      const eintrag = findeEintrag(daten, id);
      if (!eintrag) throw new ApiError(404, 'Eintrag nicht gefunden');
      if (!darfSehen(eintrag, benutzer) || !darfAendern(eintrag, benutzer)) throw new ApiError(403, 'Keine Berechtigung für diesen Eintrag');
      // Sichtbarkeit ist die einzige Angabe, die darueber entscheidet, WER den
      // Eintrag noch sehen darf. Ein Mitarbeiter darf jede unzugewiesene
      // Team-Aufgabe aendern - stellte er sie auf PRIVAT, verschwand sie damit
      // auch fuer den Inhaber, denn darfSehen kennt fuer PRIVAT keine Ausnahme.
      // Wer die Sichtbarkeit aendern will, muss Inhaber sein.
      if ('sichtbarkeit' in felder && felder.sichtbarkeit !== eintrag.sichtbarkeit
        && benutzer && benutzer.rolle !== 'inhaber') {
        throw new ApiError(403, 'Nur der Inhaber darf die Sichtbarkeit ändern');
      }
      // Wiederholung wird als eigenes Objekt gefuehrt, deshalb hier gesetzt.
      if ('wiederholungRegel' in felder) {
        const regel = felder.wiederholungRegel || null;
        eintrag.wiederholung = regel ? { regel, naechsteFaelligkeit: null, zuletztErzeugt: null } : null;
        eintrag.verlauf.push({ zeit: new Date().toISOString(), wer: benutzer?.kuerzel || benutzer?.name || 'inhaber', was: regel ? `Wiederholung auf ${regel} gesetzt` : 'Wiederholung entfernt' });
        delete felder.wiederholungRegel;
      }
      mitEingabepruefung(() => orgAendere(eintrag, felder, { benutzer }));
      orgSchreib(daten, datei);
      return { ok: true, eintrag };
    },

    orgKommentar({ id, text = '' } = {}, { benutzer = null } = {}) {
      const datei = this._orgDatei();
      const daten = orgLies(datei);
      const eintrag = findeEintrag(daten, id);
      if (!eintrag) throw new ApiError(404, 'Eintrag nicht gefunden');
      if (!darfSehen(eintrag, benutzer)) throw new ApiError(403, 'Keine Berechtigung für diesen Eintrag');
      mitEingabepruefung(() => orgKommentiere(eintrag, text, { benutzer }));
      orgSchreib(daten, datei);
      return { ok: true, eintrag };
    },

    /**
     * Prüflauf anstoßen (Knopf im Dashboard und die tägliche Ausführung um
     * 9:30 nutzen denselben Weg). Erledigt wird nur, was gemessen wurde.
     */
    /**
     * Der Aufgabenwaechter laeuft ueber alle Eintraege - auch ueber private des
     * Inhabers -, gibt deren Titel zurueck und setzt ihren Status. Das ist
     * Inhabersache. Die Sperre steht zusaetzlich zu NUR_INHABER im Server,
     * damit sie auch gilt, wenn diese API einmal von anderswoher benutzt wird.
     */
    async orgPruefen({ id = null } = {}, { benutzer = null } = {}) {
      if (benutzer && benutzer.rolle !== 'inhaber') throw new ApiError(403, 'Nur der Inhaber darf die Aufgabenprüfung starten');
      const { laufe } = await import('../operations/scripts/aufgaben-pruefen.mjs');
      const ergebnis = await laufe({ datei: this._orgDatei(), id });
      return { ok: true, ...ergebnis };
    },

    /** Anhang hochladen (Base64 im Rumpf - kein Multipart noetig). */
    orgAnhang({ id, name, typ, daten } = {}, { benutzer = null } = {}) {
      const datei = this._orgDatei();
      const gespeichert = orgLies(datei);
      const eintrag = findeEintrag(gespeichert, id);
      if (!eintrag) throw new ApiError(404, 'Eintrag nicht gefunden');
      if (!darfSehen(eintrag, benutzer) || !darfAendern(eintrag, benutzer)) throw new ApiError(403, 'Keine Berechtigung für diesen Eintrag');
      let anhang;
      try {
        anhang = speichereAnhang(eintrag, { name, typ, daten }, { dir: privatDirPath || privatDir(), benutzer });
      } catch (e) { throw new ApiError(400, e.message); }
      orgSchreib(gespeichert, datei);
      return { ok: true, anhang, eintrag };
    },

    /** Anhang ausliefern - nur wer den Eintrag sehen darf. */
    orgAnhangLesen({ id = '', datei = '', benutzer = null } = {}) {
      const daten = orgLies(this._orgDatei());
      const eintrag = findeEintrag(daten, id);
      if (!eintrag || !darfSehen(eintrag, benutzer)) throw new ApiError(404, 'Nicht gefunden');
      const anhang = (eintrag.anhaenge ?? []).find(a => a.datei === datei);
      if (!anhang) throw new ApiError(404, 'Anhang nicht gefunden');
      const pfad = mitEingabepruefung(() => anhangPfad(id, datei, privatDirPath || privatDir()));
      return { pfad, typ: anhang.typ, name: anhang.name };
    },

    orgEintrag({ id = '', benutzer = null } = {}) {
      const daten = orgLies(this._orgDatei());
      const eintrag = findeEintrag(daten, id);
      if (!eintrag || !darfSehen(eintrag, benutzer)) return { verfuegbar: false, hinweis: 'Eintrag nicht gefunden oder nicht freigegeben.' };
      return { verfuegbar: true, eintrag, darfAendern: darfAendern(eintrag, benutzer) };
    },

    /**
     * Claude-Verbrauch der letzten 7 Tage (operations/scripts/claude-verbrauch.mjs,
     * #671): Sitzungen, Langsitzungen, Tokens je Modell, Klasse und Aufgabe - nur
     * Zahlen und Titel aus den lokalen Sitzungsprotokollen. Ist die Datei aelter
     * als 30 Minuten, wird sie im Hintergrund neu gerechnet; die Antwort kommt
     * sofort mit dem vorhandenen Stand und `wirdErneuert`.
     */
    verbrauchClaude() {
      const dir = privatDirPath || privatDir();
      const file = path.join(dir, 'verbrauch', 'claude.json');
      const daten = readJsonIfExists(file);
      const stand = daten?.erzeugtAm ? Date.parse(daten.erzeugtAm) : NaN;
      const veraltet = !Number.isFinite(stand) || now().getTime() - stand > 30 * 60_000;
      const wirdErneuert = veraltet ? verbrauchErneuern(dir) : false;
      if (!daten || daten.schema !== 1 || !daten.erzeugtAm) {
        return { verfuegbar: false, wirdErneuert, befehl: 'npm run verbrauch:sammeln', fehler: leseFehler(file) };
      }
      return { verfuegbar: true, wirdErneuert, ...daten };
    },

    /**
     * Ergebnis der Shop-Wache (operations/scripts/shopwache.mjs). Zeigt, ob
     * der oeffentliche Shop laeuft - das sieht man den Admin-Daten nicht an.
     */
    async shopwacheStatus() {
      const dir = privatDirPath || privatDir();
      const file = path.join(dir, 'shopwache', 'status.json');
      const daten = readJsonIfExists(file);
      // Tailscale gehoert nicht zum Shop, aber zur selben Frage "laeuft von aussen
      // alles?" - und der Inhaber sieht diese Antwort als To-do auf "Heute".
      const ts = await tailscaleZustand();
      // Woechentliche Auslauf-Pruefung (operations/scripts/auslauf-pruefen.mjs) faehrt mit:
      // dieselbe Frage "stimmt, was der Shop zeigt?", dieselbe To-do-Quelle auf "Heute".
      const aus = readJsonIfExists(path.join(dir, 'auslauf', 'status.json'));
      const offen = aus?.geprueftAm ? auslaufOffen(aus.befunde || [], readJsonGecacht(path.join(dir, 'lexikon', 'produkte.json'))) : null;
      const auslauf = aus?.geprueftAm
        ? {
          geprueftAm: aus.geprueftAm, befunde: offen.befunde, archiviert: offen.archiviert, ausfaelle: aus.ausfaelle || [],
          // Ampel wie operations/lib/auslauf.mjs, aber nur aus den noch offenen Befunden.
          ampel: !offen.archiviert ? aus.ampel
            : offen.befunde.some(b => b.ergebnis === 'fehlt') ? 'rot' : offen.befunde.length || aus.ausfaelle?.length ? 'gelb' : 'gruen',
          neuheiten: aus.neuheiten ? { neu: aus.neuheiten.neu || [], ausfall: aus.neuheiten.ausfall || null } : null,
        }
        : null;
      // Ausschreibungen Bodenbelag (operations/scripts/ausschreibungen-pruefen.mjs), dieselbe To-do-Quelle.
      const aus2 = readJsonIfExists(path.join(dir, 'ausschreibungen', 'status.json'));
      const ausschreibungen = aus2?.geprueftAm
        ? { geprueftAm: aus2.geprueftAm, treffer: aus2.treffer || [], neu: aus2.neu || [], ausfaelle: aus2.ausfaelle || [] }
        : null;
      // Routinen als Mac-Dienst (operations/lib/routinen.mjs): Stand je Routine, gestoerte werden ein rotes To-do.
      // Eingerichtet = Plist unter ~/Library/LaunchAgents; Tests geben einen eigenen Ordner mit.
      const routinen = routinenStand(dir, { jetzt: now(), ...(launchAgentsDir ? { agentsDir: launchAgentsDir } : {}) });
      // Betriebsdaten-Sicherung (operations/scripts/sicherung.mjs): verpasst oder gescheitert wird ein To-do.
      const sicherung = sicherungsstand(path.join(dir, 'sicherungsstand.json'), now());
      if (!daten || !daten.geprueftAm) {
        return { verfuegbar: false, quelle: file, hinweis: 'Shop-Wache noch nie gelaufen.', befehl: 'npm run shop:wache', tailscale: ts, auslauf, ausschreibungen, routinen, sicherung };
      }
      return { verfuegbar: true, quelle: file, ...daten, tailscale: ts, auslauf, ausschreibungen, routinen, sicherung };
    },

    /**
     * Alles offene je Kunde in einem Eintrag - Bestellungen, Angebote und
     * liegengebliebene Warenkoerbe zusammengefuehrt. Beantwortet die Frage,
     * in der im Laden gedacht wird: wer wartet auf was.
     */
    kundenFaelle() {
      const dir = privatDirPath || privatDir();
      const modell = ladeBestellModell(dir);
      if (!modell) {
        return { verfuegbar: false, quelle: path.join(dir, 'bestelluebersicht', 'orders.json'), hinweis: 'orders.json fehlt.' };
      }
      const statusAlle = leseAktuellenStatus(auftragsstatusPfad(dir), modell);
      const rueckrufeAlle = leseRueckrufe(rueckrufePfad(dir));
      // Der naechste Schritt kommt aus der Zeitleiste (Auftragsfluss + Verlauf), nicht aus dem
      // Shopify-Versandstatus: Muster, die laengst beim Kunden sind, standen sonst als "Versenden".
      const zl = zeitleisten(dir, modell, statusAlle);
      const bestellzeilen = bestellliste(modell, { statusAlle, rueckrufeAlle })
        .map(z => ({ ...z, zeitleisteSchritt: zl.get(z.orderId)?.naechsterSchritt ?? null }));
      const angebote = readJsonIfExists(path.join(dir, 'angebote', 'angebote.json'))?.angebote ?? [];
      const warenkoerbe = readJsonIfExists(path.join(dir, 'warenkoerbe', 'warenkoerbe.json'))?.warenkoerbe ?? [];
      const roh = kundenFaelle({ bestellzeilen, angebote, warenkoerbe });
      // Von Hand gesetzte Marken und erkannte Testadressen fuehren zum selben
      // Ergebnis: der Fall verschwindet aus der Arbeitsliste, bleibt aber
      // einsehbar. Nichts wird geloescht, in Shopify aendert sich nichts.
      const marken = leseFallmarken(fallmarkenPfad(dir));
      const mitAuto = (roh.faelle ?? []).map(f => (
        f.testkontakt && !marken[f.schluessel]
          ? { ...f, marke: { grund: 'test', automatisch: true, zeit: null, von: null, bisPunkt: null } }
          : f
      ));
      const autoAus = mitAuto.filter(f => f.marke?.automatisch);
      const rest = mitAuto.filter(f => !f.marke?.automatisch);
      const { sichtbar, ausgeblendet } = teileFaelleAuf(rest, marken);
      // Wartende Kunden, die jemand als erledigt oder "kein echter Kunde" markiert hat, zaehlen nicht mit.
      const { wartendeSchluessel = [], ...ohneSchluessel } = roh;
      return {
        verfuegbar: true,
        ...ohneSchluessel,
        wartend: wartendeSchluessel.filter(k => !marken[k]).length,
        faelle: sichtbar,
        anzahl: sichtbar.length,
        sofort: sichtbar.filter(k => k.dringend === 0).length,
        ausgeblendet: [...autoAus, ...ausgeblendet],
      };
    },

    /**
     * Fall abhaken oder als "kein echter Kunde" markieren - und beides wieder
     * zuruecknehmen (grund: null). Der Stand des juengsten Punktes wird
     * mitgeschrieben: bestellt derselbe Kunde spaeter erneut, kommt der Fall
     * von selbst zurueck.
     */
    fallMarkieren({ schluessel, grund = null } = {}, { benutzer = null } = {}) {
      const dir = privatDirPath || privatDir();
      if (!schluessel) throw new ApiError(400, 'Kein Fall angegeben');
      if (grund !== null && !FALL_GRUND.includes(grund)) throw new ApiError(400, `Unbekannter Grund: ${grund}`);
      let bisPunkt = null;
      if (grund) {
        const aktuell = this.kundenFaelle?.();
        const alle = [...(aktuell?.faelle ?? []), ...(aktuell?.ausgeblendet ?? [])];
        bisPunkt = juengsterPunkt(alle.find(f => f.schluessel === schluessel));
      }
      const ergebnis = setzeFallmarke(fallmarkenPfad(dir), schluessel, {
        grund, bisPunkt, von: benutzer?.name || benutzer?.kuerzel || 'Inhaber',
      });
      merke(benutzer, null, 'Fall markiert', `${schluessel}: ${grund || 'zurückgenommen'}`);
      return { ok: true, ...ergebnis };
    },

    /**
     * "Fehler melden": jeder Angemeldete darf melden, auch die Rolle "lesen" -
     * eine Meldung aendert keine Betriebsdaten. Weiter in die Werkbank traegt
     * sie der geplante Abgleich (operations/scripts/fehlermeldungen.mjs).
     */
    fehlerMelden(payload = {}, { benutzer = null } = {}) {
      const dir = privatDirPath || privatDir();
      try {
        const roh = Array.isArray(payload?.bilder) ? payload.bilder : [];
        if (roh.length > BILDER_MAX) throw new FehlermeldungFehler(`Höchstens ${BILDER_MAX} Bilder je Meldung.`);
        const bilder = roh.map(bildAusUpload);
        const { meldung, doppelt } = meldungAnlegen(meldungenPfad(dir), payload || {}, { von: benutzer, jetzt: now(), bilder, version: dienstVersion() });
        if (!doppelt) merke(benutzer, null, 'Fehler gemeldet', meldung.id);
        return { ok: true, id: meldung.id, doppelt };
      } catch (e) {
        if (e instanceof FehlermeldungFehler) throw new ApiError(400, e.message);
        throw e;
      }
    },

    /** Bildschirmfoto einer Meldung - nur fuer den Melder selbst und den Inhaber. */
    fehlerBild({ id = '', nr = '', benutzer = null } = {}) {
      const dir = privatDirPath || privatDir();
      const md = meldungenPfad(dir);
      const m = alleMeldungen(md, abgleichPfad(dir)).find(x => x.id === id);
      // Fremde Meldung und unbekannte gleich beantworten: sonst verraet die
      // Antwort, welche Nummern es gibt.
      if (!m || !darfMeldungSehen(m, benutzer)) throw new ApiError(404, 'Bild nicht gefunden');
      const name = m.bilder[Number(nr) - 1];
      if (!name) throw new ApiError(404, 'Bild nicht gefunden');
      const { pfad, typ } = bildDatei(md, name);
      if (!fs.existsSync(pfad)) throw new ApiError(404, 'Bild nicht gefunden');
      return { pfad, typ, name };
    },

    /** Eigene Meldungen samt Stand; der Inhaber sieht alle. */
    fehlerListe({ benutzer = null } = {}) {
      const dir = privatDirPath || privatDir();
      let liste;
      try { liste = alleMeldungen(meldungenPfad(dir), abgleichPfad(dir)); } catch (e) {
        if (e instanceof FehlermeldungFehler) throw new ApiError(500, e.message);
        throw e;
      }
      const sichtbar = sichtbareMeldungen(liste, benutzer);
      return { verfuegbar: true, alle: !benutzer || benutzer.rolle === 'inhaber', anzahl: sichtbar.length, meldungen: sichtbar.slice(0, 30) };
    },

    /** Angebote/Entwuerfe (DraftOrder) - Mass-/Verlegeangebote, die noch keine Bestellung sind. */
    angeboteListe() {
      const dir = privatDirPath || privatDir();
      const file = path.join(dir, 'angebote', 'angebote.json');
      const daten = readJsonIfExists(file);
      if (!daten || !Array.isArray(daten.angebote)) {
        return { verfuegbar: false, quelle: file, hinweis: 'Noch keine Angebotsdaten exportiert.', befehl: 'npm run daten:aktualisieren -- --nur angebote' };
      }
      return { verfuegbar: true, quelle: file, ...daten };
    },

    /** Abgebrochene Warenkoerbe der letzten 30 Tage - verlorener Umsatz. */
    warenkoerbeListe() {
      const dir = privatDirPath || privatDir();
      const file = path.join(dir, 'warenkoerbe', 'warenkoerbe.json');
      const daten = readJsonIfExists(file);
      if (!daten || !Array.isArray(daten.warenkoerbe)) {
        return { verfuegbar: false, quelle: file, hinweis: 'Noch keine Warenkorb-Daten exportiert.', befehl: 'npm run daten:aktualisieren -- --nur warenkoerbe' };
      }
      // Auch aeltere Exporte ohne Testfilter: Testadressen nie als verlorenen Umsatz zeigen.
      const echte = daten.warenkoerbe.filter(w => !istTestkontakt(w));
      const ausgeblendet = daten.warenkoerbe.length - echte.length;
      return { verfuegbar: true, quelle: file, ...daten, warenkoerbe: echte, testAusgeblendet: (daten.testAusgeblendet || 0) + ausgeblendet };
    },

    /**
     * Bildrechte (nur lesend): drei Prueflisten aus dem lokalen Verzeichnis -
     * ungeklaert, schmaler als 1200 px, ohne ALT-Text. Quellen und Lizenzen
     * bleiben auf dem Server; ausgeliefert wird nur, was die Liste braucht.
     * Links kommen aus dem Lexikon (Produkt-ID fuers Admin, Shopadresse nur bei
     * veroeffentlichten Produkten); fehlt das Produkt dort, sucht das Admin nach dem Handle.
     */
    bildrechteListe({ liste = '', gruppe = '', page = 1 } = {}) {
      const dir = privatDirPath || privatDir();
      const daten = leseBildrechte(path.join(dir, 'bildrechte', 'bildrechte.csv'));
      if (!daten) {
        return { verfuegbar: false, hinweis: 'Das Bildrechte-Verzeichnis ist auf diesem Mac noch nicht angelegt.', befehl: 'npm run bildrechte:inventur' };
      }
      const ergebnis = bildrechtePrueflisten(daten.zeilen, { liste, gruppe, page, pageSize: 25 });
      const links = linksAusLexikon(readJsonGecacht(path.join(dir, 'lexikon', 'produkte.json')));
      const items = ergebnis.items.map(e => {
        const l = links.get(e.handle);
        const adminUrl = l?.adminUrl || (e.handle ? `https://admin.shopify.com/store/sjjyq1-6w/products?query=${encodeURIComponent(e.handle)}` : null);
        return { ...e, adminUrl, shopUrl: l?.shopUrl || null };
      });
      return { verfuegbar: true, stand: daten.stand, ...ergebnis, items };
    },

    /** Lagerbestand je Standort/Variante - oder der Hinweis, dass der Shop keinen fuehrt. */
    bestandListe() {
      const dir = privatDirPath || privatDir();
      const file = path.join(dir, 'bestand', 'bestand.json');
      const daten = readJsonIfExists(file);
      if (!daten) {
        return { verfuegbar: false, quelle: file, hinweis: 'Noch keine Bestandsdaten exportiert.', befehl: 'npm run daten:aktualisieren -- --nur bestand' };
      }
      return { verfuegbar: true, quelle: file, ...daten };
    },

    /**
     * Akquise Verlegeauftraege (#1447). Firmenliste (CSV) und Anschreiben liegen privat im
     * Gedaechtnis-Ordner (TP_AKQUISE_DIR), der Bearbeitungsstand unter
     * $TP_PRIVAT_DIR/akquise/status.json. Nichts davon gehoert ins Repository.
     */
    _akquiseQuelle() {
      const dir = env.TP_AKQUISE_DIR || path.join(os.homedir(), '.claude', 'projects', '-Users-tristan-teppich-paradies-shopify-ai', 'memory', 'Akquise');
      const csv = env.TP_AKQUISE_CSV || path.join(dir, 'wohnungsgenossenschaften_umkreis_2026_10_19.csv');
      const vorlage = env.TP_AKQUISE_VORLAGE || path.join(dir, 'anschreiben_wohnungsunternehmen_2026_10_20.md');
      return { csv, vorlage, status: path.join(privatDirPath || privatDir(), 'akquise', 'status.json') };
    },
    /** Stand lesen: fehlt die Datei, ist er leer; kaputt ist ein Fehler (sonst ueberschreibt der naechste Klick alles). */
    _akquiseStand(file) {
      let roh;
      try { roh = fs.readFileSync(file, 'utf8'); } catch (e) {
        if (e?.code === 'ENOENT') return {};
        throw new ApiError(500, `Akquise-Stand nicht lesbar: ${e?.code || e?.message}`);
      }
      try { return JSON.parse(roh).firmen || {}; } catch { throw new ApiError(500, 'Akquise-Stand ist beschädigt (kein gültiges JSON) – bitte prüfen, nichts überschrieben.'); }
    },
    async akquiseListe() {
      const q = this._akquiseQuelle();
      let csv;
      try { csv = fs.readFileSync(q.csv, 'utf8'); } catch (e) {
        if (e?.code === 'ENOENT') return { verfuegbar: false, hinweis: 'Die Firmenliste fehlt auf diesem Rechner.', befehl: 'Pfad per TP_AKQUISE_CSV setzen' };
        throw e;
      }
      const stand = this._akquiseStand(q.status);
      let vorlage = '';
      try { vorlage = vorlageAusMarkdown(fs.readFileSync(q.vorlage, 'utf8')); } catch (e) { if (e?.code !== 'ENOENT') throw e; }
      const firmen = leseAkquiseCsv(csv).map(f => ({
        id: f.id, name: f.name, ort: f.ort, typ: f.typ, wohnungen: f.wohnungen, website: f.website, kontakt: f.kontakt || '',
        status: 'neu', letzteAktion: '', wiedervorlage: '', notiz: '', ...stand[f.id],
      }));
      const aus = readJsonIfExists(path.join(privatDirPath || privatDir(), 'ausschreibungen', 'status.json'));
      const akqDir = path.dirname(q.status);
      return {
        verfuegbar: true, firmen, vorlage,
        // Richtpreise und Referenzen liegen privat neben dem Stand; fehlen sie, bleibt die Zeile weg.
        richtpreise: this._privatJson(path.join(akqDir, 'richtpreise.json'), null),
        referenzen: this._privatJson(path.join(akqDir, 'referenzen.json'), { referenzen: [] }).referenzen || [],
        ausschreibungen: aus?.geprueftAm ? { geprueftAm: aus.geprueftAm, treffer: aus.treffer || [], neu: aus.neu || [] } : null,
      };
    },
    /** Private JSON-Ablage lesen: nur eine FEHLENDE Datei gilt als leer, kaputtes JSON ist ein Fehler. */
    _privatJson(file, leer) {
      let roh;
      try { roh = fs.readFileSync(file, 'utf8'); } catch (e) {
        if (e?.code === 'ENOENT') return leer;
        throw new ApiError(500, `${path.basename(file)} nicht lesbar: ${e?.code || e?.message}`);
      }
      try { return JSON.parse(roh); } catch { throw new ApiError(500, `${path.basename(file)} ist beschädigt (kein gültiges JSON) – bitte prüfen, nichts überschrieben.`); }
    },
    _privatSchreiben(file, daten) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(daten, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, file);
    },
    /** Einkauf "Erledigt" -> "Als Referenz merken": Notiz je Auftrag, privat unter akquise/referenzen.json. */
    async akquiseReferenz(payload = {}, benutzer = null) {
      let r;
      try { r = pruefeReferenz(payload); } catch (e) { throw new ApiError(400, e.message); }
      const file = path.join(path.dirname(this._akquiseQuelle().status), 'referenzen.json');
      const d = this._privatJson(file, { referenzen: [] });
      const liste = (d.referenzen || []).filter(x => x.orderId !== r.orderId);
      const eintrag = { ...r, am: now().toISOString().slice(0, 10), von: benutzer?.name || benutzer?.kuerzel || '' };
      liste.unshift(eintrag);
      this._privatSchreiben(file, { referenzen: liste });
      return { ok: true, referenz: eintrag };
    },
    /** Termin beim Kunden (Lieferung/Verlegung) je Auftrag - leer loescht ihn. */
    async einkaufKundentermin(payload = {}, benutzer = null) {
      const orderId = String(payload.orderId || '').trim();
      const termin = String(payload.termin || '').trim();
      if (!orderId || orderId.length > 100) throw new ApiError(400, 'Auftrag fehlt.');
      if (termin && (!/^\d{4}-\d{2}-\d{2}$/.test(termin) || !Number.isFinite(Date.parse(termin)))) throw new ApiError(400, 'Termin bitte als Datum.');
      const file = path.join(privatDirPath || privatDir(), 'bestelluebersicht', 'kundentermine.json');
      const d = this._privatJson(file, {});
      if (termin) d[orderId] = { termin, von: benutzer?.name || benutzer?.kuerzel || '', am: now().toISOString() };
      else delete d[orderId];
      this._privatSchreiben(file, d);
      return { ok: true, orderId, termin: termin || null };
    },
    async akquiseAendern(payload = {}, benutzer = null) {
      const q = this._akquiseQuelle();
      const id = akquiseId(payload.id);
      if (!id || id !== payload.id) throw new ApiError(400, 'Unbekannte Firma.');
      let csv;
      try { csv = fs.readFileSync(q.csv, 'utf8'); } catch { throw new ApiError(409, 'Die Firmenliste fehlt auf diesem Rechner.'); }
      if (!leseAkquiseCsv(csv).some(f => f.id === id)) throw new ApiError(400, 'Unbekannte Firma.');
      const stand = this._akquiseStand(q.status);
      const heute = now().toISOString().slice(0, 10);
      let neu;
      try { neu = wendeAenderungAn(stand[id] || { status: 'neu' }, payload, heute); } catch (e) { throw new ApiError(400, e.message); }
      neu.von = benutzer?.kuerzel || benutzer?.name || neu.von || '';
      // Wer angeschrieben hat, bleibt stehen - die Fortschrittszeile nennt die Namen.
      if (neu.status === 'angeschrieben' && (stand[id]?.status || 'neu') === 'neu') neu.angeschriebenVon = benutzer?.name || benutzer?.kuerzel || '';
      stand[id] = neu;
      fs.mkdirSync(path.dirname(q.status), { recursive: true });
      const tmp = `${q.status}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ firmen: stand }, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, q.status);
      return { ok: true, firma: { id, ...neu } };
    },

    /**
     * Hausverwaltungen (w-154, #1768): Verwaltungen, Objekte, Angebote - von Hand gepflegt,
     * nur hier gespeichert ($TP_PRIVAT_DIR/hausverwaltungen/verwaltungen.json, nächtlich gesichert).
     */
    _hvDatei() {
      return path.join(privatDirPath || privatDir(), 'hausverwaltungen', 'verwaltungen.json');
    },
    async hausverwaltungenListe() {
      const d = this._privatJson(this._hvDatei(), leererHvBestand());
      return { verfuegbar: true, verwaltungen: Array.isArray(d.verwaltungen) ? d.verwaltungen : [] };
    },
    async hausverwaltungenSpeichern(payload = {}, benutzer = null) {
      const file = this._hvDatei();
      // Kaputtes JSON bricht hier ab (_privatJson) - sonst schriebe der Klick eine Datei mit einem Eintrag.
      const bestand = this._privatJson(file, leererHvBestand());
      let r;
      try {
        r = wendeHvAenderungAn(bestand, payload, {
          heute: now().toISOString().slice(0, 10),
          neueId: () => `hv-${randomBytes(5).toString('hex')}`,
          von: benutzer?.name || benutzer?.kuerzel || '',
        });
      } catch (e) { throw new ApiError(400, e.message); }
      this._privatSchreiben(file, r.bestand);
      const wem = r.ergebnis.verwaltung?.name || '';
      const was = { verwaltung: 'Hausverwaltung', objekt: 'Objekt', angebot: 'Angebot' }[r.ergebnis.ebene];
      merke(benutzer, 'Inhaber', `${was} ${r.ergebnis.entfernt ? 'entfernt' : payload.id ? 'geändert' : 'angelegt'}`, wem || null);
      return { ok: true, ...r.ergebnis };
    },

    /**
     * Sonderposten live aus Shopify (operations/lib/sonderposten.mjs). Ohne
     * Zugang derselbe Hinweis wie bei den anderen Quellen; ein Lesefehler wird
     * als Stoerung mit Handlungshinweis gemeldet, nie als leere Liste.
     */
    async sonderpostenListe() {
      let zugang;
      try { zugang = await shopify(); } catch (e) {
        return { verfuegbar: false, fehler: true, hinweis: mitHinweis(String(e?.message || e).split('\n')[0]) };
      }
      if (zugang?.art === 'sammeln') return sonderpostenOhneZugang();
      try {
        const daten = await leseSonderposten(zugang.proxy, { jetzt: now() });
        if (!daten) return sonderpostenOhneZugang();
        return { verfuegbar: true, ...daten };
      } catch (e) {
        const msg = String(e?.message || e).split('\n')[0].slice(0, 300);
        console.error(`[sonderposten] ${msg}`);
        return { verfuegbar: false, fehler: true, hinweis: `Shopify war nicht lesbar: ${mitHinweis(msg)}` };
      }
    },

    /**
     * "Im Laden verkauft": Einzelstueck Bestand 1 -> 0 mit Verkaufsangaben,
     * Restrolle (mit laengeM) Bestand minus Laenge x Rollenbreite; jeweils
     * Protokoll und Gegenprobe. `benutzer` kommt aus der Sitzung, nie aus der Anfrage;
     * nur im gemeinsamen Zugang (ohne persoenliches Konto) gilt `verkauftVon` aus dem
     * Dialog. Produkt-ID und inventoryItemId werden gegen den frisch gelesenen Stand
     * geprueft.
     */
    async sonderpostenBestand(payload = {}, benutzer = null) {
      if (benutzer && benutzer.rolle !== 'inhaber') throw new ApiError(403, 'Bestandskorrekturen macht der Inhaber.');
      const persoenlich = Boolean(benutzer?.kuerzel && benutzer?.name);
      const angegeben = String(payload.verkauftVon ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
      if (!persoenlich && !angegeben) throw new ApiError(400, 'Bitte angeben, wer den Bestand geprüft hat.', { grund: 'name-fehlt' });
      const wer = persoenlich ? benutzer.name : angegeben;
      const zugang = await shopify();
      if (zugang?.art === 'sammeln') throw new ApiError(503, 'Kein Zugang zu Shopify eingerichtet – nichts geändert.', { grund: 'kein-zugang' });
      let r;
      const { produktId, inventoryItemId, laengeM, erwarteterBestand, operationId } = payload;
      try { r = await korrigiereRollenbestand(zugang.proxy, { produktId, inventoryItemId, laengeM, erwarteterBestand, operationId }); }
      catch (e) {
        if (!(e instanceof SonderpostenFehler)) throw e;
        if (e.extra?.grund === 'unklar') merke(persoenlich ? benutzer : null, wer, 'sonderposten-rollenbestand-unklar', `${payload.produktId} · Vorgang ${payload.operationId} · Ergebnis unklar, Bestand pruefen`);
        throw new ApiError(e.status, e.message, e.extra);
      }
      merke(persoenlich ? benutzer : null, wer, 'sonderposten-rollenbestand', `${r.titel} · gemessen ${r.laengeM} m bei ${r.breiteM} m Breite · physisch ${r.bestandVorher} → ${r.bestandErwartet} m² · ${payload.produktId} · Vorgang ${r.operationId}${r.ok ? '' : ' · Gegenprobe pruefen'}${persoenlich ? '' : ' · Name im gemeinsamen Zugang angegeben'}`);
      return r;
    },

    async sonderpostenVerkauft(payload, benutzer) {
      const { produktId, inventoryItemId, laengeM } = payload || {};
      if (!produktId) throw new ApiError(400, 'produktId ist Pflicht', { missing: ['produktId'] });
      const zugang = await shopify();
      if (zugang?.art === 'sammeln') throw new ApiError(503, 'Kein Zugang zu Shopify eingerichtet – hier kann nichts gebucht werden.', { grund: 'kein-zugang' });
      // Mit persoenlichem Konto zaehlt der Name aus der Sitzung, nie die Anfrage.
      // Im gemeinsamen Zugang (Einzelpasswort, benutzer null) sagt der Dialog,
      // wer verkauft hat - Inhaber 2026-10-10: im Laden bucht die verkaufende
      // Person, und das Protokoll soll sie nennen, nicht "Inhaber".
      // Persoenliches Konto = mit Kuerzel; der Notzugang meldet {name: 'Inhaber', kuerzel: null}.
      const persoenlich = Boolean(benutzer?.kuerzel && benutzer?.name);
      const angegeben = String(payload?.verkauftVon ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
      if (!persoenlich && !angegeben) throw new ApiError(400, 'Bitte angeben, wer verkauft hat.', { grund: 'name-fehlt' });
      const wer = persoenlich ? benutzer.name : angegeben;
      const zugangVermerk = persoenlich ? '' : ' · Name im gemeinsamen Zugang angegeben';
      // Im Protokoll steht die verkaufende Person, nicht der Platzhalter "Inhaber" des Notzugangs.
      const protokollBenutzer = persoenlich ? benutzer : null;
      // Restrolle: mit Laenge. Ob das Produkt wirklich eine Rolle ist, prueft
      // verkaufeVonRolle am frisch gelesenen Stand - nicht der Browser.
      if (laengeM !== undefined && laengeM !== null && laengeM !== '') {
        let r;
        try {
          r = await verkaufeVonRolle(zugang.proxy, { produktId: String(produktId), inventoryItemId: inventoryItemId ? String(inventoryItemId) : null, laengeM: Number(laengeM), jetzt: now() });
        } catch (e) {
          if (e instanceof SonderpostenFehler) {
            if (e.extra?.grund === 'unklar') merke(protokollBenutzer, wer, 'sonderposten-rolle-im-laden-verkauft-unklar', `${String(produktId)} · ${laengeM} m · Ergebnis unklar, Bestand pruefen`);
            throw new ApiError(e.status, e.message, e.extra);
          }
          throw e;
        }
        const pruef = r.gegenprobe === 'fehlgeschlagen' ? ' · Gegenprobe nicht lesbar' : (r.ok ? '' : ` · Gegenprobe: Bestand ${r.bestandNachher} statt ${r.bestandErwartet}`);
        merke(protokollBenutzer, wer, 'sonderposten-rolle-im-laden-verkauft', `${r.titel} · ${String(r.laengeM).replace('.', ',')} m = ${r.qm} m² · Bestand ${r.bestandVorher} → ${r.bestandErwartet} m² · ${String(produktId)}${pruef}${r.antwortVerloren ? ' · Antwort verloren, per Lesen bestaetigt' : ''}${zugangVermerk}`);
        return r;
      }
      let ergebnis;
      try {
        ergebnis = await verkaufeImLaden(zugang.proxy, { produktId: String(produktId), inventoryItemId: inventoryItemId ? String(inventoryItemId) : null, verkauftVon: wer, jetzt: now() });
      } catch (e) {
        if (e instanceof SonderpostenFehler) {
          // Ausgang offen: die Bestandsmutation kann angekommen sein. Wer wann
          // gebucht hat, gehoert dann trotzdem ins Protokoll.
          if (e.extra?.grund === 'unklar') merke(protokollBenutzer, wer, 'sonderposten-im-laden-verkauft-unklar', `${String(produktId)} · Ergebnis unklar, Bestand pruefen`);
          throw new ApiError(e.status, e.message, e.extra);
        }
        throw e;
      }
      const gegenprobe = ergebnis.gegenprobe === 'fehlgeschlagen'
        ? ' · Gegenprobe nicht lesbar'
        : (ergebnis.ok ? '' : ` · Gegenprobe: Bestand ${ergebnis.bestandNachher}${ergebnis.onlineGesperrt === false ? ', online nicht gesperrt' : ''}`);
      merke(protokollBenutzer, wer, 'sonderposten-im-laden-verkauft', `${ergebnis.sku || '–'} · ${String(produktId)}${gegenprobe}${ergebnis.antwortVerloren ? ' · Antwort verloren, per Lesen bestaetigt' : ''}${zugangVermerk}`);
      return ergebnis;
    },

    /** Erfuellungen (Sendungen) und Rueckerstattungen je Bestellung. */
    erfuellungListe() {
      const dir = privatDirPath || privatDir();
      const file = path.join(dir, 'erfuellung', 'erfuellung.json');
      const daten = readJsonIfExists(file);
      if (!daten || !Array.isArray(daten.eintraege)) {
        return { verfuegbar: false, quelle: file, hinweis: 'Noch keine Erfuellungsdaten exportiert.', befehl: 'npm run daten:aktualisieren -- --nur bestellungen' };
      }
      return { verfuegbar: true, quelle: file, ...daten };
    },

    /**
     * Stand je lokaler Datenquelle (Lexikon, Bestelluebersicht, Kennzahlen),
     * geschrieben von operations/scripts/aktualisieren.mjs
     * ($TP_PRIVAT_DIR/aktualisierung.json). Liefert rohe Zeitstempel plus
     * eine je Teil vorgerechnete Alters-Einschaetzung - die Oberflaeche
     * (docs/ai-dashboard/app.js, systemHealth()) zeigt daraus "Stand: …" und
     * warnt nach der Grenze je Quelle (lib/datenstand.mjs). Fehlt die Datei (noch nie gelaufen), ist das kein
     * Fehler, nur ein leerer Zustand mit dem Befehl, der sie anlegen wuerde.
     */
    aktualisierung() {
      return { ...leseAktualisierungsstand(), letzterKnopfLauf, arbeitsstand: arbeitsstand(privatDirPath || privatDir()), betrieb: betriebszustand(privatDirPath || privatDir(), { jetzt: now() }) };
    },

    /**
     * Startet `operations/scripts/aktualisieren.mjs` (npm run daten:aktualisieren)
     * als eigenen Kindprozess - fuer den Knopf "Jetzt aktualisieren" in Heute/
     * Einkauf, damit ein Mitarbeiter nach einem Kundenanruf sofort den
     * aktuellen Stand holen kann, statt auf den naechsten geplanten Lauf zu
     * warten (siehe docs/control-center/ARCHITEKTUR.md Abschnitt 10).
     *
     * Feste Argumentliste (node + Skriptpfad, keine Nutzereingabe) - kein
     * Shell-Einschleusen moeglich. Nur ein Lauf gleichzeitig: ein zweiter
     * Aufruf waehrend eines laufenden Prozesses startet nichts neu und meldet
     * `laeuft: true`. Schlaegt ein Teil fehl (z. B. kein Zugang), bleiben seine
     * Ausgabedatei und sein letzter erfolgreicher Stand erhalten; aktualisieren.mjs
     * vermerkt den Fehlschlag daneben als `letzterFehler` (standNachLauf), kein
     * stiller Fehlschlag.
     */
    aktualisierungStarten() {
      if (aktualisierungLauf) {
        return { gestartet: false, laeuft: true, seit: aktualisierungLauf.seit, hinweis: 'Aktualisierung läuft bereits.' };
      }
      if (!manuellerZugangVorhanden()) {
        throw new ApiError(503, 'Manueller Abruf nicht eingerichtet: Shopify-Zugang fehlt. Bitte den geplanten Export prüfen.');
      }
      const seit = now().toISOString();
      const skript = path.join(root, 'operations', 'scripts', 'aktualisieren.mjs');
      const lauf = { seit, fehler: null, fertig: false };
      aktualisierungLauf = lauf;
      audit({ action: 'aktualisierung-start' });
      execFileP(process.execPath, [skript], { cwd: root, timeout: 10 * 60_000, maxBuffer: 8 * 1024 * 1024 })
        .then(() => { lauf.fertig = true; })
        .catch(err => {
          lauf.fertig = true;
          // Exit 1 nach vollstaendigem Bericht heisst: einzelne Quellen scheiterten. Das steht
          // je Quelle in aktualisierung.json und im Systemzustand - kein Abbruch des Laufs.
          const ausgabe = String(err?.stdout || '');
          if (!err?.killed && !err?.signal && /^Aktualisierung: /m.test(ausgabe)) {
            const fehlgeschlagen = (ausgabe.match(/: FEHLER · /g) || []).length;
            logFehler('aktualisierung', `Knopf-Lauf seit ${seit}: ${fehlgeschlagen} Quelle(n) fehlgeschlagen (Einzelheiten im Systemzustand)`);
            return;
          }
          // Aus der Fehlerausgabe die Zeile mit der eigentlichen Meldung, nicht die Dateiposition davor.
          const zeilen = String(err?.stderr || '').split('\n').map(z => z.trim()).filter(Boolean);
          const meldung = zeilen.find(z => /^Fehler: |^[A-Za-z]*Error\b/.test(z)) || zeilen[0] || String(err?.message || err).split('\n')[0];
          lauf.fehler = err?.killed || err?.signal
            ? `nach ${Math.round((now() - new Date(seit)) / 1000)} s abgebrochen (${err.signal || 'Zeitlimit'})`
            : meldung.slice(0, 500);
          logFehler('aktualisierung', `Knopf-Lauf seit ${seit} abgebrochen: ${lauf.fehler}`);
        })
        .finally(() => {
          letzterKnopfLauf = { seit, bis: now().toISOString(), fehler: lauf.fehler };
          if (aktualisierungLauf === lauf) aktualisierungLauf = null;
        });
      return { gestartet: true, laeuft: true, seit };
    },

    /**
     * Status fuer den Knopf: laeuft gerade ein Prozess (seit wann), plus der
     * zuletzt geschriebene Stand je Datenquelle (dieselbe Form wie
     * `aktualisierung()`). Wird per Abfrage gepollt (kein Warten im Request).
     */
    aktualisierungStatus() {
      const stand = { ...leseAktualisierungsstand(), letzterKnopfLauf, arbeitsstand: arbeitsstand(privatDirPath || privatDir()), betrieb: betriebszustand(privatDirPath || privatDir(), { jetzt: now() }) };
      if (aktualisierungLauf) return { ...stand, laeuft: true, seit: aktualisierungLauf.seit };
      return { ...stand, laeuft: false, seit: null };
    },
  };

  function leseAktualisierungsstand() {
    const dir = privatDirPath || privatDir();
    const file = path.join(dir, 'aktualisierung.json');
    const daten = readJsonIfExists(file);
    const manuellVerfuegbar = manuellerZugangVorhanden();
    if (!daten || !daten.teile) {
      return { verfuegbar: false, quelle: file, hinweis: 'Noch kein Lauf von daten:aktualisieren vorhanden.', befehl: 'npm run daten:aktualisieren', manuellVerfuegbar };
    }
    const jetzt = now().getTime();
    const teile = {};
    for (const [teil, roh] of Object.entries(daten.teile)) {
      // Ein Fehlversuch, der AELTER ist als der letzte erfolgreiche Stand derselben Quelle,
      // ist ueberholt: die Daten wurden danach erneuert. Die Datei wird erst beim naechsten
      // Lauf aufgeraeumt - bis dahin warnte die Startseite vor einem behobenen Fehler.
      const stand = ohneUeberholtenFehler(roh);
      const alterMs = stand?.zeitpunkt ? jetzt - new Date(stand.zeitpunkt).getTime() : null;
      // Grenze je Quelle (lib/datenstand.mjs): Bestellungen nach 30 Minuten, Lexikon nach einem Tag.
      teile[teil] = { ...stand, alterMs, grenzeMs: grenzeFuer(teil), veraltet: alterMs === null ? null : alterMs > grenzeFuer(teil) };
    }
    return { verfuegbar: true, quelle: file, aktualisiertAm: daten.aktualisiertAm || null, teile, manuellVerfuegbar };
  }
}

/**
 * Rollenbreite in Metern. Shopify fuehrt custom.rollenbreite in Metern ("4.0");
 * die Mengenhilfe teilte frueher pauschal durch 100 und rechnete damit fuer
 * 20 m² auf einer 2-m-Rolle 1000 lfm statt 10. Werte ueber 10 sind Zentimeter.
 */
export function rollenbreiteInMetern(wert) {
  const n = Number(String(wert ?? '').replace(',', '.'));
  if (!(n > 0)) return null;
  return n > 10 ? n / 100 : n;
}

/**
 * Was die Trefferkarte zur Suche erklaert: die passende Farbe samt Farbnummer,
 * sobald die Suche nur einen Teil der Farben trifft ("Linie027 Kora 98"), und
 * den Namen beim Lieferanten, wenn der Treffer nicht schon am Shop-Titel liegt.
 */
function lexikonSuchHinweis(p, passendeVarianten, begriffe) {
  if (!begriffe.length) return { passend: [], passendMehr: 0, lieferantName: null };
  const echte = (p.varianten || []).filter(v => !v.wunschmass);
  const gezielt = passendeVarianten.filter(v => !v.wunschmass);
  const ueberTitel = nurUeberTitel(p, begriffe);
  const farbenVon = vs => new Set(vs.map(v => v.farbe || v.titel)).size;
  // Alle Farben passen: bei hoechstens drei Farben trotzdem nennen, wenn die Suche ueber
  // den Lieferanten kam - sonst fehlte gerade bei einfarbigen Produkten die Farbnummer.
  const nennen = gezielt.length && (gezielt.length < echte.length || (!ueberTitel && farbenVon(gezielt) <= 3));
  const je = new Map();
  if (nennen) {
    for (const v of gezielt) {
      const farbnummer = v.einkauf?.farbnummer ?? v.original?.farbnummer ?? null;
      const farbe = v.farbe || v.titel || null;
      const key = JSON.stringify([farbe, farbnummer]);
      if (!je.has(key)) je.set(key, { farbe, farbnummer, artikelnummer: v.einkauf?.artikelnummer ?? v.original?.artikelnummer ?? null });
    }
  }
  const passend = [...je.values()];
  const lieferantName = ueberTitel ? null
    : (echte.map(v => v.einkauf?.produktname || v.einkauf?.kollektion).find(Boolean) || null);
  return { passend: passend.slice(0, 3), passendMehr: Math.max(passend.length - 3, 0), lieferantName };
}

/** Zeilenform fuer die Trefferliste: Bild, Produktname, Produktgruppe, Anzahl Farben, Preis ab, Link-Zeichen. */
function lexikonListenEintrag(p) {
  const varianten = p.varianten || [];
  const farben = new Set(varianten.map(v => v.farbe).filter(Boolean));
  // Betrag und Einheit muessen aus derselben Variante kommen. Sonst stand an
  // einem Paketpreis die Einheit einer anderen Variante ("ab 19,50 €/m²",
  // obwohl 19,50 der Paketpreis war).
  const kandidaten = varianten
    .map(v => (v.preisJeEinheit && typeof v.preisJeEinheit.betrag === 'number')
      ? { betrag: v.preisJeEinheit.betrag, einheit: v.preisJeEinheit.einheit }
      : (typeof v.preis === 'number' ? { betrag: v.preis, einheit: null } : null))
    .filter(Boolean);
  const guenstigste = kandidaten.length
    ? kandidaten.reduce((a, b) => (b.betrag < a.betrag ? b : a))
    : null;
  const preisAb = guenstigste ? guenstigste.betrag : null;
  const preisEinheit = guenstigste ? guenstigste.einheit : null;
  // Muster haben "original" statt "link"; ein Produkt gilt als verlinkt, wenn
  // jede echte Variante einen Link hat bzw. jede Mustervariante ein Original.
  const linkRelevant = varianten.filter(v => v.link || v.original);
  const linkVorhanden = linkRelevant.length > 0 && linkRelevant.every(v => (v.link ? v.link.status === 'vorhanden' : v.original?.gefunden));
  return {
    handle: p.handle, titel: p.titel, produktgruppe: p.produktgruppe || null, bild: p.bild || null, status: p.status || null,
    farbenAnzahl: farben.size, preisAb, preisEinheit, linkVorhanden,
  };
}

export { STATUS_LABELS };
