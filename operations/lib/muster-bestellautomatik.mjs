/** Freigegebene kostenlose Muster bestellen; vorhandene Vorlagen, Postfach und Positionsstatus verwenden. */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { bestellmail } from './lieferanten.mjs';
import { vorbereitungStand } from './bestellvorbereitung.mjs';
import { LAGER_ART_WERTE } from './musterlager.mjs';
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
const offen = e => !e?.status;
function vorlageFuer(k, a, lieferant, positionen) {
  const ids = new Set(positionen.map(p => positionKey(p.orderId, p.lineItemId)));
  const modell = { ...k.modell, auftraege: [a], gruppen: [], musterGruppen: k.modell.musterGruppen.map(g => ({ ...g, positionen: g.positionen.filter(p => ids.has(positionKey(p.orderId, p.lineItemId))) })).filter(g => g.positionen.length) };
  return bestellmail({ modell, lieferant, art: 'muster', statusAlle: k.statusAlle, stammdaten: k.stammdaten }).mails[0];
}
export function musterAutomatikPlan(k, katalog, konfig, journal, jetzt = new Date()) {
  const geplant = [], klaeren = [];
  if (konfig.aktiv !== true) return { geplant, klaeren };
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
      let grund = null;
      if (Date.parse(a.datum) < Date.parse(konfig.ab) || !Number.isFinite(Date.parse(a.datum))) grund = 'Ältere Anfrage: bisherigen Bestellstand prüfen';
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
    const plan = musterAutomatikPlan(k, katalog, konfig, journal, jetzt);
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
      if (!['gesendet', 'vermerkt'].includes(s.status)) z.klaeren.push({ grund: 'Mailversand nicht sicher bestätigt. Vor erneutem Bestellen im Postfach prüfen.' });
    }
    for (const p of plan.geplant) fuer(p.orderId).geplant += p.mail.positionen.length;
    for (const p of plan.klaeren) fuer(p.orderId).klaeren.push({ titel: p.titel, farbe: p.farbe, grund: p.grund });
    return { aktiv: konfig.aktiv === true, hinweis: lauf.hinweis || journal.letzterLauf?.hinweis || null, auftraege };
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
    const plan = musterAutomatikPlan(k, katalog(), konfig, journal, jetzt);
    if (probe) return { status: 'probe', geplant: plan.geplant.length, klaeren: plan.klaeren.length, verschickt: 0 };
    const pf = lesePostfach(postfachPfad(dir));
    if (!pf.zugang) { journal.letzterLauf = { am: jetzt.toISOString(), hinweis: pf.hinweis }; sichern(); return { status: 'postfach-fehlt', verschickt: 0 }; }
    let verschickt = 0;
    for (const p of plan.geplant) {
      // Nach jedem await neu: Mengen, Lager, Zuordnung, Empfaenger und Bearbeiter koennen sich aendern.
      const freigabe = musterAutomatikDaten(dir).konfig;
      pruefeMusterAblage(dir);
      const frischerKontext = kontext();
      if (!frischerKontext.exportGueltig || jetzt.getTime() - fs.statSync(quelle).mtimeMs > 20 * 60_000) break;
      const frisch = musterAutomatikPlan(frischerKontext, katalog(), freigabe, journal, jetzt).geplant.find(x => x.orderId === p.orderId && x.lieferant === p.lieferant && x.stand === p.stand);
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
