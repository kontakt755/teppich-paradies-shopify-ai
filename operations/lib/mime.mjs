/**
 * MIME-Zerlegung ohne Fremdabhaengigkeit, fuer das Rechnungs-Archiv (belege:monat): eine rohe
 * Mail (Buffer) wird zu Kopf, Text und Anhaengen. Anhaenge bleiben Bytes - die Datei auf der
 * Platte ist genau das, was der Absender geschickt hat.
 *
 * Eingabe ist fremde Mail: Dateinamen werden hier nur dekodiert, nicht vertraut
 * (sicherer Dateiname: belege.mjs). Kaputte Teile brechen nicht ab, sie fehlen dann oder
 * werden roh uebernommen.
 */

const MAX_TIEFE = 20;

/** Bytes zu Text; unbekannter Zeichensatz faellt auf latin1 zurueck. */
export function textAusBytes(bytes, zeichensatz = 'utf-8') {
  const cs = String(zeichensatz || 'utf-8').trim().toLowerCase();
  try {
    return new TextDecoder(cs === 'us-ascii' ? 'utf-8' : cs).decode(bytes);
  } catch {
    return Buffer.from(bytes).toString('latin1');
  }
}

/** Quoted-Printable zu Bytes. Eingabe als latin1-String (ein Zeichen = ein Byte). */
export function quotedPrintable(roh, { kopf = false } = {}) {
  const s = kopf ? roh.replace(/_/g, ' ') : roh.replace(/=\r?\n/g, '');
  const raus = Buffer.alloc(s.length);
  let n = 0;
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === '=' && /^[0-9a-f]{2}$/i.test(s.slice(i + 1, i + 3))) {
      raus[n++] = parseInt(s.slice(i + 1, i + 3), 16);
      i += 2;
    } else {
      raus[n++] = s.charCodeAt(i) & 0xff;
    }
  }
  return raus.subarray(0, n);
}

/** Kopfzeile dekodieren: =?utf-8?B?...?=, =?iso-8859-1?Q?...?=, auch mehrere hintereinander. */
export function kopfText(wert) {
  // Rohe 8-Bit-Zeichen stehen als latin1 im String; meist sind es in Wahrheit UTF-8-Bytes.
  let s = String(wert ?? '');
  if (/[\x80-\xff]/.test(s)) {
    try { s = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(s, 'latin1')); } catch { /* bleibt latin1 */ }
  }
  return s
    .replace(/(=\?[^?\s]+\?[bq]\?[^?\s]*\?=)\s+(?==\?[^?\s]+\?[bq]\?)/gi, '$1')
    .replace(/=\?([^?\s]+)\?([bq])\?([^?\s]*)\?=/gi, (_, cs, art, inhalt) => {
      const bytes = art.toLowerCase() === 'b' ? Buffer.from(inhalt, 'base64') : quotedPrintable(inhalt, { kopf: true });
      return textAusBytes(bytes, cs.replace(/\*.*$/, ''));
    });
}

/** Kopf (latin1-String) zu Map: kleiner Name -> Liste der Werte, Faltung aufgeloest. */
export function kopfZerlegen(roh) {
  const kopf = new Map();
  for (const zeile of String(roh).replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const m = /^([!-9;-~]+):[ \t]*(.*)$/.exec(zeile);
    if (!m) continue;
    const name = m[1].toLowerCase();
    if (!kopf.has(name)) kopf.set(name, []);
    kopf.get(name).push(m[2]);
  }
  return kopf;
}

/**
 * Wert mit Parametern: `multipart/mixed; boundary="x"`, auch RFC 2231
 * (filename*=UTF-8''Rechnung%20Nr.pdf, filename*0*=...; filename*1*=...).
 */
export function parameterZerlegen(wert) {
  const s = String(wert ?? '');
  const ende = s.indexOf(';');
  const haupt = (ende < 0 ? s : s.slice(0, ende)).trim().toLowerCase();
  const stuecke = new Map();
  const einfach = new Map();
  const re = /;\s*([^\s=;]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^;]*))/g;
  for (const m of s.matchAll(re)) {
    const roh = m[2] !== undefined ? m[2].replace(/\\(.)/g, '$1') : m[3].trim();
    const teil = /^([^*]+)(?:\*(\d+))?(\*)?$/.exec(m[1]);
    if (!teil) continue;
    const name = teil[1].toLowerCase();
    // filename= neben filename*=: zwei Fassungen desselben Werts, keine Fortsetzung. RFC 2231 geht vor.
    if (!m[1].includes('*')) {
      einfach.set(name, roh);
      continue;
    }
    if (!stuecke.has(name)) stuecke.set(name, []);
    stuecke.get(name).push({ nr: Number(teil[2] ?? 0), kodiert: Boolean(teil[3]), roh });
  }
  const parameter = {};
  for (const [name, roh] of einfach) if (!stuecke.has(name)) parameter[name] = kopfText(roh);
  for (const [name, liste] of stuecke) {
    liste.sort((a, b) => a.nr - b.nr);
    if (!liste.some(t => t.kodiert)) {
      parameter[name] = kopfText(liste.map(t => t.roh).join(''));
      continue;
    }
    // Erster kodierter Teil: zeichensatz'sprache'wert
    const m = /^([^']*)'[^']*'(.*)$/.exec(liste[0].roh);
    const zs = m ? m[1] : 'utf-8';
    const bytes = [];
    liste.forEach((t, i) => {
      const inhalt = i === 0 && m ? m[2] : t.roh;
      bytes.push(t.kodiert ? Buffer.from(inhalt.replace(/%([0-9a-f]{2})|([^%])/gi, (_, h, z) => (h ? String.fromCharCode(parseInt(h, 16)) : z)), 'latin1') : Buffer.from(inhalt, 'latin1'));
    });
    parameter[name] = textAusBytes(Buffer.concat(bytes), zs);
  }
  return { wert: haupt, parameter };
}

/** Teilt Bytes an der ersten Leerzeile in Kopf und Rumpf. */
function kopfUndRumpf(bytes) {
  const a = bytes.indexOf('\r\n\r\n');
  const b = bytes.indexOf('\n\n');
  if (a < 0 && b < 0) return { kopfRoh: bytes.toString('latin1'), rumpf: Buffer.alloc(0) };
  if (a >= 0 && (b < 0 || a < b)) return { kopfRoh: bytes.subarray(0, a).toString('latin1'), rumpf: bytes.subarray(a + 4) };
  return { kopfRoh: bytes.subarray(0, b).toString('latin1'), rumpf: bytes.subarray(b + 2) };
}

function rumpfDekodieren(rumpf, kodierung) {
  const k = String(kodierung || '').trim().toLowerCase();
  if (k === 'base64') return Buffer.from(rumpf.toString('latin1'), 'base64');
  if (k === 'quoted-printable') return quotedPrintable(rumpf.toString('latin1'));
  return rumpf;
}

/** Zeilenumbruch vor der Trennzeile gehoert nicht zum Teil davor. */
function ohneLetztenUmbruch(b) {
  if (b.length >= 2 && b[b.length - 2] === 13 && b[b.length - 1] === 10) return b.subarray(0, -2);
  if (b.length >= 1 && b[b.length - 1] === 10) return b.subarray(0, -1);
  return b;
}

/** Teile eines multipart-Rumpfs. Trennzeile nur am Zeilenanfang. */
export function multipartTeile(rumpf, grenze) {
  const marke = `--${grenze}`;
  const teile = [];
  let start = -1;
  let pos = 0;
  while (pos <= rumpf.length) {
    const i = rumpf.indexOf(marke, pos);
    if (i < 0) break;
    pos = i + marke.length;
    if (i > 0 && rumpf[i - 1] !== 10) continue;
    const ende = rumpf.subarray(pos, pos + 2).toString('latin1') === '--';
    // Nach der Marke darf nur noch Leerraum bis zum Zeilenende stehen (sonst: laengere Grenze).
    let z = ende ? pos + 2 : pos;
    while (z < rumpf.length && (rumpf[z] === 32 || rumpf[z] === 9)) z += 1;
    if (z < rumpf.length && rumpf[z] !== 13 && rumpf[z] !== 10) continue;
    if (start >= 0) teile.push(ohneLetztenUmbruch(rumpf.subarray(start, i)));
    if (ende) return teile;
    if (rumpf[z] === 13) z += 1;
    start = z + 1;
    pos = start;
  }
  // Ohne Schlussmarke (abgeschnittene Mail): Rest ist der letzte Teil.
  if (start >= 0 && start < rumpf.length) teile.push(rumpf.subarray(start));
  return teile;
}

function teilLesen(bytes, ziel, tiefe) {
  const { kopfRoh, rumpf } = kopfUndRumpf(bytes);
  const kopf = kopfZerlegen(kopfRoh);
  const typ = parameterZerlegen(kopf.get('content-type')?.[0] || 'text/plain');
  const dispo = parameterZerlegen(kopf.get('content-disposition')?.[0] || '');
  const kodierung = kopf.get('content-transfer-encoding')?.[0];

  if (typ.wert.startsWith('multipart/') && typ.parameter.boundary && tiefe < MAX_TIEFE) {
    for (const t of multipartTeile(rumpf, typ.parameter.boundary)) teilLesen(t, ziel, tiefe + 1);
    return;
  }
  // Angehaengte Mail: ihre Anhaenge gehoeren zum Beleg, ihr Text nicht zum Text dieser Mail.
  if (typ.wert === 'message/rfc822' && tiefe < MAX_TIEFE) {
    const innen = { text: null, html: null, anhaenge: [] };
    teilLesen(rumpfDekodieren(rumpf, kodierung), innen, tiefe + 1);
    ziel.anhaenge.push(...innen.anhaenge.map(a => ({ ...a, ausAngehaengterMail: true })));
    return;
  }

  const name = dispo.parameter.filename || typ.parameter.name || '';
  const inhalt = rumpfDekodieren(rumpf, kodierung);
  const istText = typ.wert === 'text/plain' || typ.wert === 'text/html';
  if (istText && !name && dispo.wert !== 'attachment') {
    const text = textAusBytes(inhalt, typ.parameter.charset);
    if (typ.wert === 'text/plain') ziel.text = ziel.text === null ? text : `${ziel.text}\n${text}`;
    else ziel.html = ziel.html === null ? text : `${ziel.html}\n${text}`;
    return;
  }
  ziel.anhaenge.push({
    name,
    typ: typ.wert,
    inline: dispo.wert === 'inline',
    cid: (kopf.get('content-id')?.[0] || '').replace(/[<>]/g, '') || null,
    groesse: inhalt.length,
    inhalt: Buffer.from(inhalt),
  });
}

/** Absender aus `Name <a@b>`; ohne Adresse null. */
export function adresseZerlegen(wert) {
  const s = kopfText(wert).trim();
  const m = /^(.*?)<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/.exec(s);
  if (m) return { name: m[1].trim().replace(/^"|"$/g, '').trim(), adresse: m[2].toLowerCase() };
  const n = /([^\s<>"]+@[^\s<>"]+)/.exec(s);
  return n ? { name: '', adresse: n[1].toLowerCase() } : { name: s, adresse: null };
}

/** Nur der Kopf einer Mail: Absender, Betreff, Datum (ISO, null wenn nicht lesbar). */
export function kopfDaten(kopf) {
  const roh = kopf.get('date')?.[0];
  const zeit = roh ? new Date(String(roh).replace(/\s*\([^)]*\)\s*$/, '')) : null;
  return {
    von: adresseZerlegen(kopf.get('from')?.[0] || ''),
    betreff: kopfText(kopf.get('subject')?.[0] || '').trim(),
    datum: zeit && !Number.isNaN(zeit.getTime()) ? zeit.toISOString() : null,
    messageId: (kopf.get('message-id')?.[0] || '').trim() || null,
  };
}

/**
 * Zerlegt eine ganze Mail.
 * @returns {{von, betreff, datum, messageId, text: string, html: string|null, anhaenge: Array}}
 */
export function zerlegeMail(bytes) {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const { kopfRoh } = kopfUndRumpf(b);
  const ziel = { text: null, html: null, anhaenge: [] };
  teilLesen(b, ziel, 0);
  const text = ziel.text ?? (ziel.html ? ziel.html.replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() : '');
  return { ...kopfDaten(kopfZerlegen(kopfRoh)), text, html: ziel.html, anhaenge: ziel.anhaenge };
}
