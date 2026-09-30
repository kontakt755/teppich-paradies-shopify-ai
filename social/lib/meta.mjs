/**
 * Publisher: Instagram und Facebook ueber die Meta Graph API.
 *
 * Direkt gegen die API, ohne Zwischendienst. Noetig sind ein Seiten-Token,
 * die Seiten-ID und die ID des verknuepften Instagram-Kontos (Einrichtung:
 * social/META-EINRICHTUNG.md). Ohne Zugang arbeitet das Modul im
 * Trockenlauf: es zeigt, was es taete, und veroeffentlicht nichts.
 *
 * Instagram nimmt Bilder nur von einer oeffentlichen Adresse entgegen. Statt
 * dafuer einen eigenen Server ins Netz zu stellen, laedt der Publisher jedes
 * Bild zuerst als unveroeffentlichtes Foto auf die Facebook-Seite und reicht
 * Instagram dessen CDN-Adresse. Videos brauchen eine eigene oeffentliche
 * Adresse (SOCIAL_MEDIEN_BASIS_URL).
 */

import fs from 'node:fs';
import path from 'node:path';

export class MetaFehler extends Error {
  constructor(meldung, { code = null, status = null, voruebergehend = false, zugang = false } = {}) {
    super(meldung);
    this.code = code; this.status = status; this.voruebergehend = voruebergehend; this.zugang = zugang;
  }
}

// Meta-Fehlercodes, bei denen ein spaeterer Versuch sinnvoll ist (Last, Ratenlimit, interner Fehler).
const VORUEBERGEHEND = new Set([1, 2, 4, 17, 32, 341, 613, 80001, 80002]);
const ZUGANG = new Set([102, 190]);

export function ordneFehler(status, body) {
  const e = body?.error ?? {};
  const code = e.code ?? null;
  return new MetaFehler(`Meta API: ${e.message ?? `HTTP ${status}`}${code ? ` (Code ${code})` : ''}`, {
    code, status,
    voruebergehend: Boolean(e.is_transient) || VORUEBERGEHEND.has(code) || status >= 500,
    zugang: ZUGANG.has(code),
  });
}

const warte = ms => new Promise(r => setTimeout(r, ms));

export function erstelleClient({ token, pageId, igUserId = null, version = 'v24.0', medienBasis = null, holen = globalThis.fetch, trocken = false, protokoll = () => {}, pause = warte } = {}) {
  const basis = `https://graph.facebook.com/${version}`;
  let zaehler = 0;

  async function graph(methode, pfad, params = {}, { datei = null } = {}) {
    if (trocken) {
      zaehler += 1;
      protokoll(`[trocken] ${methode} ${pfad} ${JSON.stringify({ ...params, ...(datei ? { datei: path.basename(datei) } : {}) }).slice(0, 300)}`);
      return { id: `trocken-${zaehler}`, post_id: `trocken-${zaehler}`, status_code: 'FINISHED', permalink: null, images: [{ source: `https://example.invalid/${zaehler}.jpg`, width: 1080 }], data: [] };
    }
    if (!token) throw new MetaFehler('Kein Meta-Zugang eingerichtet (META_PAGE_TOKEN fehlt)', { zugang: true });
    let url = `${basis}${pfad}`; let init;
    if (methode === 'GET') {
      url += `?${new URLSearchParams({ ...params, access_token: token })}`;
      init = { method: 'GET' };
    } else if (datei) {
      const form = new FormData();
      for (const [k, v] of Object.entries(params)) form.append(k, String(v));
      form.append('access_token', token);
      form.append('source', new Blob([fs.readFileSync(datei)]), path.basename(datei));
      init = { method: 'POST', body: form };
    } else {
      init = { method: 'POST', body: new URLSearchParams({ ...params, access_token: token }) };
    }
    let antwort;
    try { antwort = await holen(url, init); } catch (e) {
      throw new MetaFehler(`Meta nicht erreichbar: ${e.message}`, { voruebergehend: true });
    }
    const body = await antwort.json().catch(() => ({}));
    if (!antwort.ok || body.error) throw ordneFehler(antwort.status, body);
    return body;
  }

  /** Wartet, bis Instagram einen Container verarbeitet hat. Bilder sind sofort fertig, Videos brauchen Minuten. */
  async function igWarte(containerId, { versuche = 40, abstandMs = 5000 } = {}) {
    for (let i = 0; i < versuche; i += 1) {
      const s = await graph('GET', `/${containerId}`, { fields: 'status_code' });
      if (s.status_code === 'FINISHED') return;
      if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new MetaFehler(`Instagram konnte das Medium nicht verarbeiten (${s.status_code})`);
      await pause(abstandMs);
    }
    throw new MetaFehler('Instagram verarbeitet das Medium noch – späterer Versuch', { voruebergehend: true });
  }

  const client = {
    trocken,
    graph,

    /** Prueft den Zugang und liefert, was verbunden ist. */
    async pruefe() {
      const seite = await graph('GET', `/${pageId}`, { fields: 'id,name,link,fan_count,instagram_business_account{id,username,followers_count,media_count}' });
      return { seite: { id: seite.id, name: seite.name, link: seite.link, follower: seite.fan_count }, instagram: seite.instagram_business_account ?? null };
    },

    /** Foto auf die Seite laden, ohne es zu zeigen. Liefert ID und oeffentliche CDN-Adresse. */
    async fotoAblegen(datei) {
      const foto = await graph('POST', `/${pageId}/photos`, { published: 'false' }, { datei });
      const info = await graph('GET', `/${foto.id}`, { fields: 'images' });
      const groesstes = [...(info.images ?? [])].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
      if (!groesstes?.source) throw new MetaFehler('Facebook hat für das Foto keine Adresse geliefert', { voruebergehend: true });
      return { id: foto.id, url: groesstes.source };
    },

    async facebook({ format, text, fotos, videoDatei = null }) {
      if (format === 'story') {
        const r = await graph('POST', `/${pageId}/photo_stories`, { photo_id: fotos[0].id });
        return { id: r.post_id ?? r.id, permalink: null };
      }
      if (format === 'reel') {
        if (!videoDatei) throw new MetaFehler('Reel ohne Videodatei');
        const r = await graph('POST', `/${pageId}/videos`, { description: text }, { datei: videoDatei });
        return { id: r.id, permalink: null };
      }
      const params = { message: text };
      fotos.forEach((f, i) => { params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: f.id }); });
      const r = await graph('POST', `/${pageId}/feed`, params);
      const info = await graph('GET', `/${r.id}`, { fields: 'permalink_url' }).catch(() => ({}));
      return { id: r.id, permalink: info.permalink_url ?? null };
    },

    async instagram({ format, text, fotos, videoUrl = null }) {
      if (!igUserId) throw new MetaFehler('Instagram-Konto nicht verknüpft (META_IG_USER_ID fehlt)', { zugang: true });
      let container;
      if (format === 'reel') {
        if (!videoUrl) throw new MetaFehler('Reel braucht eine öffentliche Videoadresse (SOCIAL_MEDIEN_BASIS_URL)');
        container = await graph('POST', `/${igUserId}/media`, { media_type: 'REELS', video_url: videoUrl, caption: text });
        await igWarte(container.id);
      } else if (format === 'story') {
        container = await graph('POST', `/${igUserId}/media`, { media_type: 'STORIES', image_url: fotos[0].url });
        await igWarte(container.id, { versuche: 12 });
      } else if (fotos.length > 1) {
        const kinder = [];
        for (const f of fotos.slice(0, 10)) {
          const k = await graph('POST', `/${igUserId}/media`, { image_url: f.url, is_carousel_item: 'true' });
          kinder.push(k.id);
        }
        container = await graph('POST', `/${igUserId}/media`, { media_type: 'CAROUSEL', children: kinder.join(','), caption: text });
        await igWarte(container.id, { versuche: 12 });
      } else {
        container = await graph('POST', `/${igUserId}/media`, { image_url: fotos[0].url, caption: text });
        await igWarte(container.id, { versuche: 12 });
      }
      const r = await graph('POST', `/${igUserId}/media_publish`, { creation_id: container.id });
      const info = await graph('GET', `/${r.id}`, { fields: 'permalink' }).catch(() => ({}));
      return { id: r.id, permalink: info.permalink ?? null };
    },

    // --- Kennzahlen ------------------------------------------------------
    /** Instagram-Messwerte eines Beitrags. Meta aendert die Metriknamen regelmaessig - unbekannte werden einzeln uebersprungen. */
    async igKennzahlen(mediaId, format) {
      const wunsch = format === 'story' ? ['reach', 'views', 'replies', 'profile_visits', 'shares']
        : ['reach', 'views', 'likes', 'comments', 'shares', 'saved', 'profile_visits', 'total_interactions'];
      const werte = {};
      try {
        const r = await graph('GET', `/${mediaId}/insights`, { metric: wunsch.join(',') });
        for (const m of r.data ?? []) werte[m.name] = m.values?.[0]?.value ?? m.total_value?.value ?? null;
      } catch (e) {
        if (e.zugang || e.voruebergehend) throw e;
        for (const metrik of wunsch) {
          try {
            const r = await graph('GET', `/${mediaId}/insights`, { metric: metrik });
            const m = r.data?.[0];
            if (m) werte[m.name] = m.values?.[0]?.value ?? m.total_value?.value ?? null;
          } catch (einzel) { if (einzel.zugang) throw einzel; }
        }
      }
      return werte;
    },

    async fbKennzahlen(postId) {
      const werte = {};
      const p = await graph('GET', `/${postId}`, { fields: 'shares,likes.summary(true).limit(0),comments.summary(true).limit(0)' }).catch((e) => { if (e.zugang) throw e; return {}; });
      werte.likes = p.likes?.summary?.total_count ?? null;
      werte.comments = p.comments?.summary?.total_count ?? null;
      werte.shares = p.shares?.count ?? 0;
      for (const metrik of ['post_impressions_unique', 'post_clicks_by_type']) {
        try {
          const r = await graph('GET', `/${postId}/insights`, { metric: metrik });
          const v = r.data?.[0]?.values?.[0]?.value;
          if (metrik === 'post_impressions_unique') werte.reach = v ?? null;
          else werte.link_clicks = v?.['link clicks'] ?? null;
        } catch (e) { if (e.zugang) throw e; }
      }
      return werte;
    },

    medienUrl: (relativ) => (medienBasis ? `${medienBasis.replace(/\/$/, '')}/${relativ}` : null),
  };
  return client;
}

/**
 * Veroeffentlicht einen Beitrag auf allen gewaehlten Plattformen.
 *
 * Wichtig ist die Wiederholbarkeit: gelingt Facebook und scheitert Instagram,
 * darf der naechste Versuch Facebook nicht noch einmal posten. `bisher`
 * enthaelt, was schon draussen ist; zurueck kommt der ergaenzte Stand samt
 * Fehlern je Plattform.
 */
export async function veroeffentliche(client, { beitrag, dateien, texte, bisher = {} }) {
  const ergebnis = { ...bisher };
  const fehler = {};
  const offen = beitrag.plattformen.filter(p => !ergebnis[p]?.id);
  if (!offen.length) return { ergebnis, fehler, fertig: true };

  const bilder = dateien.filter(d => d.art !== 'video');
  const video = dateien.find(d => d.art === 'video') ?? null;
  const fotos = [];
  try {
    for (const b of bilder) fotos.push(await client.fotoAblegen(b.datei));
  } catch (e) {
    for (const p of offen) fehler[p] = e;
    return { ergebnis, fehler, fertig: false };
  }

  for (const plattform of offen) {
    try {
      if (plattform === 'facebook') {
        ergebnis.facebook = await client.facebook({ format: beitrag.format, text: texte.facebook, fotos, videoDatei: video?.datei ?? null });
      } else if (plattform === 'instagram') {
        ergebnis.instagram = await client.instagram({ format: beitrag.format, text: texte.instagram, fotos, videoUrl: video ? client.medienUrl(video.relativ) : null });
      }
    } catch (e) {
      fehler[plattform] = e;
    }
  }
  return { ergebnis, fehler, fertig: Object.keys(fehler).length === 0 };
}
