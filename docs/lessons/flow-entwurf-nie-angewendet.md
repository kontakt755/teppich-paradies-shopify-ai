# Ein Flow-Entwurf sieht im Editor aus wie der aktive Flow

**Regel:** Eine Aenderung an einem Shopify-Flow gilt erst als live, wenn die
Workflow-Uebersicht sie im Reiter **„Aktiver Workflow“** zeigt und der Reiter
„Entwurf“ verschwunden ist. „Laut Benutzer angewendet“ ist kein Beleg — selbst
nachsehen. Flows, die bezahlte Bestellungen stornieren, gehoeren zu den
kritischen Aenderungen (wie Checkout).

## Was passierte

Der Flow „Zuschnitt-Bestellungen automatisch stornieren“ storniert Bestellungen
mit der Gruppe „Zuschnitt von der Rolle“, ausser eine Position ist ein Teppich
nach Mass. Die erste Fassung nahm nur den Yasmin-Kettelteppich per Produkt-ID aus.
Als am 29.10.2026 weitere Restrollen mit Raummass und Kettelteppich live gingen,
wurde die Bedingung umgebaut: keine Position mit den Tags `teppich-nach-mass`
**und** `sonderposten`. Die Sitzung durfte „Aenderungen anwenden“ nicht klicken
(Auto-Modus), speicherte den Entwurf und notierte spaeter „laut Benutzer
angewendet“, ohne nachzusehen.

Der Entwurf war nie angewendet. Am 19.11.2026 bestellte eine Kundin zwei
gekettelte Teppiche aus einer Restrolle (352,34 €, PayPal). Der alte Flow
stornierte die Bestellung 6 Sekunden nach Eingang. Die automatische Erstattung
scheiterte bei PayPal, die Bestellung stand trotzdem als storniert da.
Aufgefallen ist es nur zufaellig am naechsten Tag. Folge: Ersatzbestellung von
Hand, eine zweite MwSt.-Rechnung und eine Stornorechnung fuer die erste.

## Absicherung

- Flow am 20.11.2026 angewendet, vorher im Editor mit der echten Bestellung
  getestet (Bedingung „Falsch“, kein Storno).
- `qa/tests/restposten-entwurf.test.mjs` prueft, dass Raummass und Kettelteppich
  einer neuen Restrolle beide Tags tragen und Rolle/Zuschnitt-Bundle nicht
  `teppich-nach-mass`. Wer die Tags im Anlagecode aendert, sieht den Test rot.
- Meterware einer Restrolle bucht direkt an der Rolle und erzeugt keine
  Zuschnitt-Gruppe; der Flow greift dort nicht.
