/**
 * Angebotsassistent Teppich Paradies – Konfiguration.
 *
 * Diese Datei enthaelt nur Regelparameter und Verweise auf Lexware-Artikel
 * (Artikelnummer oder Lexware-ID). PREISE STEHEN HIER NICHT: Preise, Einheiten
 * und Beschreibungen kommen ausschliesslich aus dem aktuellen Artikelstamm
 * (Artikel_aktuell.json bzw. Lexware-Abruf). Quelle der Regeln:
 * Lexware-Skill "teppich-paradies-lexware-angebote" (references/angebotsregeln.md).
 *
 * Laeuft unveraendert in Google Apps Script (globaler Namensraum) und in
 * Node-Tests (per vm geladen).
 */
var TP_KONFIG = {
  version: '2026-10-13',
  waehrung: 'EUR',
  steuersatzStandard: 19,

  lexware: {
    basisUrl: 'https://api.lexware.io',
    appUrl: 'https://app.lexware.de',
    // Regel aus der API-Doku: hoechstens 2 Anfragen pro Sekunde.
    pauseMs: 550,
    // Entscheidung offen (siehe README): Angebotsgueltigkeit in Tagen.
    gueltigkeitTage: 30,
    titel: 'Angebot'
  },

  // Regel 3: Aktion "Verlegung inklusive ab 649 EUR".
  aktion649: {
    grenzeBrutto: 649,
    maxEntfernungKm: 15,
    kundentyp: 'privat',
    bodenarten: ['teppichboden', 'pvc']
  },

  // Regel 5: Bestellmass = gemessene Laenge + Zugabe, je Bahn.
  rollenware: { zugabeM: 0.10 },

  // Regel 5a: Daemmunterlagen. Entscheidung Inhaber 14.10.2026: kein extra
  // Verschnitt (die Daemmartikel enthalten ihn bereits), weiter auf halbe Rolle runden.
  daemmung: { verschnittProzent: 0, rundungRollen: 0.5 },

  // Regel 9a nennt "sinnvollen Verschnitt" ohne Zahl. Dieser Wert ist eine
  // ANNAHME und wird im Angebot als offener Punkt markiert, solange der
  // Vorgang keinen eigenen Wert nennt.
  sockelleiste: { verschnittProzentAnnahme: 10 },

  // Lexware-Pauschalen "Einzelraum bis 12 m2".
  pauschale: { maxFlaecheM2: 12 },

  // Regel 14: typische Reihenfolge.
  kategorien: {
    bodenbelag: 1,
    daemmung: 1.5,
    altbelag: 2,
    untergrund: 3,
    sockelleisten: 4,
    verlegung: 5,
    fixierung: 6,
    profile: 7,
    silikon: 8,
    zusatz: 9,
    material_reinigung: 10,
    anfahrt: 11
  },

  bodenarten: {
    teppichboden: { art: 'rolle', designbelag: false },
    pvc: { art: 'rolle', designbelag: false },
    klebevinyl: { art: 'paket', designbelag: true },
    klickvinyl: { art: 'paket', designbelag: true },
    laminat: { art: 'paket', designbelag: false },
    parkett: { art: 'paket', designbelag: false }
  },

  artikel: {
    materialReinigung: { nr: 'MG-010' },
    fahrtNah: { nr: 'FA-010' },
    // Ohne Artikelnummer in Lexware, daher per ID.
    fahrtBerlin: { id: '62f3ffa4-fa7c-4e3d-a2b4-af024f6253bb', titel: 'An- und Abfahrt Berlin' },
    aktionVerlegung: {
      id: 'a8cdfc6b-8542-49c3-b001-0560105d1742',
      titel: 'Angebot Rollenware verlegen – lose Verlegung + 1. Anfahrt inklusive',
      kostenlosBestaetigt: true
    },
    // Regel 4: bei Aktion NICHT TB-020, sondern diese Position.
    aktionFixierung: { id: '92798372-417c-4c52-ae98-77faa7e8ae89', titel: 'Zusätzlich Rollenware vollflächig fixieren' },
    aktionKlettband: { id: '9b9e4264-b688-423a-8168-c48bc724681f', titel: 'Zusätzlich Teppichboden mit Klettband einspannen' },
    silikonLfm: { nr: 'SL-102' },
    silikonTuerzarge: { nr: 'TZ-020' },
    profilStandard: { nr: 'PR-010' },
    einschubStreifenEntfernen: { nr: 'AB-012' },
    einschubStreifenNeu: { nr: 'SL-101' },
    einschubLeisteNeu: { nr: 'SL-100' }
  },

  // Verlegepositionen je Bodenart und Verlegeart (Artikelnummern).
  verlegung: {
    teppichboden: {
      m2: { lose: 'TB-080', band: 'TB-090', klett: 'TB-010', fixiert: 'TB-020', verklebt: 'TB-030', verklebt_wolle: 'TB-070' },
      pauschal: { klett: 'TB-050', fixiert: 'TB-060', verklebt: 'TB-060' }
    },
    pvc: {
      m2: { lose: 'PVC-010', band: 'PVC-010', fixiert: 'PVC-020', verklebt: 'PVC-030' },
      pauschal: {}
    },
    klebevinyl: {
      m2: { verklebt: 'KV-010', fischgraet: 'KV-020' },
      pauschal: { verklebt: 'KV-030' }
    },
    klickvinyl: {
      m2: { mit_daemmung: 'KVK-020', ohne_daemmung: 'KVK-010' },
      pauschal: { mit_daemmung: 'KVK-Kleinfläche' }
    },
    laminat: {
      m2: { mit_daemmung: 'LAM-010' },
      pauschal: { mit_daemmung: 'LAM-Kleinfläche' }
    },
    parkett: {
      m2: { schwimmend: 'PK-010', verklebt: 'PK-020', landhausdiele_verklebt: 'PK-025' },
      pauschal: { schwimmend: 'PK-Kleinfläche', verklebt: 'PK-040' }
    }
  },

  // Sockelleisten-Montage je Leistentyp (Regel 9a, Material separat).
  sockelleisteMontage: {
    cubu_bis60: 'SL-095',
    kso_bis60: 'SL-096',
    hamburger_bis60: 'SL-097',
    kunststoff_ab80: 'SL-091',
    holz_bis60: 'SL-092',
    holz_ab80: 'SL-093'
  },

  // Kategorie aus dem Praefix der Artikelnummer (fuer Zusatzpositionen).
  praefixKategorie: {
    AB: 'altbelag',
    UG: 'untergrund',
    SL: 'sockelleisten',
    KT: 'sockelleisten',
    PR: 'profile',
    SI: 'silikon',
    TZ: 'silikon',
    MG: 'material_reinigung',
    FA: 'anfahrt',
    DU: 'daemmung',
    TB: 'verlegung',
    PVC: 'verlegung',
    KV: 'verlegung',
    KVK: 'verlegung',
    LAM: 'verlegung',
    PK: 'verlegung',
    NV: 'verlegung',
    SG: 'verlegung',
    TR: 'verlegung',
    TL: 'verlegung'
  },

  // Artikel, die bei aktiver 649-EUR-Aktion nicht verwendet werden duerfen.
  aktionVerboten: ['TB-020'],
  // Titelmuster, die nie automatisch verwendet werden (Regel 4: keine Spruehkleber-Position).
  titelVerboten: [/spr(ü|ue)hkleber/i]
};
