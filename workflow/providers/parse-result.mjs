/**
 * Extrahiert das strukturierte Agentenresultat aus dem Rohtext eines Providers.
 *
 * Reihenfolge der Strategien (bewusst konservativ):
 * 1. Marker-Block <<<AGENT_RESULT>>> ... <<<END_AGENT_RESULT>>>
 * 2. Letzter ```json-Fence
 * 3. Letztes balanciertes Top-Level-JSON-Objekt mit "status"
 *
 * Findet nichts davon ein Ergebnis, wird NICHT geraten: der Aufrufer bekommt
 * null und stuft das als FAILED ein. Ein Agent, der sein Format nicht einhaelt,
 * darf niemals als PASS durchgehen.
 */

const START_MARKER = '<<<AGENT_RESULT>>>';
const END_MARKER = '<<<END_AGENT_RESULT>>>';

function tryParse(candidate) {
  if (!candidate || !candidate.trim()) return null;
  try {
    const value = JSON.parse(candidate);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function fromMarkers(text) {
  const start = text.lastIndexOf(START_MARKER);
  if (start === -1) return null;
  const end = text.indexOf(END_MARKER, start);
  const body = end === -1 ? text.slice(start + START_MARKER.length) : text.slice(start + START_MARKER.length, end);
  return tryParse(body.trim());
}

function fromJsonFence(text) {
  const fences = [...text.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/gi)];
  for (let index = fences.length - 1; index >= 0; index -= 1) {
    const parsed = tryParse(fences[index][1]);
    if (parsed) return parsed;
  }
  return null;
}

/** Scannt ruecklaeufig nach dem letzten balancierten { ... } mit "status". */
function fromBalancedObject(text) {
  for (let end = text.lastIndexOf('}'); end !== -1; end = text.lastIndexOf('}', end - 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let start = end; start >= 0; start -= 1) {
      const character = text[start];
      if (escaped) { escaped = false; continue; }
      if (character === '\\') { escaped = true; continue; }
      if (character === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (character === '}') depth += 1;
      else if (character === '{') {
        depth -= 1;
        if (depth === 0) {
          const parsed = tryParse(text.slice(start, end + 1));
          if (parsed && 'status' in parsed) return parsed;
          break;
        }
      }
    }
  }
  return null;
}

/**
 * @param {string} rawText Rohausgabe des Providers.
 * @returns {object|null} Rohes Resultatobjekt oder null, wenn keins gefunden.
 */
export function extractAgentResult(rawText) {
  const text = String(rawText ?? '');
  if (!text.trim()) return null;
  return fromMarkers(text) ?? fromJsonFence(text) ?? fromBalancedObject(text);
}
