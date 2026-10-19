/**
 * Anzeige des Claude-Verbrauchs (#671) - ohne DOM, damit testbar.
 */

/** "claude-opus-5-5" -> "Opus 5.5", "claude-haiku-4-5-20251001" -> "Haiku 4.5". */
export function modellName(id) {
  const m = String(id || '').match(/^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?(\[1m\])?$/);
  if (!m) return String(id || 'unbekannt');
  return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ''}${m[4] ? ' (1M)' : ''}`;
}

/** Grosse Tokenzahlen lesbar: 14,1 Mrd. / 24,9 Mio. / 12 Tsd. */
export function tokenText(n) {
  if (!Number.isFinite(n)) return '–';
  const f = (v, d) => v.toLocaleString('de-DE', { maximumFractionDigits: d, minimumFractionDigits: 0 });
  if (n >= 1e9) return `${f(n / 1e9, 1)} Mrd.`;
  if (n >= 1e6) return `${f(n / 1e6, 1)} Mio.`;
  if (n >= 1e4) return `${f(n / 1e3, 0)} Tsd.`;
  return f(n, 0);
}
