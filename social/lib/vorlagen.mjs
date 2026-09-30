/**
 * Designsystem fuer Instagram und Facebook - als HTML-Vorlagen.
 *
 * Eine Vorlage ist eine Funktion: Daten hinein, HTML heraus. Gerendert wird
 * mit dem ohnehin vorhandenen Headless-Chrome (rendern.mjs) - kein Canva, kein
 * Abo, und jede Aenderung am Design ist eine Zeile CSS an einer Stelle.
 *
 * Grundsaetze (social/DESIGNSYSTEM.md):
 *   - Das Bild traegt den Beitrag. Text im Bild nur, wo er etwas sagt, das das
 *     Bild nicht sagen kann (Farbname, "Vorher", Preis).
 *   - Baustellenfotos bleiben, wie sie sind: nur Zuschnitt und eine kleine
 *     Signatur, kein Rahmen, kein Filter, der Bodenfarben verschiebt.
 *   - Farben, Schrift und Radien kommen aus dem Shop (--tp-* im Theme).
 */

import { pathToFileURL } from 'node:url';
import { BETRIEB } from './konfig.mjs';

export const FORMAT = Object.freeze({
  feed: { breite: 1080, hoehe: 1350 },     // 4:5 - nimmt im Feed den meisten Platz ein
  quadrat: { breite: 1080, hoehe: 1080 },
  story: { breite: 1080, hoehe: 1920 },    // 9:16 - Story und Reel
});

/** Farbwelt des Shops (assets, --tp-*). Hier aendern heisst: ueberall aendern. */
export const FARBEN = Object.freeze({
  rot: '#b0303f', rotDunkel: '#96262f', tinte: '#1d1a17', tinte2: '#4a443f',
  sand: '#f6f2ec', sand2: '#ede7de', linie: '#e6e0d8', gold: '#e9c8a1', weiss: '#ffffff',
});

const SCHRIFT_BASIS = 'https://www.teppich-paradies.net/cdn/fonts/inter';
const SCHRIFT = [
  [400, 'inter_n4.b2a3f24c19b4de56e8871f609e73ca7f6d2e2bb9.woff2'],
  [500, 'inter_n5.d7101d5e168594dd06f56f290dd759fba5431d97.woff2'],
  [700, 'inter_n7.02711e6b374660cfc7915d1afc1c204e633421e4.woff2'],
];

export function esc(wert) {
  return String(wert ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Lokale Datei oder Shop-Bild -> Adresse fuer das <img>. Shop-Bilder in passender Groesse anfordern. */
export function bildAdresse(quelle, breite = 1600) {
  const q = String(quelle ?? '');
  if (/^https:\/\//.test(q)) {
    if (!/cdn\.shopify\.com|teppich-paradies\.net\/cdn/.test(q)) return q;
    return `${q}${q.includes('?') ? '&' : '?'}width=${breite}`;
  }
  if (/^file:\/\//.test(q)) return q;
  return pathToFileURL(q).href;
}

/**
 * Dezente Korrektur fuer Baustellenfotos: nur Helligkeit, hoechstens 10 %, nie
 * Saettigung oder Farbton - die Bodenfarbe muss stimmen, sonst ist die
 * Referenz keine.
 */
export function dezenterFilter(helligkeit) {
  if (typeof helligkeit !== 'number' || Number.isNaN(helligkeit)) return 'none';
  if (helligkeit < 100) return `brightness(${Math.min(1.10, 1 + (100 - helligkeit) / 400).toFixed(3)})`;
  if (helligkeit > 200) return `brightness(${Math.max(0.94, 1 - (helligkeit - 200) / 500).toFixed(3)})`;
  return 'none';
}

function grund({ breite, hoehe }, inhalt, extraCss = '') {
  const fonts = SCHRIFT.map(([gewicht, datei]) => `@font-face{font-family:Inter;font-weight:${gewicht};font-display:block;src:url(${SCHRIFT_BASIS}/${datei}) format('woff2')}`).join('');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>
${fonts}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${breite}px;height:${hoehe}px;overflow:hidden}
body{font-family:Inter,'Helvetica Neue',Helvetica,Arial,sans-serif;color:${FARBEN.tinte};background:${FARBEN.sand};-webkit-font-smoothing:antialiased;position:relative}
img{display:block}
.voll{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.signatur{position:absolute;left:44px;bottom:44px;display:flex;align-items:center;gap:18px;background:rgba(255,255,255,.94);border-radius:16px;padding:14px 20px 14px 16px;box-shadow:0 6px 24px rgba(29,26,23,.18)}
.signatur img{height:46px;width:auto}
.signatur span{font-size:26px;font-weight:500;color:${FARBEN.tinte2};letter-spacing:.01em}
.chip{display:inline-block;background:rgba(29,26,23,.82);color:#fff;font-size:30px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:12px 22px;border-radius:12px}
.chip.rot{background:${FARBEN.rot}}
.chip.hell{background:rgba(255,255,255,.94);color:${FARBEN.tinte};text-transform:none;letter-spacing:0;font-weight:700;font-size:34px}
.kicker{font-size:26px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${FARBEN.rot}}
${extraCss}
</style></head><body>${inhalt}</body></html>`;
}

function signatur(zeile) {
  return `<div class="signatur"><img src="${esc(BETRIEB.logo)}" alt="">${zeile ? `<span>${esc(zeile)}</span>` : ''}</div>`;
}

function foto(b, klasse = 'voll') {
  const stil = [`object-position:${esc(b.ausschnitt || '50% 60%')}`, b.filter && b.filter !== 'none' ? `filter:${esc(b.filter)}` : ''].filter(Boolean).join(';');
  return `<img class="${klasse}" src="${esc(bildAdresse(b.quelle))}" style="${stil}" alt="">`;
}

// --- Vorlagen -----------------------------------------------------------------

/** Baustelle, Referenz, Einblick: das Foto, sonst fast nichts. */
function vFoto(d, f) {
  const marke = d.marke ? `<div style="position:absolute;left:44px;top:44px"><span class="chip ${d.markeRot ? 'rot' : ''}">${esc(d.marke)}</span></div>` : '';
  return grund(f, `${foto(d.bild)}${marke}${d.ohneSignatur ? '' : signatur(d.zeile)}`);
}

/** Vorher/Nachher in einem Bild: oben vorher, unten nachher. */
function vVorherNachher(d, f) {
  const halb = (f.hoehe - 8) / 2;
  const teil = (b, text, rot, oben) => `<div style="position:absolute;left:0;right:0;top:${oben}px;height:${halb}px;overflow:hidden">${foto(b)}<div style="position:absolute;left:44px;top:40px"><span class="chip ${rot ? 'rot' : ''}">${text}</span></div></div>`;
  return grund(f, `${teil(d.vorher, 'Vorher', false, 0)}${teil(d.nachher, 'Nachher', true, halb + 8)}${signatur(d.zeile)}`, `body{background:#fff}`);
}

/** Produkt: grosses Bild, darunter ein ruhiges Feld mit Name und einer Zeile. */
function vProdukt(d, f) {
  const feld = Math.round(f.hoehe * (f === FORMAT.story ? 0.24 : 0.27));
  const preis = d.preis ? `<div style="text-align:right;flex:none"><div style="font-size:24px;font-weight:500;color:${FARBEN.tinte2}">${esc(d.preisVor || 'ab')}</div><div style="font-size:50px;font-weight:700;line-height:1.05;white-space:nowrap">${esc(d.preis)}</div>${d.preisAlt ? `<div style="font-size:26px;color:${FARBEN.tinte2};text-decoration:line-through">${esc(d.preisAlt)}</div>` : ''}</div>` : '';
  const abzeichen = d.abzeichen ? `<div style="position:absolute;right:44px;top:44px;background:${FARBEN.rot};color:#fff;font-weight:700;font-size:54px;border-radius:50%;width:190px;height:190px;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 28px rgba(29,26,23,.25)">${esc(d.abzeichen)}</div>` : '';
  return grund(f, `
<div style="position:absolute;left:0;right:0;top:0;height:${f.hoehe - feld}px;overflow:hidden">${foto({ ausschnitt: '50% 50%', ...d.bild })}${abzeichen}</div>
<div style="position:absolute;left:0;right:0;bottom:0;height:${feld}px;background:${FARBEN.sand};border-top:6px solid ${FARBEN.rot};padding:40px 52px;display:flex;flex-direction:column;justify-content:center;gap:14px">
  <div class="kicker">${esc(d.kicker || '')}</div>
  <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:32px">
    <div style="min-width:0">
      <div style="font-size:${String(d.titel || '').length > 22 ? 52 : 64}px;font-weight:700;line-height:1.08;letter-spacing:-.01em">${esc(d.titel)}</div>
      <div style="font-size:31px;color:${FARBEN.tinte2};margin-top:12px;line-height:1.25">${esc(d.zeile || '')}</div>
    </div>${preis}
  </div>
  ${f === FORMAT.story ? `<div style="font-size:28px;font-weight:700;color:${FARBEN.rot};margin-top:6px">${esc(BETRIEB.shopKurz)}</div>` : ''}
</div>
<img src="${esc(BETRIEB.logo)}" alt="" style="position:absolute;left:44px;top:44px;height:54px;background:rgba(255,255,255,.94);padding:10px 14px;border-radius:14px;box-sizing:content-box">`);
}

/** Titelbild eines Farb-Karussells: Raster aus Farbflaechen, darunter der Name. */
function vFarbenTitel(d, f) {
  const bilder = (d.bilder || []).slice(0, 6);
  const spalten = bilder.length <= 4 ? 2 : 3;
  const feld = Math.round(f.hoehe * 0.24);
  const zellen = bilder.map(b => `<div style="position:relative;overflow:hidden;border-radius:14px">${foto({ ausschnitt: '50% 50%', ...b })}</div>`).join('');
  return grund(f, `
<div style="position:absolute;left:40px;right:40px;top:40px;height:${f.hoehe - feld - 60}px;display:grid;grid-template-columns:repeat(${spalten},1fr);grid-auto-rows:1fr;gap:16px">${zellen}</div>
<div style="position:absolute;left:0;right:0;bottom:0;height:${feld}px;padding:30px 52px;display:flex;flex-direction:column;justify-content:center;gap:12px">
  <div class="kicker">${esc(d.kicker || '')}</div>
  <div style="font-size:${String(d.titel || '').length > 22 ? 54 : 66}px;font-weight:700;line-height:1.08;letter-spacing:-.01em">${esc(d.titel)}</div>
  <div style="font-size:31px;color:${FARBEN.tinte2}">${esc(d.zeile || '')}</div>
</div>
<img src="${esc(BETRIEB.logo)}" alt="" style="position:absolute;right:48px;bottom:48px;height:54px">`);
}

/** Eine Farbe, ein Bild, ein Name. */
function vFarbe(d, f) {
  return grund(f, `${foto({ ausschnitt: '50% 50%', ...d.bild })}
<div style="position:absolute;left:44px;bottom:44px;display:flex;flex-direction:column;gap:12px;align-items:flex-start">
  ${d.zaehler ? `<span class="chip" style="font-size:24px;padding:8px 16px">${esc(d.zaehler)}</span>` : ''}
  <span class="chip hell">${esc(d.name)}</span>
</div>`);
}

/** Tipp / Bodenwissen: die einzige Vorlage, die aus Text besteht. */
function vTipp(d, f) {
  const punkte = (d.punkte || []).map((p, i) => `<div style="display:flex;gap:24px;align-items:flex-start"><div style="flex:none;width:58px;height:58px;border-radius:50%;background:${FARBEN.rot};color:#fff;font-weight:700;font-size:30px;display:flex;align-items:center;justify-content:center">${i + 1}</div><div style="font-size:38px;line-height:1.3;padding-top:4px">${esc(p)}</div></div>`).join('');
  return grund(f, `
<div style="position:absolute;inset:0;padding:96px 76px 150px;display:flex;flex-direction:column;justify-content:center;gap:40px">
  <div class="kicker">${esc(d.kicker || 'Bodenwissen')}</div>
  <div style="font-size:${String(d.titel || '').length > 48 ? 62 : 76}px;font-weight:700;line-height:1.1;letter-spacing:-.015em">${esc(d.titel)}</div>
  ${d.text ? `<div style="font-size:40px;line-height:1.35;color:${FARBEN.tinte2}">${esc(d.text)}</div>` : ''}
  ${punkte ? `<div style="display:flex;flex-direction:column;gap:30px">${punkte}</div>` : ''}
</div>
<div style="position:absolute;left:76px;right:76px;bottom:64px;display:flex;align-items:center;justify-content:space-between;border-top:2px solid ${FARBEN.linie};padding-top:28px">
  <img src="${esc(BETRIEB.logo)}" alt="" style="height:54px">
  <div style="font-size:26px;color:${FARBEN.tinte2}">${esc(d.fuss || BETRIEB.shopKurz)}</div>
</div>`);
}

/** Story: Foto bildfuellend, oben Logo, unten eine Zeile. Platz fuer die Bedienelemente von Instagram bleibt frei. */
function vStoryFoto(d, f) {
  const marke = d.marke ? `<span class="chip ${d.markeRot ? 'rot' : ''}">${esc(d.marke)}</span>` : '';
  return grund(f, `${foto(d.bild)}
<div style="position:absolute;left:0;right:0;top:0;height:420px;background:linear-gradient(rgba(29,26,23,.45),rgba(29,26,23,0))"></div>
<div style="position:absolute;left:0;right:0;bottom:0;height:640px;background:linear-gradient(rgba(29,26,23,0),rgba(29,26,23,.62))"></div>
<div style="position:absolute;left:56px;top:150px;display:flex;align-items:center;gap:20px"><img src="${esc(BETRIEB.logo)}" alt="" style="height:60px;background:rgba(255,255,255,.95);padding:12px 16px;border-radius:16px;box-sizing:content-box">${marke}</div>
<div style="position:absolute;left:56px;right:56px;bottom:300px;color:#fff">
  <div style="font-size:60px;font-weight:700;line-height:1.12;text-shadow:0 2px 18px rgba(0,0,0,.35)">${esc(d.titel || '')}</div>
  ${d.zeile ? `<div style="font-size:36px;font-weight:500;margin-top:18px;text-shadow:0 2px 14px rgba(0,0,0,.35)">${esc(d.zeile)}</div>` : ''}
</div>`);
}

export const VORLAGEN = Object.freeze({
  foto: { bau: vFoto, formate: ['feed', 'quadrat', 'story'], zweck: 'Baustelle, Referenz, Einblick – Foto mit kleiner Signatur' },
  vorher_nachher: { bau: vVorherNachher, formate: ['feed', 'story'], zweck: 'Vorher und Nachher in einem Bild' },
  produkt: { bau: vProdukt, formate: ['feed', 'quadrat', 'story'], zweck: 'Produkt, Neuheit, Produkt der Woche, Angebot' },
  farben_titel: { bau: vFarbenTitel, formate: ['feed', 'quadrat'], zweck: 'Titelbild eines Farb- oder Dekor-Karussells' },
  farbe: { bau: vFarbe, formate: ['feed', 'quadrat', 'story'], zweck: 'Einzelne Farbe im Karussell' },
  tipp: { bau: vTipp, formate: ['feed', 'quadrat', 'story'], zweck: 'Tipp, Bodenwissen, Hinweis' },
  story_foto: { bau: vStoryFoto, formate: ['story'], zweck: 'Story und Reel-Standbild: Foto mit einer Zeile' },
});

export function baue(name, daten, format = 'feed') {
  const v = VORLAGEN[name];
  if (!v) throw new Error(`Vorlage "${name}" gibt es nicht (${Object.keys(VORLAGEN).join(', ')})`);
  if (!v.formate.includes(format)) throw new Error(`Vorlage "${name}" gibt es nicht im Format ${format}`);
  return { html: v.bau(daten, FORMAT[format]), ...FORMAT[format] };
}
