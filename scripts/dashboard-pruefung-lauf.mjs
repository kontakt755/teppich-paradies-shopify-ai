/** Eigene Browser-/Serverprozesse beenden, bevor ihre Datenkopie verschwindet. */
import { datenkopieLoeschen } from './dashboard-datenkopie.mjs';

function beendet(kind) {
  return !kind || kind.exitCode != null || kind.signalCode != null || !kind.pid;
}

function mitFrist(vorgang, ms, meldung) {
  let zeit;
  return Promise.race([
    Promise.resolve(vorgang),
    new Promise((_, fehler) => { zeit = setTimeout(() => {
      const e = new Error(meldung);
      e.datenErhalten = true;
      fehler(e);
    }, ms); }),
  ]).finally(() => clearTimeout(zeit));
}

/** Listener vor dem Signal setzen: auch ein sofortiges Ende darf nicht verloren gehen. */
function signalUndWarten(kind, signal, ms) {
  if (beendet(kind)) return Promise.resolve(true);
  return new Promise((ok, fehler) => {
    let zeit;
    const fertig = wert => {
      clearTimeout(zeit);
      kind.off('exit', ende);
      ok(wert);
    };
    const ende = () => fertig(true);
    kind.once('exit', ende);
    zeit = setTimeout(() => fertig(beendet(kind)), ms);
    try {
      kind.kill(signal);
      if (beendet(kind)) fertig(true);
    } catch (e) {
      clearTimeout(zeit);
      kind.off('exit', ende);
      fehler(e);
    }
  });
}

async function kindBeenden(kind, warteMs) {
  if (beendet(kind)) return;
  if (await signalUndWarten(kind, 'SIGTERM', warteMs)) return;
  if (await signalUndWarten(kind, 'SIGKILL', warteMs)) return;
  throw new Error('Pruef-Prozess wurde nicht nachweislich beendet; Datenkopie bleibt erhalten.');
}

/**
 * Eine Pruefung besitzt genau den hier zugewiesenen Browser, Server und Datenordner.
 * Keine Suche nach fremden Prozessen oder Temp-Ordnern. aufraeumen() ist idempotent;
 * mit erzwingen:true wird auch ein zuvor erfolgreich offengelassener Lauf beendet.
 */
export function pruefLauf({ daten, tmp, warteMs = 3000, startWarteMs = 30_000 }) {
  if (!Number.isFinite(warteMs) || warteMs <= 0) throw new Error('warteMs muss positiv sein.');
  if (!Number.isFinite(startWarteMs) || startWarteMs <= 0) throw new Error('startWarteMs muss positiv sein.');
  let server = null;
  let browser = null;
  let browserStart = null;
  let browserStartFertig = false;
  let browserSollSchliessen = false;
  let browserEnde = null;
  let browserSchluss = null;
  let bleibtOffen = false;
  let raeumtAuf = null;
  const zuweisen = (bisher, neu) => {
    if (raeumtAuf || (bisher && bisher !== neu)) throw new Error('Pruef-Prozess kann nicht nachtraeglich ersetzt werden.');
    return neu;
  };

  const bekanntenBrowserSchliessen = () => {
    if (!browser) return Promise.resolve();
    if (!browserEnde) browserEnde = (async () => {
      try {
        await mitFrist(browser.close(), warteMs, 'Pruef-Browser beendet sich nicht.');
      } catch (e) {
        // Puppeteers eigener Kindprozess: bei haengendem close ebenfalls begrenzt beenden.
        const kind = browser.process?.();
        if (kind) {
          try { await kindBeenden(kind, warteMs); e.datenErhalten = false; }
          catch (abbruch) { abbruch.datenErhalten = true; throw abbruch; }
        }
        throw e;
      }
    })();
    return browserEnde;
  };

  const browserSchliessen = () => {
    browserSollSchliessen = true;
    if (!browserSchluss) browserSchluss = (async () => {
      if (browserStart) {
        try {
          await mitFrist(browserStart, startWarteMs, 'Pruef-Browserstart nicht beendet; Datenkopie bleibt erhalten.');
        } catch (e) {
          // Ein abgebrochener launch hat keinen zugewiesenen Browser. Ein weiterhin
          // offener launch darf dagegen nicht als erfolgreich beendet gelten.
          if (!browserStartFertig) throw e;
        }
      }
      await bekanntenBrowserSchliessen();
    })();
    return browserSchluss;
  };

  return {
    serverSetzen(kind) {
      server = zuweisen(server, kind);
      // Ein fehlgeschlagener spawn hat keine PID und kann nichts mehr beschreiben.
      // Den Fehler faengt der Hauptlauf ueber seinen Start-/Bereitschaftstest auf.
      server?.on('error', () => {});
      return kind;
    },
    browserSetzen(neu) {
      if (browserStart) throw new Error('Pruef-Browserstart wurde bereits zugewiesen.');
      browser = zuweisen(browser, neu);
      return neu;
    },
    browserStarten(start) {
      if (browserStart || browser) throw new Error('Pruef-Browser wurde bereits zugewiesen.');
      zuweisen(null, start);
      browserStart = Promise.resolve(start).then(neu => {
        browser = neu;
        // Falls der Start erst nach Ablauf der Abbruchfrist zurueckkommt, wird auch
        // dieser eigene Browser sofort geschlossen. Kein unbehandelter spaeter Fehler.
        if (browserSollSchliessen) bekanntenBrowserSchliessen().catch(() => {});
        return neu;
      }).finally(() => { browserStartFertig = true; });
      return browserStart;
    },
    browserSchliessen,
    offenLassen() { bleibtOffen = true; },
    aufraeumen({ erzwingen = false } = {}) {
      if (erzwingen) bleibtOffen = false;
      if (bleibtOffen) return Promise.resolve();
      if (!raeumtAuf) raeumtAuf = (async () => {
        let browserFehler;
        try { await browserSchliessen(); } catch (e) { browserFehler = e; }
        // Auch bei einem Browserfehler muss der eigene Server verschwinden. Solange
        // sein Ende unklar ist, darf seine Datenkopie nicht darunter geloescht werden.
        await kindBeenden(server, warteMs);
        if (!browserFehler?.datenErhalten) datenkopieLoeschen(daten, tmp);
        if (browserFehler) throw browserFehler;
      })();
      return raeumtAuf;
    },
    notaus() {
      if (bleibtOffen) return;
      // Im synchronen exit-Handler kann kein Kindende abgewartet werden. Die Kopie
      // bleibt dann dem Server-Exit-Handler bzw. dem spaeteren verwaisten Lauf.
      try { browser?.process?.()?.kill('SIGTERM'); } catch { /* Prozess endete bereits */ }
      const serverWarBeendet = beendet(server);
      if (!serverWarBeendet) {
        try { server.kill('SIGTERM'); } catch { /* Kopie vorsichtshalber erhalten */ }
      } else if ((!browserStart || browserStartFertig) && !browser?.process?.()?.pid) {
        try { datenkopieLoeschen(daten, tmp); } catch { /* beim exit nicht mehr meldbar */ }
      }
    },
  };
}
