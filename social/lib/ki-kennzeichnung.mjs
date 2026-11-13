/**
 * IPTC-Kennzeichnung fuer KI-Bilder (docs/lessons/ki-bilder.md).
 *
 * Schreibt `Iptc4xmpExt:DigitalSourceType = trainedAlgorithmicMedia` als XMP-Segment (APP1)
 * in eine JPEG-Datei. Ein vorhandenes XMP-Segment wird ersetzt, alle anderen Segmente (EXIF,
 * C2PA, Bilddaten) bleiben unveraendert. Reine Byte-Arbeit, ohne Zusatzprogramm.
 */

const XMP_KENNUNG = Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'latin1');
export const DIGITAL_SOURCE_TYPE = 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia';

const PAKET = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" Iptc4xmpExt:DigitalSourceType="${DIGITAL_SOURCE_TYPE}"/></rdf:RDF></x:xmpmeta>
<?xpacket end="w"?>`;

export class KennzeichnungFehler extends Error {}

/** Segmente einer JPEG-Datei bis zum Start der Bilddaten (SOS). */
function segmente(jpg) {
  if (jpg.length < 4 || jpg[0] !== 0xff || jpg[1] !== 0xd8) throw new KennzeichnungFehler('Kein JPEG');
  const liste = [];
  let pos = 2;
  while (pos + 4 <= jpg.length) {
    if (jpg[pos] !== 0xff) throw new KennzeichnungFehler('JPEG-Segment beschädigt');
    const marke = jpg[pos + 1];
    if (marke === 0xff) { pos += 1; continue; }
    if (marke === 0xda) break; // Bilddaten
    const laenge = jpg.readUInt16BE(pos + 2);
    if (laenge < 2 || pos + 2 + laenge > jpg.length) throw new KennzeichnungFehler('JPEG-Segment beschädigt');
    liste.push({ marke, start: pos, ende: pos + 2 + laenge });
    pos += 2 + laenge;
  }
  return { liste, bilddaten: pos };
}

function istXmp(jpg, s) {
  return s.marke === 0xe1 && jpg.subarray(s.start + 4, s.start + 4 + XMP_KENNUNG.length).equals(XMP_KENNUNG);
}

/** Setzt die Kennzeichnung. Gibt eine neue Buffer-Kopie zurueck. */
export function kennzeichneKiBild(jpg) {
  const { liste, bilddaten } = segmente(jpg);
  const nutz = Buffer.concat([XMP_KENNUNG, Buffer.from(PAKET, 'utf8')]);
  if (nutz.length + 2 > 0xffff) throw new KennzeichnungFehler('XMP-Paket zu groß');
  const kopf = Buffer.alloc(4); kopf[0] = 0xff; kopf[1] = 0xe1; kopf.writeUInt16BE(nutz.length + 2, 2);
  const neu = Buffer.concat([kopf, nutz]);
  // Einfuegen hinter den ersten APPn-Segmenten (JFIF/EXIF), vorhandenes XMP entfaellt.
  const teile = [jpg.subarray(0, 2)];
  let eingefuegt = false;
  for (const s of liste) {
    if (istXmp(jpg, s)) continue;
    if (!eingefuegt && !(s.marke >= 0xe0 && s.marke <= 0xe1)) { teile.push(neu); eingefuegt = true; }
    teile.push(jpg.subarray(s.start, s.ende));
  }
  if (!eingefuegt) teile.push(neu);
  teile.push(jpg.subarray(bilddaten));
  return Buffer.concat(teile);
}

/** True, wenn die JPEG-Datei die Kennzeichnung traegt. */
export function traegtKiKennzeichnung(jpg) {
  try {
    const { liste } = segmente(jpg);
    return liste.some(s => istXmp(jpg, s) && jpg.subarray(s.start, s.ende).includes(Buffer.from(DIGITAL_SOURCE_TYPE)));
  } catch { return false; }
}
