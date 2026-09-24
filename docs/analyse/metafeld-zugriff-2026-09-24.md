# Metafeld-Zugriff: fuenf `lieferant.*`-Definitionen von PUBLIC_READ auf NONE

**Datum:** 2026-09-24 · **Shop:** `sjjyq1-6w.myshopify.com` · **Anlass:** Befund in
`docs/analyse/ai-auffindbarkeit-2026-09-23.md`

Fuenf Definitionen mit internen Beschaffungsdaten standen auf
`access.storefront = PUBLIC_READ` und waren damit ueber die Storefront API mit
**jedem** Token lesbar — auch mit dem oeffentlichen, das im Theme-HTML steht.
Sie stehen jetzt auf `NONE`.

## Die entscheidende Frage zuerst: verliert Liquid den Zugriff?

**Nein.** Das ist der Punkt, an dem die Umstellung haette scheitern koennen,
deshalb zweifach belegt.

**Dokumentation** — shopify.dev, „About metafields", Abschnitt *Storefront
permissions* (<https://shopify.dev/docs/apps/build/metafields>), woertlich:

> `storefront` controls permissions for the Storefront API (used by headless and
> custom storefronts). This setting doesn't affect Liquid templates - metafields
> are always accessible in Liquid regardless of this setting.

**Messung** — Wegwerf-Vorlage `templates/product.tp-mf-probe.liquid` im
**Arbeitstheme** (unveroeffentlicht, nie Preview-Ziel), gerendert ueber
`?view=tp-mf-probe&preview_theme_id=<arbeit>` am Produkt
`solano-teppichboden-400cm-500cm`. Die Vorlage gibt nur Werte aus, `layout none`.

Der Beleg braucht keinen Vertrauensvorschuss, weil die Probe eine
**Kontrollgruppe** enthielt: drei Felder standen schon **vor** jeder Aenderung
auf `NONE` und wurden von Liquid trotzdem gelesen.

| Feld | `storefront` bei der Messung | Liquid-Ausgabe |
|---|---|---|
| `lieferant.lieferant_a_artikelnummer` | NONE (schon vorher) | `TEPLIMBO4_090` |
| `lieferant.lieferant_a_farbnummer` | NONE (schon vorher) | `90` |
| `grosshandel.sku` | NONE (schon vorher) | Linienname, gelesen |
| die fuenf umgestellten | NONE (neu) | alle fuenf weiter gelesen |

Dieselbe Vorlage nach der Umstellung erneut gerendert (Cache-Buster in der URL):
identische Ausgabe, alle fuenf Werte weiter vorhanden.

## Und schliesst `NONE` das Leck wirklich?

Gemessen gegen die echte Storefront API (`POST /api/2025-07/graphql.json`) mit
dem **oeffentlichen Theme-Token** aus dem Live-HTML — also genau der Zugang, der
jedem Besucher offensteht.

| Feld | vorher | nachher |
|---|---|---|
| `lieferant.hersteller` | lesbar (Herstellername mit Rechtsform und Standort) | `null` |
| `lieferant.match_status` | lesbar | `null` |
| `lieferant.abgleich_datum` | lesbar | `null` |
| `lieferant.bevorzugt` | lesbar | `null` |
| `lieferant.alternativ` | lesbar | `null` |
| `lieferant.wunschmass` | lesbar | **lesbar** (muss so bleiben) |
| `lieferant.kettelung` | lesbar | **lesbar** (muss so bleiben) |
| `lieferant.lieferant_a_artikelnummer` | `null` | `null` |

Die Umstellung wirkt **sofort** und **feldgenau**: nach dem ersten Schreibvorgang
war `hersteller` schon `null`, waehrend `match_status` noch lesbar war.

## Wer liest die fuenf Felder?

Geprueft, bevor etwas umgestellt wurde.

- **Theme/Liquid:** nichts. Aus dem Namespace `lieferant` liest das Theme genau
  `wunschmass` und `kettelung` (`blocks/tp-rollware-rechner.liquid:591-592`) —
  beide bleiben `PUBLIC_READ`. Von den fuenf kommt keines im Theme vor.
- **Storefront API aus dem Theme:** gar keine. Weder `graphql.json`-Aufrufe noch
  Storefront-Web-Components in `assets/`, `snippets/`, `sections/`, `blocks/`,
  `layout/`. Das Theme rendert alles serverseitig ueber Liquid.
- **Storefront-Filter:** keiner. Im Shop filtern nur `custom.arten`,
  `custom.optik`, `custom.rollenbreite` und `service.kettelservice`. Ein Filter
  auf `lieferant.*` existiert nicht — also konnte auch keiner brechen.
- **`operations/*` (Bestelluebersicht, Einkauf):** liest `lieferant.bevorzugt`,
  aber ueber die **Admin** API (`workflow/graphql-proxy.mjs` →
  `/admin/api/<v>/graphql.json`). `access.storefront` beruehrt das nicht.
- **Interne Bestellmail** (`domains/shopify/benachrichtigungen/interne-bestellmail-block.liquid`)
  liest `lieferant.lieferant_a_/b_artikelnummer` und `grosshandel.sku` — alle drei
  standen schon vorher auf `NONE` und funktionieren unveraendert. Das ist
  zugleich der Praxisbeleg, dass Benachrichtigungs-Liquid von `storefront`
  unabhaengig ist.
- **Apps:** `appInstallations` ist fuer das MCP-Token gesperrt („access denied"),
  die Liste liess sich nicht direkt lesen. Ersatzweise geprueft:
  - Sales-Channels laut API: Onlineshop, Shop, Point of Sale, **Google &
    YouTube**. Der Feed-Kanal bezieht Produktdaten ueber die Admin API, nicht
    ueber den oeffentlichen Storefront-Token; Metafelder nur, wenn sie in den
    Kanal-Einstellungen ausdruecklich zugeordnet sind — `lieferant.*` ist dort
    nicht zugeordnet, sonst wuerden die Werte im Feed stehen.
  - Fremd-Skripte im Live-HTML: nur `static.elfsight.com/platform/platform.js`
    (Widget-Plattform) und Shopifys eigener `web-pixels-manager`. Keine Such-,
    Filter- oder Feed-App eines Drittanbieters.
  - Keine Definition im Namespace `app--*`.

  **Restrisiko, ausdruecklich benannt:** ohne `appInstallations` ist das ein
  Ausschluss ueber Indizien, kein Vollbeweis. Eine App, die `lieferant.*` per
  Storefront API bezoege, wuerde ab jetzt `null` bekommen. Fiele nach diesem
  Livegang irgendwo eine Beschaffungsanzeige aus, ist das die erste Spur.

## Was geaendert wurde

Einzeln per `metafieldDefinitionUpdate`, jeweils mit Ruecklesung — `userErrors: []`
gilt nicht als Beleg. Gegenprobe zum Schluss nochmals frisch ueber
`metafieldDefinitions`.

| Ebene | Key | `storefront` | Anzahl Werte |
|---|---|---|---|
| PRODUCT | `lieferant.hersteller` | PUBLIC_READ → NONE | 9 |
| PRODUCT | `lieferant.match_status` | PUBLIC_READ → NONE | 52 |
| PRODUCT | `lieferant.abgleich_datum` | PUBLIC_READ → NONE | 52 |
| PRODUCTVARIANT | `lieferant.bevorzugt` | PUBLIC_READ → NONE | 956 |
| PRODUCTVARIANT | `lieferant.alternativ` | PUBLIC_READ → NONE | 123 |

Keine Werte angetastet, keine Keys geaendert (Keys sind unveraenderlich).
`admin` blieb bei allen fuenf `PUBLIC_READ_WRITE`, `customerAccount` bei `NONE`,
`validations` leer, `pinnedPosition` unveraendert.

**Anzeigenamen und Beschreibungen** (Regel 8, keine Lieferanten-Klarnamen):

- `lieferant.match_status`, Name: `Abgleich <Klarname>/<Klarname>` →
  **`Abgleich Lieferant A/B`**.
- `lieferant.bevorzugt`, Beschreibung: nannte beide Klarnamen →
  **`a oder b, bei beiden gilt a wegen Zuschnitt und Kettelung`**. Das war nicht
  ausdruecklich beauftragt, steht aber unter derselben Regel und war im selben
  Schreibvorgang ohne Zusatzrisiko moeglich. Die Werte selbst waren schon
  neutral (`a`/`b`).

### Eine Falle im Input, die beinahe Schaden angerichtet haette

`MetafieldAccessUpdateInput.admin` akzeptiert als Eingabe **nur**
`MERCHANT_READ` und `MERCHANT_READ_WRITE`. Der Ist-Wert aller fuenf Felder ist
aber `PUBLIC_READ_WRITE` — den gibt es als Eingabewert nicht. Wer hier
„sicherheitshalber alles mitsendet" (wie es `SEOInput` verlangt, siehe
`docs/lessons/`), setzt `admin` auf `MERCHANT_*` und sperrt damit **alle Apps**
aus („No other apps have access") — das haette Sync und Operations getroffen.

Richtig ist: **nur `storefront` senden.** Weggelassene Unterfelder bleiben, wie
sie sind — an der ersten Umstellung gemessen und danach bei allen fuenf
gegengeprueft.

## Zwei Aufraeumkandidaten

**`custom.test`** (PRODUCT, `storefront: PUBLIC_READ`) — **0 Werte**. Damit ist
es kein Leck: eine Definition ohne Werte gibt nichts heraus. Es ist reine
Hygiene, ein Ueberbleibsel. **Nicht geloescht** — Loeschen ohne ausdrueckliche
Freigabe ist gesperrt. Empfehlung: `metafieldDefinitionDelete` (ohne
`deleteAllAssociatedMetafields`, es gibt ja keine Werte). Braucht ein Wort vom
Inhaber.

**`grosshandel.externe_id`** — **es gibt keine Definition dafuer**, im Namespace
`grosshandel` existiert nur `sku` (644 Werte, `storefront: NONE`). Und es gibt
auch **keine Werte**: in 50 gepruefte Produkte hinein kam kein einziges
`externe_id` vor, nur `grosshandel.sku` (plus ein verwaistes
`grosshandel.farbe` an einem Entwurfsprodukt).

Damit ist bestaetigt, was `audit/tp-operations-v3/02-DATA-MODEL.md` schon
festhielt: `workflow/sync-grosshandel.mjs` **schreibt** `externe_id`
(Zeile 315-316) und **liest** es als Match-Key (Zeile 178) — Sync und Shop reden
aneinander vorbei. Nichts zum Aufraeumen an den Metafeldern; die Frage gehoert
zum Sync-Job, nicht hierher. Der Job laeuft nur mit einem `shpat_`-Token
(Aufgabe #34), also heute ohnehin nicht.

## Zwei Befunde, die nicht zur Aufgabe gehoeren, aber hier auffielen

**1. Die Lieferanten-Artikelnummer ist trotzdem oeffentlich — als SKU.**
`lieferant.lieferant_a_artikelnummer` steht auf `NONE`, aber derselbe Wert ist
die **Varianten-SKU** (`SKU = Artikelnummer Lieferant A`, Inhaberentscheidung),
und Shopify schreibt SKUs in das Produkt-JSON jeder Produktseite. Im Live-HTML
von `solano-teppichboden-400cm-500cm` stehen sie 93-mal. Die Umstellung aendert
daran nichts und soll es nicht. Wer die Artikelnummern wirklich nicht oeffentlich
haben will, muss die SKU-Konvention aendern — eine Inhaberentscheidung mit
Folgen fuer Bestellmail, Kommissionierliste und Musterartikel (`M-<Nummer>`),
kein Metafeld-Thema.

**2. Beschreibungen von `wunschmass` und `kettelung` nennen einen Klarnamen**
(„nur ueber <Klarname> und nicht bei Fliesen"). Nur der Admin sieht sie, nicht
das Repository und nicht die Storefront — Regel 8 ist also nicht gebrochen.
**Bewusst nicht angefasst:** beide muessen `PUBLIC_READ` behalten, und ein
Update, das `access` weglaesst, waere ein unnoetiges Risiko am laufenden
Rollenware-Rechner. Gehoert in einen eigenen kleinen Schreibvorgang, der
`access: { storefront: PUBLIC_READ }` ausdruecklich mitsendet.

## Reste

`templates/product.tp-mf-probe.liquid` liegt noch im **Arbeitstheme**. Die
MCP-Richtlinie sperrt `themeFilesDelete` („Theme deletion is blocked"), deshalb
ist die Datei auf einen reinen Kommentar reduziert und damit wirkungslos: kein
Ausgabewert, von nichts verlinkt, nie live. Loeschen kann sie nur der Admin oder
die Shopify CLI.

## Regressionspruefung

Live-Produktseite `solano-teppichboden-400cm-500cm` (echtes Live-Theme, kein
`preview_theme_id`-Cookie) nach der Umstellung:

- `"wunschmass": true` und `"kettelung": true` stehen je 27-mal im gerenderten
  Datenblock — der Rollenware-Rechner hat seine Daten unveraendert.
- Von den fuenf umgestellten Feldern kommt kein Wert im Live-HTML vor.

## Nachtrag: `domains/shopify/live-theme.json` war veraltet

Beim Auswaehlen des Test-Themes aufgefallen und per API belegt: die Datei nannte
`live` und `preview` vertauscht gegenueber der Wirklichkeit. Laut
`themes { role }` ist MAIN das Theme, das die Datei als `preview` fuehrte; beide
`updatedAt` auf `2026-09-23T12:59:48Z`, der Rollentausch lag also ueber einen Tag
zurueck, ohne dass die Datei nachgezogen wurde. `npm run theme:guard` faellt
dabei gruen aus — er prueft Theme-IDs in Anweisungsdateien, nicht die Rollen
gegen die API. Die Datei ist in diesem Zug korrigiert.
