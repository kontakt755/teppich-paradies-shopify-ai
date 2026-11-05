/** Freigegebene kostenlose Muster bestellen; vorhandene Vorlagen, Postfach und Positionsstatus verwenden. */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { bestellmail } from './lieferanten.mjs';
import { vorbereitungStand } from './bestellvorbereitung.mjs';
import { LAGER_ART_WERTE, musterSchluessel } from './musterlager.mjs';
import { mustersperrePfad, leseSperren, stand as sperrStand } from './mustersperre.mjs';
import { musterOhneLieferant } from './musterherkunft.mjs';
import { auftragsstatusPfad, positionKey, leseAlle, schreibeAlle, setzeStatusPositionen } from './auftragsstatus.mjs';
import { lesePostfach, postfachPfad } from './nachfass-versand.mjs';
import { sendeMail, adresse } from './smtp.mjs';

const ACTOR = 'Musterautomatik';
const UEBERNAHME = 'musterautomatik';
const pfad = (dir, name) => path.join(dir, 'muster-bestellung', `${name}.json`);
function lesen(file, fallback) {
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
    return v;
  } catch (e) { if (e.code === 'ENOENT') return fallback; throw new Error('Musterautomatik: Ablage nicht lesbar. Bitte prüfen.'); }
}
function schreiben(file, wert) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(wert, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}
function pruefeMusterAblage(dir) {
  const lager = lesen(path.join(dir, 'musterlager.json'), { eintraege: [], entfernt: [] });
  if (!Array.isArray(lager.eintraege) || lager.eintraege.some(e => !e || typeof e.id !== 'string' || !Array.isArray(e.schluessel) || !LAGER_ART_WERTE.includes(e.art))) throw new Error('Musterautomatik: Musterlager beschädigt.');
  const herkunft = lesen(path.join(dir, 'musterherkunft.json'), { ereignisse: [] });
  if (!Array.isArray(herkunft.ereignisse) || herkunft.ereignisse.some(e => !e || !e.orderId || !['lieferant', 'eigen_versand', 'eigen_vorbei'].includes(e.herkunft))) throw new Error('Musterautomatik: Musterherkunft beschädigt.');
}
export function musterAutomatikDaten(dir) {
  const konfig = lesen(pfad(dir, 'konfiguration'), { aktiv: false });
  const journal = lesen(pfad(dir, 'versand'), { version: 1, sendungen: [] });
  if (!Array.isArray(journal.sendungen) || journal.sendungen.some(s => !s || !Array.isArray(s.positionen) || !['sendet', 'gesendet', 'vermerkt', 'unklar'].includes(s.status) || !s.id || !s.orderId)) throw new Error('Musterautomatik: Versandprotokoll beschädigt.');
  if (konfig.aktiv === true && (!Number.isFinite(Date.parse(konfig.ab)) || !konfig.lieferanten || typeof konfig.lieferanten !== 'object')) throw new Error('Musterautomatik: Freigabe unvollständig.');
  return { konfig, journal };
}
/**
 * Aktive Sperren je `M-<SKU>`, auch die im Shop noch nicht bestaetigten - gemeldet "kommt nicht" ist
 * gemeldet. Nur eine fehlende oder leere Datei heisst "keine Sperre" (leseSperren). Alles andere wirft:
 * der Aufrufer haelt an, damit eine kaputte Sperrliste nicht still jedes Muster freigibt.
 */
function aktiveSperren(dir) {
  try { return sperrStand(leseSperren(mustersperrePfad(dir))); }
  catch (e) { throw new Error(`Automatische Musterbestellung angehalten: Sperrliste nicht lesbar. ${e.message}`); }
}
const offen = e => !e?.status;

/**
 * Seit wann haengt ein Muster aus demselben Grund? Der Plan selbst ist zustandslos, deshalb merkt sich
 * der Lauf den ersten Zeitpunkt je Position. Nur eine Stoppuhr: unlesbar gilt sie als leer und sperrt
 * nie den Versand - ohne passenden Eintrag zaehlt das Bestelldatum (musterAutomatikAnzeige).
 */
function leseKlaerStand(dir) {
  try {
    const v = lesen(pfad(dir, 'klaerstand'), { faelle: {} }).faelle;
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}
function merkeKlaerStand(dir, plan, jetzt) {
  const alt = leseKlaerStand(dir), faelle = {};
  for (const p of plan.klaeren) {
    const key = positionKey(p.orderId, p.lineItemId), e = alt[key];
    faelle[key] = e?.grund === p.grund && Number.isFinite(Date.parse(e.seit)) ? e : { grund: p.grund, seit: jetzt.toISOString() };
  }
  if (JSON.stringify(alt) !== JSON.stringify(faelle)) schreiben(pfad(dir, 'klaerstand'), { faelle });
}
function vorlageFuer(k, a, lieferant, positionen) {
  const ids = new Set(positionen.map(p => positionKey(p.orderId, p.lineItemId)));
  const modell = { ...k.modell, auftraege: [a], gruppen: [], musterGruppen: k.modell.musterGruppen.map(g => ({ ...g, positionen: g.positionen.filter(p => ids.has(positionKey(p.orderId, p.lineItemId))) })).filter(g => g.positionen.length) };
  return bestellmail({ modell, lieferant, art: 'muster', statusAlle: k.statusAlle, stammdaten: k.stammdaten }).mails[0];
}
export function musterAutomatikPlan(k, katalog, konfig, journal, sperren) {
  const geplant = [], klaeren = [];
  if (konfig.aktiv !== true) return { geplant, klaeren };
  // Pflichtangabe ohne Vorgabewert: ein vergessenes Argument darf nicht "nichts gesperrt" bedeuten.
  if (!(sperren instanceof Map)) throw new Error('Musterautomatik: Sperrliste fehlt.');
  const katalogMap = new Map(katalog.map(p => [p.handle, p]));
  const versucht = new Set(journal.sendungen.flatMap(s => s.positionen.map(p => positionKey(p.orderId, p.lineItemId))));
  for (const a of k.modell?.auftraege || []) {
    if (!a.offen || a.storniert || a.testbestellung) continue;
    const gruppen = new Map();
    for (const g of k.modell.musterGruppen || []) for (const p of g.positionen) {
      if (p.orderId !== a.id || !p.istMuster || musterOhneLieferant(p) || p.musterLager) continue;
      const key = positionKey(p.orderId, p.lineItemId), e = k.statusAlle[key];
      if (!offen(e) || versucht.has(key)) continue;
      const regel = konfig.lieferanten[g.lieferant];
      const quelle = katalogMap.get(p.musterQuelle?.produktHandle || p.handle);
      const st = k.stammdaten.lieferanten[g.lieferant]?.muster;
      const schluessel = musterSchluessel(p);
      let grund = null;
      // Zuerst: kein anderer Klaerfall darf verdecken, warum dieses Muster nie angefragt wird.
      if (schluessel && sperren.has(`M-${schluessel}`)) grund = 'Im Shop gesperrt: wird beim Lieferanten nicht angefragt';
      else if (Date.parse(a.datum) < Date.parse(konfig.ab) || !Number.isFinite(Date.parse(a.datum))) grund = 'Ältere Anfrage: bisherigen Bestellstand prüfen';
      else if (a.bezahlt !== 'PAID') grund = 'Zahlung oder Rückerstattung prüfen';
      else if (e?.uebernahme || e?.zurueckGesetztAm || e?.beschaffung) grund = 'Bereits in Bearbeitung: bitte prüfen';
      else if (!regel || regel.kostenlos !== true || !Array.isArray(regel.produktgruppen) || !regel.produktgruppen.includes(quelle?.produktgruppe)) grund = 'Musterweg oder Kosten noch zu klären';
      else if (!st || st.weg !== 'mail' || !adresse(st.mail) || st.mail !== regel.empfaenger || st.lieferung !== regel.lieferziel) grund = 'Empfänger oder Lieferziel geändert: bitte prüfen';
      else if (!p.musterQuelle?.farbnummer || p.musterQuelle.farbnummer === 'UNGEKLAERT') grund = 'Farbnummer fehlt';
      else if (st.nachBezeichnung && !p.musterQuelle?.bezeichnung) grund = 'Herstellerbezeichnung fehlt';
      else if (!Number.isInteger(p.bestellmenge?.menge) || p.bestellmenge.menge < 1 || p.bestellmenge.menge > 3) grund = 'Mustermenge prüfen';
      if (grund) { klaeren.push({ orderId: a.id, lineItemId: p.lineItemId, titel: p.titel, farbe: p.farbe, grund }); continue; }
      if (!gruppen.has(g.lieferant)) gruppen.set(g.lieferant, []);
      gruppen.get(g.lieferant).push(p);
    }
    for (const [lieferant, positionen] of gruppen) {
      const mail = vorlageFuer(k, a, lieferant, positionen);
      if (!mail?.positionen.length || mail.fehlt.length || !mail.text || !mail.betreff || mail.positionen.length !== positionen.length) {
        for (const p of positionen) klaeren.push({ orderId: a.id, lineItemId: p.lineItemId, titel: p.titel, farbe: p.farbe, grund: 'Bestellangaben unvollständig' });
      } else geplant.push({ orderId: a.id, orderName: a.name, lieferant, mail, stand: vorbereitungStand({ mails: [mail] }) });
    }
  }
  return { geplant, klaeren };
}

/** Nur lesend: vom Browser direkt je Kunde nutzbar, ohne Zugangsdaten oder Mailtexte. */
export function musterAutomatikAnzeige(dir, k, katalog, jetzt = new Date()) {
  try {
    const { konfig, journal } = musterAutomatikDaten(dir);
    const lauf = lesen(pfad(dir, 'laufstatus'), {});
    // Kaputte Sperrliste: kein Plan, aber was schon bestellt ist, bleibt sichtbar.
    let sperren = null, sperrHinweis = null;
    if (konfig.aktiv === true) try { sperren = aktiveSperren(dir); } catch (e) { sperrHinweis = e.message; }
    const plan = sperrHinweis ? { geplant: [], klaeren: [] } : musterAutomatikPlan(k, katalog, konfig, journal, sperren);
    const auftraege = {};
    const fuer = id => auftraege[id] ||= { bestellt: [], klaeren: [], geplant: 0 };
    for (const s of journal.sendungen) {
      const z = fuer(s.orderId);
      if (['gesendet', 'vermerkt'].includes(s.status)) z.bestellt.push({ am: s.am, an: s.an, lieferziel: s.lieferziel, positionen: s.positionen.map(p => ({ titel: p.titel, farbe: p.farbe, menge: p.menge })) });
      const a = k.modell?.auftraege?.find(a => a.id === s.orderId);
      if (a?.storniert || (a && a.bezahlt !== 'PAID')) z.klaeren.push({ grund: 'Kundenbestellung nach Musterbestellung storniert oder Zahlung geändert. Lieferantenbestellung prüfen.' });
      for (const p of s.positionen) {
        const aktuell = a?.positionen?.find(x => x.lineItemId === p.lineItemId);
        if (['gesendet', 'vermerkt'].includes(s.status) && a?.offen && aktuell && (aktuell.bestellmenge?.menge !== p.menge || aktuell.grosshaendlerId !== p.artikelnummer)) z.klaeren.push({ grund: 'Bestellumfang nach dem Mailversand geändert. Bereits bestellte Muster vor Nachbestellung prüfen.' });
      }
      if (!['gesendet', 'vermerkt'].includes(s.status)) z.klaeren.push({ lineItemIds: s.positionen.map(p => p.lineItemId), seit: s.am, grund: 'Mailversand nicht sicher bestätigt. Vor erneutem Bestellen im Postfach prüfen.' });
    }
    for (const p of plan.geplant) fuer(p.orderId).geplant += p.mail.positionen.length;
    const klaerStand = leseKlaerStand(dir);
    const bestelltAm = new Map((k.modell?.auftraege || []).map(a => [a.id, a.datum]));
    for (const p of plan.klaeren) {
      const e = klaerStand[positionKey(p.orderId, p.lineItemId)];
      fuer(p.orderId).klaeren.push({ lineItemIds: [p.lineItemId], titel: p.titel, farbe: p.farbe, grund: p.grund, seit: e?.grund === p.grund ? e.seit : bestelltAm.get(p.orderId) || null });
    }
    return { aktiv: konfig.aktiv === true, hinweis: sperrHinweis || lauf.hinweis || journal.letzterLauf?.hinweis || null, auftraege };
  } catch (e) { return { aktiv: false, hinweis: e.message, auftraege: {} }; }
}

/** Ein Prozess schreibt; vor SMTP wird jeder Versuch dauerhaft reserviert. Nie automatisch erneut senden. */
export async function musterAutomatikLauf({ dir, kontext, katalog, jetzt = new Date(), probe = false, senden = sendeMail }) {
  fs.mkdirSync(path.dirname(pfad(dir, 'versand')), { recursive: true });
  const lock = pfad(dir, 'lauf');
  const besitz = { pid: process.pid, kennung: randomUUID() };
  const temp = `${lock}.${besitz.kennung}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(besitz), { flag: 'wx', mode: 0o600 });
    fs.linkSync(temp, lock);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const wache = `${lock}.raeumen`;
    let f;
    try { f = fs.openSync(wache, 'wx', 0o600); } catch (err) { if (err.code === 'EEXIST') return { status: 'laeuft', verschickt: 0 }; throw err; }
    let entfernt = false;
    try {
      const alt = lesen(lock, {});
      if (!Number.isInteger(alt.pid) || alt.pid < 1) throw new Error('Musterautomatik: Laufsperre prüfen.');
      try { process.kill(alt.pid, 0); } catch (err) {
        if (err.code === 'ESRCH') { fs.unlinkSync(lock); entfernt = true; }
      }
    } finally { fs.closeSync(f); fs.unlinkSync(wache); }
    if (entfernt) return musterAutomatikLauf({ dir, kontext, katalog, jetzt, probe, senden });
    return { status: 'laeuft', verschickt: 0 };
  } finally { try { fs.unlinkSync(temp); } catch { /* nicht erzeugt */ } }
  try {
    const { konfig, journal } = musterAutomatikDaten(dir);
    if (konfig.aktiv !== true) return { status: 'inaktiv', verschickt: 0 };
    // Diese beiden Loader tolerieren andernorts Altdateien. Hier muss ein Lesefehler sperren.
    pruefeMusterAblage(dir);
    const statusFile = auftragsstatusPfad(dir);
    const sichern = () => schreiben(pfad(dir, 'versand'), journal);
    const vermerken = s => {
      const alle = leseAlle(statusFile);
      const angaben = s.positionen.filter(p => offen(alle[positionKey(s.orderId, p.lineItemId)])).map(p => ({ orderId: s.orderId, lineItemId: p.lineItemId, status: 'bestellt', actor: ACTOR, jetzt: new Date(s.am), ueber: s.lieferziel === 'kunde' ? 'kunde' : null, notiz: `Automatisch per E-Mail bestellt an ${s.an}. Nachricht ${s.messageId}` }));
      setzeStatusPositionen(statusFile, angaben);
      const frisch = leseAlle(statusFile);
      for (const p of s.positionen) { const e = frisch[positionKey(s.orderId, p.lineItemId)]; if (e?.uebernahme?.id === UEBERNAHME) e.uebernahme = null; }
      schreibeAlle(statusFile, frisch);
      s.status = 'vermerkt'; sichern();
    };
    if (!probe) for (const s of journal.sendungen) if (s.status === 'gesendet') vermerken(s);
    const quelle = path.join(dir, 'bestelluebersicht', 'orders.json');
    const alter = jetzt.getTime() - fs.statSync(quelle).mtimeMs;
    const k = kontext();
    if (!k.exportGueltig || !k.modell || alter > 20 * 60_000 || alter < -60_000) {
      if (!probe) { journal.letzterLauf = { am: jetzt.toISOString(), hinweis: 'Bestelldaten nicht aktuell. Automatische Musterbestellung wartet auf den Datenabgleich.' }; sichern(); }
      return { status: 'daten-fehlen', verschickt: 0 };
    }
    const anhalten = (hinweis, verschickt = 0) => {
      if (!probe) { journal.letzterLauf = { am: jetzt.toISOString(), verschickt, hinweis }; sichern(); }
      return { status: 'sperrliste-unlesbar', verschickt, hinweis };
    };
    let sperren;
    try { sperren = aktiveSperren(dir); } catch (e) { return anhalten(e.message); }
    const plan = musterAutomatikPlan(k, katalog(), konfig, journal, sperren);
    if (probe) return { status: 'probe', geplant: plan.geplant.length, klaeren: plan.klaeren.length, verschickt: 0 };
    merkeKlaerStand(dir, plan, jetzt);
    const pf = lesePostfach(postfachPfad(dir));
    if (!pf.zugang) { journal.letzterLauf = { am: jetzt.toISOString(), hinweis: pf.hinweis }; sichern(); return { status: 'postfach-fehlt', verschickt: 0 }; }
    let verschickt = 0;
    for (const p of plan.geplant) {
      // Nach jedem await neu: Mengen, Lager, Sperren, Zuordnung, Empfaenger und Bearbeiter koennen sich aendern.
      const freigabe = musterAutomatikDaten(dir).konfig;
      pruefeMusterAblage(dir);
      const frischerKontext = kontext();
      if (!frischerKontext.exportGueltig || jetzt.getTime() - fs.statSync(quelle).mtimeMs > 20 * 60_000) break;
      let frischeSperren;
      try { frischeSperren = aktiveSperren(dir); } catch (e) { return anhalten(e.message, verschickt); }
      const frisch = musterAutomatikPlan(frischerKontext, katalog(), freigabe, journal, frischeSperren).geplant.find(x => x.orderId === p.orderId && x.lieferant === p.lieferant && x.stand === p.stand);
      if (!frisch) continue;
      const s = { id: randomUUID(), orderId: p.orderId, orderName: p.orderName, lieferant: p.lieferant, an: p.mail.an, lieferziel: p.mail.lieferziel, am: jetzt.toISOString(), status: 'sendet', positionen: p.mail.positionen, messageId: `<${randomUUID()}@${pf.zugang.absender.split('@')[1]}>` };
      journal.sendungen.push(s); sichern();
      const alle = leseAlle(statusFile);
      for (const z of s.positionen) { const key = positionKey(s.orderId, z.lineItemId); alle[key] = { ...(alle[key] || {}), orderId: s.orderId, lineItemId: z.lineItemId, uebernahme: { id: UEBERNAHME, person: ACTOR, seit: s.am } }; }
      schreibeAlle(statusFile, alle);
      try {
        await senden(pf.zugang, { von: { name: pf.zugang.absenderName, adresse: pf.zugang.absender }, an: [s.an], betreff: p.mail.betreff, text: p.mail.text, messageId: s.messageId, datum: jetzt });
      } catch {
        s.status = 'unklar'; sichern(); continue;
      }
      s.status = 'gesendet'; sichern();
      verschickt++;
      vermerken(s);
    }
    journal.letzterLauf = { am: jetzt.toISOString(), verschickt, hinweis: null }; sichern();
    schreiben(pfad(dir, 'laufstatus'), { hinweis: null });
    return { status: 'ok', verschickt, klaeren: plan.klaeren.length };
  } catch (e) {
    if (!probe) schreiben(pfad(dir, 'laufstatus'), { hinweis: 'Automatische Musterbestellung unterbrochen. Bestellstand und Ablage prüfen.' });
    throw e;
  } finally { if (lesen(lock, {}).kennung === besitz.kennung) fs.unlinkSync(lock); }
}
