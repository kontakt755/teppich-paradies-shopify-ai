# Qualitaetsgate vor der Veroeffentlichung

Stand 2026-09-23. Gilt fuer jeden Artikel, der sichtbar geschaltet wird.
Maschinell Pruefbares steht zuerst — das muss laufen, bevor ein Mensch liest.

## Maschinell

```
npm run bodenwissen:guard        # Modell, Kannibalisierung, Verweise, Anker
npm run ratgeber:payload -- content/ratgeber/<bereich> --blog-id <gid> --kollektionen <datei>
npm run liquid:guard && npm run schema:guard && npm run template:guard && npm run theme:guard
node --test qa/tests/*.test.mjs
node workflow/cli.mjs validate --static
```

`ratgeber:payload` sperrt jeden Artikel ohne offenen Status, mit offener
`PRUEFEN`-Marke, ohne Kurzantwort, mit H1 im Text oder mit unbekanntem
Auswahlwert. Ein Lauf ohne `gesperrt`-Eintraege ist die Voraussetzung, kein Beleg
fuer Qualitaet.

## Inhalt

- [ ] Die Suchfrage ist vollstaendig beantwortet, nicht angerissen
- [ ] Keine Aussage, die das Verlegeteam nicht bestaetigt hat
- [ ] Keine erfundenen Zahlen, Normen, Herstellerangaben oder Kundenfaelle
- [ ] Kein Fuelltext, keine Floskel-Einleitung (`SEO_RULES.md`, Abschnitt 3)
- [ ] Eigenstaendiger Mehrwert gegenueber dem, was schon im Netz steht
- [ ] Reinigungs- und Verlegehinweise sind materialabhaengig formuliert, nicht
      pauschal; wo sinnvoll steht „zuerst an unauffaelliger Stelle testen"

## UX

- [ ] Kurzantwort steht ganz oben und ist fuer sich verstaendlich
- [ ] Gliederung folgt der Frage, nicht dem Belieben
- [ ] Auf dem Handy gepruefte Tabellen — breite Tabellen werden Karten
- [ ] Rechner und interaktive Teile sind mit dem Daumen bedienbar
- [ ] CTAs stehen nach dem Inhalt, hoechstens vier

## SEO

- [ ] Eindeutiger Title, eindeutige H1, sinnvolle Description
- [ ] Canonical korrekt, Seite indexierbar, in der Sitemap
- [ ] Keine Kannibalisierung (Gate plus menschliche Pruefung, `SEO_RULES.md` 7)
- [ ] Interne Links gesetzt und beschreibend benannt
- [ ] `Article` und `BreadcrumbList` validieren; `VideoObject` nur mit Video

## Vertrauen

- [ ] Autor bzw. Redaktion genannt
- [ ] „Fachlich geprueft von … · Stand …" **nur**, wenn wirklich geprueft wurde
- [ ] `dateModified` ehrlich — keine kosmetische Aktualisierung
- [ ] Praxisbehauptungen sind belegbar
- [ ] Quellen dokumentiert, bei kritischen Angaben sichtbar verlinkt

## Technik

- [ ] Keine JavaScript-Fehler in der Konsole
- [ ] Keine kaputten Links
- [ ] Bilder mit `width`/`height`, `alt`, modernem Format, Lazy Loading ausser
      oben; `alt` beschreibt das Bild und ist nicht mit Begriffen vollgestopft
- [ ] Tastaturbedienung und sichtbarer Fokus geprueft
- [ ] Keine Regression im uebrigen Shop

## Nach dem Livegang

- [ ] Seite liefert 200, steht in `sitemap_blogs_1.xml`
- [ ] Brotkrume stimmt mit der sichtbaren Hierarchie ueberein
- [ ] Artikel ist ueber die Shop-Suche auffindbar
- [ ] Nach zwei bis vier Wochen: Indexierungsstatus pruefen. **Kein
      Rankingurteil nach wenigen Tagen.**
