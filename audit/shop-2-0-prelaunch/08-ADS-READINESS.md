# Ads-Readiness (Quality Gate § 49) – Stand 2026-09-22, Zwischenstand

Bewertung je Prüfung: ✅ bestanden · ❌ nicht bestanden · ⏳ vorbereitet, Einrichtung/Prüfung offen · ❓ nicht messbar in dieser Umgebung. Kein Gesamtscore – Ads sind **nicht READY**, solange ein ❌ oder ⏳ in P0 steht.

## Produkt
| Prüfung | Status | Beleg |
|---|---|---|
| Produktnamen korrekt, keine Lieferantennamen kundenseitig | ✅ | 01-CURRENT-STATE 1.1 (Theme-Texte), Vendor = Produktlinie |
| Interne Zuordnung vorhanden | ❌ | `lieferant.hersteller` 8/250, `lieferant_a_produktname` 49/250; nur `grosshandel.sku` vollständig (PL-014) |
| Bilder korrekt | ⏳ | PL-001 behoben (Rapidia); PL-002/003/032 offen; systematische Sichtprüfung Struktur/Farbe je Produkt nicht durchgeführt |
| Farben korrekt | ❓ | Farbregister vorhanden (`custom.farbe`), 47/50 Teppichböden nur „Farbe NN" (Memory-Stand 2026-09-08), nicht neu geprüft |
| Preise/Varianten korrekt | ⏳ | Einheitspreis an 236 Paketvarianten; 2 Produkte mit falschem Maß (`verona-terrazzo-*`) offen |
| Daten konsistent | ⏳ | Telefon/Öffnungszeiten/Lieferzeit/Versandschwelle bereinigt (M2); Radius 15/50 km Entscheidung offen (PL-009); Wunschmaß-Grenzen dreifach (PL-028) |

## Kaufprozess
| Prüfung | Status | Beleg |
|---|---|---|
| Muster funktioniert | ✅ | Bestellungen #1003–#1009; Limit 3, Properties vollständig |
| Maßrechner funktioniert | ⏳ | vorhanden; Alt-Audit TP-001…TP-017 (P2/P3) offen |
| Warenkorb funktioniert | ✅ | Gruppen/Sperren, Fläche, Pakete; M5 geprüft |
| Beratung funktioniert | ✅ (Arbeitstheme) | M5: Pflichtfrage, Attribute in `/cart.js`, Reload, Drawer, Mobil |
| Telefonnummervalidierung | ✅ | ≥ 6 Ziffern, erlaubte Zeichen; Unit-Tests |
| Checkout funktioniert | ❓ | kein Testkauf in dieser Sitzung; Express-Buttons erst nach Antwort |
| Mobil funktioniert | ⏳ | Cart mobil geprüft; Touch-Targets 17–24 px (PL-021) offen |

## Kommunikation
| Prüfung | Status | Beleg |
|---|---|---|
| Bestellbestätigung geprüft | ✅ | im Admin gespeichert, Shopify-Vorschau fehlerfrei (22.09.) |
| Musterbestätigung geprüft | ✅ (Vorlage aktiv) | Muster-Zweig im selben Baustein; echte Musterbestellung als Gegenprobe offen |
| Versandbestätigung geprüft | ✅ | gespeichert, Vorschau mit Tracking fehlerfrei |
| Tracking geprüft | ❓ | keine Sendung in dieser Sitzung |
| Bestellstatus geprüft | ❓ | Horizon-Standard, nicht angepasst |
| Interne Meldung Beratung | ⏳ | Block fertig; im Admin-Editor eingesetzt, **Speichern durch Freigabe-Filter gesperrt** (Tab offen) |

## Ads
| Prüfung | Status | Beleg |
|---|---|---|
| Merchant Center sauber | ✅ | 225/225 genehmigt, 0 Probleme (Google-&-YouTube-App, 22.09.); Versandrichtlinie live |
| Produktfeed sauber | ✅ | 225/225 genehmigt; SKUs bereinigt, Marlow-Doppelung entfernt; Feedtitel-Regel optional (`domains/marketing/merchant-center-feedtitel.md`) |
| Conversion Tracking sauber | ✅ | GA4 G-3KKWHJHS0D + Ads 334-557-2870 verknüpft, Kauf primär; live nach Consent gemessen (22.09.) |
| Purchase nicht doppelt | ✅ | eine primäre Kauf-Aktion über die App; im Ads-Konto bereits vorhandene Conversion-Aktionen vor Kampagnenstart auf „sekundär" prüfen |
| Muster getrennt | ⏳ | Muster laufen als 0-€-Kauf; Trennung per Custom Pixel (`domains/marketing/tracking-pixel-vorlage.md`, ID G-3KKWHJHS0D) noch nicht eingerichtet – für Kampagnen mit Kaufwert-Optimierung unkritisch, da 0 € keinen Wert liefert |
| Consent geprüft | ✅ | Shopify-nativ, Consent Mode v2 (Messung 16.09.) |

## Technik
| Prüfung | Status | Beleg |
|---|---|---|
| Keine kritischen JS-Fehler | ⏳ | Cart/PDP/Kollektion im Arbeitstheme ohne Fehler bei Sichtprüfung; kein vollständiger Konsolen-Sweep |
| Keine 404 / kaputten Links | ⏳ | `menu:guard` 49/49 ok; Versandrichtlinie `/policies/shipping-policy` 404 bleibt |
| Performance akzeptabel | ❌ | Lighthouse 13 mobil (simuliert, live, 22.09.): Start 54 / LCP 8,9 s, Kollektion 68 / LCP 10,1 s, PDP 64 / LCP 7,7 s; CLS 0 |
| SEO nicht beschädigt | ✅ | keine URL-/Handle-Änderung in dieser Sitzung; Canonicals/Meta unverändert |
