# Fußleiste: bei Lieferant A ketteln oder beim eigenen Kettler (Versand per Paket)?

Stand 2026-10-19. Nur gerechnet, **in Shopify ist nichts geändert**, keine Bestellung, keine Mail an
Lieferanten. Produkt `teppich-fussleiste-gekettelt`, Preisregel `domains/shopify/fussleiste-preisstufen.md`,
Vorarbeit `docs/analyse/fussleiste-echte-kosten-2026-10-19.md` (PR #1416).

Frage des Benutzers: Lohnt es sich, den ungekettelten Streifen von Lieferant A zu unserem Kettler
(Berlin-Charlottenburg, ~31 km von Oranienburg) zu bringen, dort ketteln zu lassen und die Leiste
per Paket an den Kunden zu schicken?

## Empfehlung

**Ja, aber nur, wenn weder für die Leiste eine eigene Lieferung von Lieferant A noch eine eigene Fahrt
zum Kettler anfällt.** Der Kettler ist je Meter deutlich billiger (1,55 € bei 5–7 cm, 0,55–0,75 € bei
8–10 cm). Eine eigens gefahrene Tour nach Charlottenburg (~64 €) oder eine eigene Lieferung von
Lieferant A (19,90 € Logistik + 18 € Mindermenge) frisst diese Ersparnis aber bei jeder üblichen
Leistenlänge auf.

| Fall | Weg K lohnt sich gegenüber Weg A … |
|---|---|
| Kunde im Verlegegebiet, der Bodenleger holt beim Kettler ab und fährt ohnehin hin | **immer**, ab dem ersten Meter. Es gibt kein Paket. |
| Paketkunde. Der Streifen kommt mit der ohnehin laufenden Sammellieferung von A in den Laden, und der Kettler liegt auf einer ohnehin geplanten Berlin-Fahrt | **5–7 cm ab ~10 m** (ab 12 m, also 3 ganzen Streifen à 4 m). **8–10 cm ab ~20–30 m** (9–10 cm ab ~19–23 m, 8 cm ab ~26–31 m). |
| wie oben, aber die Berlin-Fahrt (~64 €) teilen sich nur 3 Kettelaufträge | 5–7 cm ab ~23 m, 8–10 cm ab ~47 m |
| Für die Leiste fallen eine eigene Lieferung von A **und** eine eigene Fahrt an | **praktisch nie** (Break-even 75 m bzw. 154 m) |
| A würde die Leiste ohnehin **allein** per Paket schicken (9,50 €) | 5–7 cm ab ~3 m, 8–10 cm ab ~6 m, also **immer** |

Faustregel für den Einkauf: **5–7 cm** mit Paket über den Kettler, sobald die Leiste mit einer
Sammellieferung und einer ohnehin geplanten Fahrt mitläuft. **8–10 cm** erst ab ~25–30 m. Leisten für
Kunden im Verlegegebiet gehen immer über den Kettler. Wenn eine eigene Fahrt oder eine eigene
A-Lieferung nötig wäre: Weg A, also Leiste mit dem Teppich bei A ketteln lassen.

Die **Entfernung zum Kunden** spielt für den Paketweg keine Rolle, das Paket kostet in ganz
Deutschland gleich viel. Entscheidend ist nur, ob die Fahrt zum Kettler zusätzlich anfällt.
Je Kilometer Umweg kostet sie ~0,30 € Fahrzeug plus Arbeitszeit. Der volle Weg
Oranienburg–Charlottenburg–Oranienburg (62 km, ~1,5 h) kostet ~64 €.

**Vorbehalt:** Der Kettelleisten-Preis von Lieferant A ist nur durch das Angebot vom 28.08. belegt,
das nach 4 Wochen abgelaufen ist. Eine Auftragsbestätigung vom 16.10. aus einer anderen Niederlassung
von A berechnet fürs Ketteln eines Teppichs 5,50 €/m statt der angebotenen 3,90 €/m. Steigt die
Kettelleiste ebenso (z. B. auf 5,50 €/m), macht Weg A mit jeder Leiste Verlust (−0,59 €/lfm bei
5–7 cm). Weg K lohnt sich dann schon ab ~6 m (5–7 cm) bzw. ~10 m (8–10 cm). Das zu klären ist die
wichtigste offene Frage (siehe unten).

## 1. Preise bei Lieferant A: was belegt ist

Quellen: Angebot vom 28.08.2026 (NL Potsdam), öffentliche Servicepreisliste Boden auf
`lieferant-a.example` (gelesen 19.10.2026), Rechnung vom 12.10.2026 (Lieferung per LKW in den Laden),
Auftragsbestätigung vom 16.10.2026 (NL Charlottenburg, Teppich nach Maß direkt an eine Endkundin per
Paketdienst). Ins Händlerportal war niemand angemeldet. Händlerpreise je Artikel waren daher nicht
lesbar, Zugangsdaten wurden nicht eingegeben.

| Posten (netto) | Angebot 28.08. | heute belegt | Quelle / Bemerkung |
|---|---:|---|---|
| Kettelleiste + Klebeband bis 8 cm | 4,50 €/m | **nicht neu belegt** | Das Angebot galt 4 Wochen („freibleibend“) und ist abgelaufen. Im Webshop von A gibt es keinen Artikel Kettelleiste, nur „Ketteln“ nach Teppichgröße. |
| Kettelleiste + Klebeband ab 8,5 cm | 4,70 €/m | **nicht neu belegt** | wie oben |
| Ketteln Teppich | 3,90 €/m | **5,50 €/m** (16.10., „rundum gekettelt“, 8 m) | **Abweichung +41 %**, andere Niederlassung als das Angebot |
| Zuschnitt rechteckig / rund | 10 € / 15 € je Stück | nicht neu belegt | — |
| Mindermengenzuschlag | 18 € | **18 €** (Rechnung 12.10., bei 61 € Warenwert) | Laut Servicepreisliste Boden (Stand April 2025) fällt er **unter 300 € Auftragswert** an, zusätzlich zur Logistikpauschale. Die Heimtex-Liste (Januar 2026) nennt 7,50 € unter 75 €, auf der Rechnung stand trotzdem „Mindermengenzuschlag Heimtex 18 €“. |
| Logistikbeitrag (LKW) | 19,90 € je Liefertag und -ort | **19,90 €** (Rechnung 12.10.) | Laut Liste „je Lieferung, auch mehrere Aufträge zusammengefasst“: Wer am selben Tag an denselben Ort mehrere Aufträge bekommt, zahlt ihn einmal. |
| Versand Paketdienst direkt an Endkunden | — | **9,50 € je Sendung** (AB 16.10., 95 € Warenwert) | Auf dieser Paketsendung standen **weder Mindermengenzuschlag noch Logistikbeitrag**. Ob das eine Regel ist oder nur dieser Fall, ist offen. |
| Fracht Heimtex unter 300 € | — | 15,90 € (LKW) / 11,90 € (paketfähig) | Servicepreisliste Heimtex, Januar 2026. Für Boden-Standorte gilt die Boden-Liste. |
| Rücknahme aus Kulanz | — | 20 % Abschlag, mind. 50 € (Boden) | Servicepreisliste. Gekettelte Ware ist Sonderanfertigung und wird nie zurückgenommen. |

Das Teppichmaterial für den Streifen kauft man in beiden Wegen bei Lieferant A, es fällt im Vergleich
heraus. Verglichen werden nur Fertigung und Logistik.

## 2. Annahmen für Weg K (nicht belegt, bitte prüfen)

| Posten | Ansatz | Herleitung |
|---|---:|---|
| Kettler: Kettelleiste bis 7 cm / 7–12 cm | 2,95 / 3,95 €/lfm netto | aus seinen Rechnungen (Gedächtnis); ob Klebeband dabei ist, ist offen |
| Paket an den Kunden | 7,69 € bis 5 kg, 10,49 € bis 10 kg, darüber 2 Pakete | öffentliche Privatkundenpreise eines großen Paketdienstes, Stand 01.01.2026. Einen eigenen Versandvertrag gibt es nach Repo und Gedächtnis nicht. Zum Vergleich: Lieferant A berechnet 9,50 € je Paket. |
| Verpacken | 6,50 € je Auftrag | Karton/Band ~1,50 € + 10 min à 30 €/h |
| Fahrt zum Kettler, eigens gefahren | 63,60 € | 62 km × 0,30 € + 1,5 h × 30 €/h (Stundensatz angenommen). Bringen und Abholen in **einer** Fahrt (warten oder beim nächsten Besuch abholen). Zwei Fahrten kosten das Doppelte. |
| Fahrt zum Kettler, gebündelt | 0 € | Der Kettler liegt auf einer ohnehin geplanten Berlin-Fahrt, oder der Bodenleger holt ab |
| Gewicht | 3 kg/m² Leiste + 0,8 kg Klebeband/Karton | Teppichboden wiegt etwa 1,5–3,5 kg/m² (Beleg 16.10.: 3,36 m² = 4,97 kg, also 1,5 kg/m²). Angesetzt ist der schwere Fall. |
| Maße | jeder 4-m-Streifen einzeln aufgerollt, Ø ~23 cm (bei 10 mm Dicke), ~28 cm (15 mm) | Die Rollen werden gestapelt: 12 m = 3 Rollen, Höhe 18–30 cm; 40 m × 10 cm = 10 Rollen, ~100 cm hoch. Das passt in Standardpakete (bis 120 × 60 × 60 cm), notfalls in zwei. **Gestreckt geht eine 4-m-Leiste nicht als Paket.** |

Fertigungserlös: Im Kundenpreis stecken netto **4,91 €/lfm (5–7 cm) bzw. 4,93 €/lfm (8–10 cm)**
für das Ketteln. Das ist der Mittelwert über alle Preisstufen, Spanne 4,66–5,00 €. Gerechnet ist es
wie in PR #1416: (Preis − Höhe × Stufenobergrenze) ÷ 1,19, das Material also zur Obergrenze der Stufe.
Die Materialmarge kommt in beiden Wegen gleich dazu.

## 3. Deckungsbeitrag Ketteln je Auftrag (netto, heutige Shop-Preise)

DB = Fertigungserlös − Kettelkosten − auftragsbezogene Fixkosten. In Klammern je lfm.
Weg A mit 4,50 € (5–7 cm) bzw. 4,70 € (8–10 cm, bei 8 cm wären es 4,50 €).

- **A mit Teppich:** A kettelt die Leiste und liefert sie mit dem Teppich. Keine Zusatzkosten, Logistik und Versand fallen für den Teppich ohnehin an.
- **A allein:** A schickt die Leiste als eigene Paketsendung, + 9,50 €. Falls zusätzlich der Mindermengenzuschlag fällig wird: weitere 18 € weniger.
- **K lokal:** Kunde im Verlegegebiet. Der Streifen kommt mit der Sammellieferung, der Bodenleger holt beim Kettler ab und bringt die Leiste mit. Kein Paket, keine Zusatzfahrt.
- **K Paket gebündelt:** Sammellieferung in den Laden, Fahrt zum Kettler ohnehin geplant, wir verpacken und schicken das Paket.
- **K Paket eigen:** eigene Lieferung von A (19,90 + 18 €) und eine eigens gefahrene Tour (63,60 €), dazu Verpackung und Paket.

| Höhe | Länge | Gewicht ca. | A mit Teppich | A allein | K lokal | K Paket gebündelt | K Paket eigen |
|---|---:|---:|---:|---:|---:|---:|---:|
| 5–7 cm | 12 m | 3,0 kg | 4,92 (0,41) | −4,58 (−0,38) | 23,52 (1,96) | 9,33 (0,78) | −92,17 (−7,68) |
| 5–7 cm | 20 m | 4,4 kg | 8,20 (0,41) | −1,30 (−0,06) | 39,20 (1,96) | 25,01 (1,25) | −76,49 (−3,82) |
| 5–7 cm | 40 m | 8,0 kg | 16,40 (0,41) | 6,90 (0,17) | 78,40 (1,96) | 61,41 (1,54) | −40,09 (−1,00) |
| 8–10 cm | 12 m | 4,0 kg | 2,76 (0,23) | −6,74 (−0,56) | 11,76 (0,98) | −2,43 (−0,20) | −103,93 (−8,66) |
| 8–10 cm | 20 m | 6,2 kg | 4,60 (0,23) | −4,90 (−0,25) | 19,60 (0,98) | 2,61 (0,13) | −98,89 (−4,94) |
| 8–10 cm | 40 m | 11,6 kg | 9,20 (0,23) | −0,30 (−0,01) | 39,20 (0,98) | 17,32 (0,43) | −84,18 (−2,10) |

Was die Tabelle zeigt:

- **Weg A ist knapp kostendeckend** (0,23–0,41 €/lfm), solange die Leiste mit dem Teppich kommt.
  Als eigene Sendung macht sie fast immer Verlust.
- **K lokal ist der beste Weg** und bringt das 2- bis 5-Fache von Weg A.
- **K mit Paket schlägt Weg A bei 5–7 cm ab 12 m**, bei 8–10 cm erst bei langen Leisten.
- **Eine eigene Lieferung plus eigene Fahrt nur für die Leiste macht immer Verlust.**

## 4. Break-even (Länge, ab der Weg K mit Paket günstiger ist als Weg A mit Teppich)

Break-even = Fixkosten Weg K ÷ (Kettelpreis A − Kettelpreis Kettler)

| Fixkosten Weg K je Auftrag | 5–7 cm (Δ 1,55 €/m) | 9–10 cm (Δ 0,75 €/m) | 8 cm (Δ 0,55 €/m) |
|---|---:|---:|---:|
| Verpackung + Paket bis 5 kg (14,19 €) | 9 m | 19 m | 26 m |
| Verpackung + Paket bis 10 kg (16,99 €) | 11 m | 23 m | 31 m |
| + ein Drittel einer eigenen Fahrt (35,39 €) | 23 m | 47 m | 64 m |
| + eigene A-Lieferung und eigene Fahrt (115,69 €) | 75 m | 154 m | 210 m |
| gegen „A allein per Paket“ (Mehrkosten 4,69 €) | 3 m | 6 m | 9 m |
| **falls A die Leiste inzwischen für 5,50 €/m kettelt**, Paket bis 5/10 kg | 6 / 7 m | 9 / 11 m | 9 / 11 m |

## 5. Ablauf, der die Bedingungen erfüllt

1. Den Streifen (ungekettelt, „ganze Streifen à Rollenbreite“) **als Position im selben Auftrag wie den
   Teppich** bei A bestellen, Lieferort Laden, Liefertag einer ohnehin laufenden Sammellieferung. Dann
   fallen weder ein zweiter Logistikbeitrag noch ein eigener Mindermengenzuschlag an. Ob A eine Position
   an eine andere Anschrift liefert als den Rest des Auftrags, ist offen.
2. Fahrten zum Kettler **bündeln**: feste Berlin-Tour, Abholung durch den Bodenleger oder Sammeln
   mehrerer Kettelaufträge. Lieferant A hat eine Niederlassung in Charlottenburg in der Nähe des Kettlers.
   Ob man dort Ware abholen oder A direkt an den Kettler liefern lassen kann, ist offen.
3. Beim Kettler jeden 4-m-Streifen einzeln aufrollen lassen, mit Klebeband sichern, als Paket verschicken.
   Der Kunde bekommt dann zwei Sendungen (Teppich von A, Leiste von uns). Die Leiste kommt um die
   Kettel- und Abholzeit später, das gehört in die Lieferzeit-Angabe.
4. Passt das nicht (keine Sammellieferung, keine Fahrt in Sicht, 8–10 cm unter ~25 m): Leiste mit dem
   Teppich bei A ketteln lassen.

## Offen (Fragen an Lieferant A → Werkbank, der Inhaber fragt selbst)

- Aktueller Preis „Ketteln Sockelleiste + Klebeband“ bis 8 cm / ab 8,5 cm, in **beiden** Niederlassungen
  (Potsdam hat 4,50/4,70 angeboten, Charlottenburg kettelt Teppich inzwischen für 5,50 statt 3,90).
- Gilt der Mindermengenzuschlag je Auftrag oder je Lieferung, und fällt er auch auf Paketsendungen an
  Endkunden (am 16.10. nicht berechnet)?
- Kann ein Auftrag Teppich direkt an den Kunden **und** den Leistenstreifen an den Laden bzw. an den
  Kettler liefern, ohne zweiten Logistikbeitrag und Mindermengenzuschlag?
- Paketversand an Endkunden pauschal 9,50 € oder nach Gewicht/Größe?
- Beim Kettler: Ist Klebeband im Leistenpreis enthalten? Gilt 7 cm als „bis 7 cm“? Verschickt er selbst,
  und gibt es einen Mindestpreis je Auftrag?
- Eigener Paketvertrag: Mit Geschäftskundenkonditionen wäre das Paket billiger als die angesetzten 7,69/10,49 €.
  Der Break-even sinkt dann entsprechend.
