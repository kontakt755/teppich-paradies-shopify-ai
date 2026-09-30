# Meta-Zugang einrichten (Instagram und Facebook)

Einmalig, rund 20 Minuten, am Rechner des Inhabers. Danach veröffentlicht der
Publisher freigegebene Beiträge von selbst. Ohne diesen Zugang arbeitet alles
andere weiter – nur hinaus geht nichts.

## Voraussetzungen

1. **Eine verwaltete Facebook-Seite** für Teppich Paradies. Gibt es nur die
   inoffizielle Ortsseite: diese über „Ist das dein Unternehmen?" beanspruchen
   oder eine Seite anlegen und die Ortsseite zusammenführen lassen.
2. **Instagram als Business-Konto**: in der Instagram-App unter Einstellungen →
   „Kontotyp und Tools" → „Zu professionellem Konto wechseln" → Unternehmen.
3. **Verknüpfung**: Meta Business Suite → Einstellungen → Konten → Instagram-Konto
   mit der Seite verbinden.

## Zugang anlegen

Meta benennt Menüpunkte häufig um – die Wege unten beschreiben, was zu tun
ist; die Beschriftung kann abweichen.

1. `developers.facebook.com` → **App erstellen** → Anwendungsfall „Sonstiges" →
   Typ **Business** → Name z. B. „TP Social". Eine App-Prüfung durch Meta ist
   nicht nötig, solange die App nur die eigenen Konten verwaltet.
   **Wichtig:** unter Einstellungen → Allgemein die Datenschutzrichtlinie
   `https://www.teppich-paradies.net/policies/privacy-policy` eintragen und die
   App auf **Live** stellen. Beiträge einer App im Entwicklungsmodus sieht nur,
   wer eine Rolle in der App hat – nicht die Öffentlichkeit.
2. `business.facebook.com` → **Unternehmenseinstellungen** → Nutzer →
   **Systemnutzer** → hinzufügen (Rolle Admin) → dem Systemnutzer die Seite und
   das Instagram-Konto zuweisen (volle Kontrolle) und die App zuweisen.
3. Beim Systemnutzer **Token generieren**, App auswählen, Ablauf „nie",
   Berechtigungen:

   ```
   pages_show_list  pages_read_engagement  pages_manage_posts  read_insights
   instagram_basic  instagram_content_publish  instagram_manage_insights
   business_management
   ```

   Der Token eines Systemnutzers läuft nicht ab. (Ein Token aus dem Graph API
   Explorer ginge auch, hält aber nur 60 Tage.)

## Eintragen

Den Token **nicht in einen Chat oder eine Datei im Repository kopieren**. Im
Terminal auf dem Betriebsrechner – die Eingabe bleibt verdeckt und landet nur
in `~/teppich-paradies-analyse/social/zugang.env` (außerhalb des Repositorys):

```
read -rs "T?Systemnutzer-Token einfügen und Enter: " && printf '\nMETA_SYSTEM_TOKEN=%s\n' "$T" >> ~/teppich-paradies-analyse/social/zugang.env && unset T && chmod 600 ~/teppich-paradies-analyse/social/zugang.env && echo " gespeichert"
```

Dann leitet das System alles Weitere selbst ab – Seiten-ID, den dauerhaften
Seiten-Token und das verknüpfte Instagram-Konto – und trägt es ein, ohne einen
Token anzuzeigen:

```
npm run social -- meta-einrichten
npm run social -- meta-pruefen
```

Gehören dem Systemnutzer mehrere Seiten, nennt `meta-einrichten` sie; dann
`SOCIAL_META_SEITE=<Name oder ID>` in `zugang.env` setzen und erneut ausführen.

Die Prüfung nennt Seite, Instagram-Konto und Followerzahlen. Stimmt beides,
zeigt die Zentrale „Meta verbunden".

## Der erste Beitrag

Der Publisher ist gegen einen Nachbau der Meta-API getestet, nicht gegen die
echte. Deshalb beim ersten Mal zusehen:

```
npm run social -- veroeffentlichen --trocken   # zeigt, was er täte
npm run social -- veroeffentlichen             # veröffentlicht, was fällig ist
```

Am besten mit einer Story beginnen – sie verschwindet nach 24 Stunden von
selbst. Erscheint sie auf beiden Kanälen, läuft der Rest über den Takt.

## Token erneuern / Störungen

| Anzeige | Bedeutung | Abhilfe |
|---|---|---|
| Beitrag im Status „Fehler": „Code 190" | Token ungültig oder entzogen | neuen Systemnutzer-Token erzeugen, `META_SYSTEM_TOKEN` in `zugang.env` ersetzen, `meta-einrichten`, Beitrag erneut freigeben |
| Beitrag erschienen, aber öffentlich nicht sichtbar | App im Entwicklungsmodus | App auf **Live** stellen (Schritt 1) |
| „Code 10" / „Code 200" | Berechtigung fehlt | Berechtigungen aus Schritt 3 prüfen, Seite und Instagram dem Systemnutzer zugewiesen? |
| „Instagram-Konto nicht verknüpft" | `META_IG_USER_ID` fehlt oder Konto nicht Business | Voraussetzungen 2 und 3 |
| „verarbeitet das Medium noch" | Instagram braucht länger | nichts – der nächste Takt versucht es erneut |

`META_GRAPH_VERSION` (Standard `v24.0`) lässt sich in `zugang.env` überschreiben,
wenn Meta die Version abkündigt.

## Reels

Reels brauchen keine öffentliche Adresse: der Publisher lädt das Video direkt
zu Instagram hoch („resumable upload“ an `rupload.facebook.com`) und als
Seitenvideo zu Facebook. Instagram verarbeitet ein Video einige Minuten; der
Publisher wartet bis zu zehn Minuten, sonst versucht es der nächste Takt.

Wie beim ersten Bildbeitrag: das erste Reel beobachtet veröffentlichen. Der
Upload-Weg ist nur gegen einen Nachbau der API getestet.
