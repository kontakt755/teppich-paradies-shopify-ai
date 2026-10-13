/** Kleine gemeinsame Regeln fuer manuell bestaetigten Einkauf - ohne DOM oder Dateizugriff. */
export function personId(person, fallback = '') {
  return String(person?.id || person?.kuerzel || person?.name || fallback).trim();
}

export function restmenge(eintrag) {
  const w = eintrag?.beschaffung?.wareneingang;
  return w && Number.isFinite(w.soll) && Number.isFinite(w.verwendbar)
    ? Math.max(0, Math.round((w.soll - w.verwendbar) * 1e6) / 1e6) : null;
}

export function lieferterminFaellig(eintrag, heute) {
  const termin = eintrag?.beschaffung?.liefertermin;
  return eintrag?.status === 'bestellt' && typeof termin === 'string' && termin < heute;
}

/** Eine bestaetigte Fehlmenge darf nicht durch einen alten Sammelknopf verschwinden. */
export function darfWeiter(eintrag, status) {
  return !['geliefert', 'raus', 'erledigt'].includes(status) || !(restmenge(eintrag) > 0);
}

export function uebernahmeText(eintrag) {
  const u = eintrag?.uebernahme;
  return u?.person ? `Übernommen von ${u.person}` : '';
}
export function einheitText(einheit) {
  return ({ paket: 'Pakete', stueck: 'Stück', muster: 'Muster', lfm: 'lfm', m2: 'm²' })[einheit] || 'Einheiten';
}

export function beschaffungText(eintrag) {
  const b = eintrag?.beschaffung;
  if (!b) return '';
  const teile = [];
  if (b.liefertermin) teile.push(`Bestätigter Liefertermin ${b.liefertermin.split('-').reverse().join('.')}`);
  const w = b.wareneingang;
  if (w) {
    const n = v => Number(v).toLocaleString('de-DE', { maximumFractionDigits: 6 });
    teile.push(`${n(w.verwendbar)} von ${n(w.soll)} ${einheitText(w.einheit)} verwendbar`);
    if (restmenge(eintrag) > 0) teile.push(`${n(restmenge(eintrag))} ${einheitText(w.einheit)} fehlen`);
    if (w.angekommen > w.verwendbar) teile.push(`${n(w.angekommen - w.verwendbar)} ${einheitText(w.einheit)} nicht verwendbar`);
    if (b.grund) teile.push(b.grund);
  }
  return teile.join(' · ');
}
