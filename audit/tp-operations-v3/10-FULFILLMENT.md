# 10 – Fulfillment, Muster, Versand

## Ist

- Bestelldokumente: interne Bestellmail (Grosshaendler-ID-Kaskade Variante A → B → `grosshandel.sku` → Muster-SKU; Masspruefung #357 mit rotem Balken) – **nicht eingesetzt** (OPS-004). Lieferschein ohne Properties (OPS-012). Rechnung zeigt Variante + SKU seit 2026-09-16.
- Muster: eigenes Musterprodukt je Qualitaet, max. 3, eigenes Versandprofil „Kostenlose Muster" (nur DE); neues Musterprodukt muss dem Profil zugeordnet werden, sonst zahlt der Kunde Versand.
- Versand: DE 4,99 €, frei ab 50 €; EU 13,99 €; international 19,99 €; Spedition-Hinweis bei Rollen-/Paketware. Versandrichtlinie 404.
- Verlegeservice live (Theme-Einstellungen, Rollenware ja / Paketware nein); Kettelservice blockiert (0 Produkte), Regeln 1–12 fail closed.
- Beratung: kein Feld (OPS-006).
- Tracking/Fulfillment: manuell im Admin.

## Soll

**Routen je Variante** (`einkauf.route`): OWN_STOCK · SUPPLIER_TO_TP · SUPPLIER_DIRECT · SUPPLIER_TO_SITE · SAMPLE_STOCK · SAMPLE_SUPPLIER · SAMPLE_CUT · NO_PROCUREMENT. Fallback `einkauf.route_fallback` (Default SUPPLIER_TO_TP). SUPPLIER_DIRECT nur bei `einkauf.neutralversand = VERIFIED`; Pruefliste §38 dokumentiert je Lieferant im Metaobjekt.

**Auftragsspezifische Route:** Override in `ops.gruppen[].route` mit `grund` und `von`; Prioritaet §42 ohne Punkt 4 (kein Bestand) bis Bestandsfuehrung geklaert.

**Mischbestellung / Teilversand:** Gruppen je Route; Status komplett / teilweise / wartet / bewusst getrennt; Kundeninformation ueber Shopify-Versandmail, keine Lieferantennamen.

**Muster-Routen:** `einkauf.muster_quelle` steuert die Arbeitsliste MUSTER: Musterlager packen · aus Rolle schneiden · beim Lieferanten bestellen · nicht verfuegbar (Kunde informieren).

**Lieferschein:** Weil Properties dort fehlen, muessen Masse als Artikeldaten in die Kommissionierliste (Spalte aus Order-Metafeld `ops.gruppen` oder Notiz). Alternative: eigener Lieferschein aus dem Operations-Modul (PDF) – Entscheidung nach 3b.

**Neutralversand:** Keine falschen Absenderangaben erzeugen. Wenn Tracking/Verpackung den Versender zeigt, bleibt das so; kundenseitig laeuft Kommunikation ueber uns.

**Sofortmassnahme ohne Code:** Bestellmail im Admin einsetzen (5 Schritte, `domains/shopify/benachrichtigungen/README.md:85-96`), Versandrichtlinie veroeffentlichen (Vorlage liegt vor, nur Inhaber).
