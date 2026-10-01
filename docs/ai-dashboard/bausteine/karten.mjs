/**
 * Wiederkehrende Flaechen: Leerzustand, Stoerung, aufklappbare Karte, Zahl im Band.
 */
import { esc } from '../kern/helfer.mjs';

export function emptyState(title, hint, link) {
  return `<div class="empty"><strong>${esc(title)}</strong> ${esc(hint)}${link ? `<a href="${esc(link.href)}">${esc(link.text)}</a>` : ''}</div>`;
}

/**
 * Stoerung statt Leere. Eine fehlgeschlagene Abfrage sah bisher genauso aus
 * wie "nichts zu tun" - man wartete auf Arbeit, die nie kam.
 */
export function stoerungState(d, was = 'Diese Daten') {
  return `<div class="notice crit"><strong>${esc(was)} konnten nicht geladen werden.</strong>
    ${esc(d?.hinweis || 'Unbekannter Fehler')}
    <button type="button" class="btn btn-sm" data-action="reload" style="margin-left:8px">Nochmal versuchen</button></div>`;
}

/**
 * Aufklappbarer Kartenabschnitt fuer die Startseite: haelt weniger dringende
 * Inhalte standardmaessig eingeklappt, damit "Heute" in eine Bildschirmhoehe
 * passt. Merkt sich je Abschnitt (id), ob der/die Nutzer:in ihn geoeffnet hat.
 * Kopfzeile ist bewusst kein Flex-Space-Between mit dem Browser-Aufklapp-
 * Zeichen als drittem Element (das zentriert sonst den Titel) - Chevron ist
 * ein eigenes Element links, die Vorschau-Zahl rechts via margin-left:auto.
 */
export function collapsibleCard(id, title, preview, bodyHtml, { openByDefault = false } = {}) {
  let open = openByDefault;
  try { const v = localStorage.getItem(`tp-heute-${id}`); if (v !== null) open = v === '1'; } catch {}
  return `<details class="card section" data-collapsible="${esc(id)}" ${open ? 'open' : ''}>
    <summary class="collapsible-head"><span class="chev" aria-hidden="true">›</span><h2>${title}</h2>${preview ? `<span class="preview">${preview}</span>` : ''}</summary>
    <div class="details-body">${bodyHtml}</div>
  </details>`;
}

/** Kachel im Zahlenband. 0 wird grau, damit echte Zahlen hervorstechen. */
export function bandItem(n, label, cls, href) {
  const inner = `<span class="n">${esc(n)}</span><span class="l">${esc(label)}</span>`;
  const klasse = n === 0 ? 'zero' : cls;
  return href ? `<a href="${href}" class="${klasse}">${inner}</a>` : `<div class="${klasse}">${inner}</div>`;
}
