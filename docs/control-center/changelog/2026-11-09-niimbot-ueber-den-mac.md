## 2026-11-09 · Aufkleber drucken „Über den Mac“ – ohne Chromes Bluetooth-Auswahl (#2059)

- **Geaendert:** Im Druckdialog (Packstation, Muster-Etiketten, eigene Aufkleber) gibt es am Mac
  (127.0.0.1) die Verbindung „Über den Mac (ohne Auswahlfenster)“. Der Dialog rendert die Aufkleber wie
  bisher und schickt sie an `/api/etiketten/mac-druck`; der Dashboard-Server druckt sie über eine kleine
  Swift-Brücke (`operations/niimbot/`, nur Bordmittel: CoreBluetooth, `swiftc`) direkt auf dem B1.
  Damit kann auch Claude Aufkleber drucken – Chromes Geräteauswahl konnte nur ein Mensch bedienen.
  Das B1-Protokoll ist aus niimbluelib 0.47.1 nachgebaut, statt CDN-Code im Server auszuführen.
- **Getestet:** `node --test operations/tests/niimbot-b1.test.mjs` (6 grün: Pakete, Zeilenkodierung,
  Ablauf, Druckerfehler); Testdruck Rahmen per Node (Drucker meldet Seite fertig) und Adressaufkleber
  aus der Packstation einer Prüfinstanz mit Datenkopie über „Über den Mac“ (5,9 s, kein Auswahlfenster);
  `npm run -s pruefen` alle 11 Schritte grün.
- **Risiken/Annahmen:** Die Brücke muss einmal je Mac gebaut sein (`npm run niimbot:bauen`, liegt unter
  `~/Library/Application Support/TeppichParadies/`); sonst meldet der Druck „nicht eingerichtet“. Auf diesem
  Weg gibt es kein Abbrechen und kein „weiter ab Aufkleber n“; Bluetooth und USB bleiben unverändert
  (Standard Bluetooth). Nur am Mac selbst – über Tailscale oder WLAN erscheint die Option nicht.
- **Nächste Stufe:** Bewährt es sich, „Über den Mac“ am Mac als Standard vorwählen.
