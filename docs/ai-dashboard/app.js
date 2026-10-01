/**
 * Teppich Paradies Control Center – Einstieg der Oberflaeche.
 *
 * Kein Build-Schritt: index.html laedt diese Datei als <script type="module">, alles Weitere
 * kommt ueber import. Aufbau (Einzelheiten in README.md, Abschnitt "Aufbau der Oberflaeche"):
 *
 *   kern/        Zustand, Helfer, API-Zugriff, Sitzung, Router, Zeichnen - kennt keine Ansicht
 *   bausteine/   was mehrere Ansichten teilen (Karten, Aufgaben-Panel, Dialog, Palette ...)
 *   ansichten/   eine Datei je Route, grosse Ansichten mit Teilmodulen im gleichnamigen Ordner
 *   ereignisse.mjs  die zentrale Ereignisverteilung
 *   lib/         Regeln ohne DOM, laufen auch im Server und in den Tests
 *
 * Laeuft nur mit dem lokalen Server (npm run dashboard): /api/capabilities entscheidet die
 * Betriebsart, ohne Server zeigt die Oberflaeche keine Aufgabendaten.
 * Alle Regeln (Status, Dringlichkeit, Uebergaenge) kommen aus lib/model.mjs.
 *
 * Neue Ansicht: Datei in ansichten/ anlegen, hier in VIEWS eintragen, Route in
 * kern/router.mjs (parseRoute) freigeben, Link in index.html, Seitentitel in kern/render.mjs.
 */
import { CONFIG } from './kern/konfig.mjs';
import { state } from './kern/zustand.mjs';
import { $ } from './kern/helfer.mjs';
import { loadCapabilities, loadSession } from './kern/sitzung.mjs';
import { parseRoute } from './kern/router.mjs';
import { renderThemeButton } from './kern/thema.mjs';
import { loadData, loadAgentRuns, refresh, renderSyncChip } from './kern/daten.mjs';
import { registriereAnsichten, render } from './kern/render.mjs';
import { registriereNavZaehler } from './kern/navigation.mjs';
import { kunden } from './ansichten/kunden/gemeinsam.mjs';
import { viewEinkauf } from './ansichten/einkauf.mjs';
import { viewLexikon } from './ansichten/lexikon.mjs';
import { viewKunden } from './ansichten/kunden.mjs';
import { viewOrganisation } from './ansichten/organisation.mjs';
import { viewTeam } from './ansichten/team.mjs';
import { viewFotos } from './ansichten/fotos.mjs';
import { viewShopwache } from './ansichten/shopwache.mjs';
import { viewRatgeber } from './ansichten/ratgeber.mjs';
import { viewHilfe } from './ansichten/hilfe.mjs';
import { viewArbeit } from './ansichten/arbeit.mjs';
import { viewFreigaben } from './ansichten/freigaben.mjs';
import { viewBereiche } from './ansichten/bereiche.mjs';
import { viewInsights } from './ansichten/insights.mjs';
import { ladeAktivitaetsdaten, viewAktivitaet } from './ansichten/aktivitaet.mjs';
import { viewHeute } from './ansichten/heute.mjs';
import { bindEvents } from './ereignisse.mjs';

const VIEWS = { heute: viewHeute, fotos: viewFotos, team: viewTeam, hilfe: viewHilfe, organisation: viewOrganisation, shopwache: viewShopwache, arbeit: viewArbeit, freigaben: viewFreigaben, bereiche: viewBereiche, insights: viewInsights, aktivitaet: viewAktivitaet, einkauf: viewEinkauf, kunden: viewKunden, lexikon: viewLexikon, ratgeber: viewRatgeber };

async function init() {
  registriereAnsichten(VIEWS);
  // Zaehler in der Navigation: nur, was ohnehin geladen ist - kein eigener Abruf dafuer.
  registriereNavZaehler({ kunden: () => kunden.faelle?.sofort });
  parseRoute();
  bindEvents();
  renderThemeButton();
  await loadSession();
  await loadCapabilities();
  await loadData();
  renderSyncChip();
  if (state.route.view === 'aktivitaet') { await ladeAktivitaetsdaten(); }
  render();
  if (state.route.view === 'lexikon' && !state.route.params.get('handle')) $('#main input[data-param="lq"]')?.focus();
  loadAgentRuns().then(() => { if (state.agentRuns) render(); });
  setInterval(() => refresh({ silent: true }), CONFIG.refreshMs);
}

init();
