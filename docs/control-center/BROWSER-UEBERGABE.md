# Direkte Uebergabe aus dem Arbeitsplatz

Auf einem eingerichteten Chrome-Arbeitsplatz uebernimmt „Im Projekt einfuegen“ den vorbereiteten
Auftrag in das Eingabefeld des hinterlegten ChatGPT-Projekts. Die Person liest ihn und startet
ChatGPT selbst. Es wird keine E-Mail versendet und kein Fachsystem geaendert.

## Einmalig einrichten

1. Die gewuenschten Dashboard-Urspruenge festlegen. Es gelten ganze Urspruenge einschliesslich
   Protokoll und Port, keine allgemeinen Freigaben fuer beliebige Seiten.
2. Das private Erweiterungspaket ausserhalb des Repositorys erzeugen:

   ```sh
   node operations/scripts/browser-uebergabe-paket.mjs \
     --dashboard http://localhost:8001 \
     --ziel /absoluter/privater/ordner/browserbegleiter
   ```

   `--dashboard` kann fuer weitere ausdruecklich erlaubte Dashboard-Adressen wiederholt werden.
   Die erzeugte Konfiguration enthaelt private Standortadressen und wird nicht eingecheckt.
3. Den Quelltext und die erzeugte `manifest.json` pruefen. Die Erweiterung benoetigt Zugriff auf
   die eingerichteten Dashboard-Seiten und ChatGPT-Projektseiten. Installation und Seitenzugriff
   muessen im Browser ausdruecklich freigegeben sein.
4. In Chromes Erweiterungsverwaltung das entpackte Paket laden. Die Dashboard-Seite neu laden,
   falls sie schon offen war, und im Arbeitsplatz den Begleiter pruefen.
5. Mit einem rein erfundenen Vorgang testen: richtige Projektueberschrift, vollstaendiger Text,
   aktiver Sendeknopf, keine abgesendete Nachricht. Den Testtext danach entfernen.

## Betrieb und Grenzen

- Beide Seiten laufen im selben Chrome-Profil. Dort muss das richtige ChatGPT-Konto angemeldet sein.
- Unterstuetzt sind genaue ChatGPT-Projektstartseiten. Allgemeine App-Adressen, andere Anbieter und
  mobile Browser benutzen weiterhin den manuellen Weg.
- Eine vorhandene Eingabe wird nicht ueberschrieben. Ein falsches Ziel, fehlende Anmeldung oder eine
  geaenderte ChatGPT-Oberflaeche ergeben einen Fehler mit einem naechsten Schritt.
- Die Erweiterung liest den Auftrag erst nach dem bewussten Uebergabeklick. Sie uebertraegt keine
  gesamten Browser- oder Chatverlaeufe und greift nicht auf Cookies oder die Zwischenablage zu.
- Wartende Inhalte liegen nur kurz im Arbeitsspeicher der Erweiterung. Sie werden bei Abschluss,
  Abbruch oder Verfall entfernt. Ein uebernommener Text bleibt als ChatGPT-Entwurf sichtbar.
- Die Erweiterung fuehrt keine Befehle, Fachsystemschreibaktionen oder KI-Auftraege aus. Der
  Sendeknopf wird ausschliesslich auf seinen Zustand geprueft, niemals angeklickt.

Bei geaenderter ChatGPT-Oberflaeche den Adapter mit einem erfundenen Vorgang erneut pruefen. Bis zur
Reparatur bleibt die manuelle Alternative erhalten. Die Erweiterung laesst sich jederzeit in
Chromes Erweiterungsverwaltung deaktivieren oder entfernen.
