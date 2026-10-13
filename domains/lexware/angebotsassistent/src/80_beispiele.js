/**
 * Testvorgaenge (frei erfunden, keine Kundendaten). Sie decken die drei
 * Angebotsgroessen der Uebergabe ab – einfach, mit Verlegung, umfangreich –
 * und bauen bewusst KEINE historischen Fehler der Beispielangebote nach.
 * Belagsartikel werden ueber Lexware-ID/Artikelnummer referenziert.
 */
var TP_BEISPIELE = {
  einfach: {
    vorgangId: 'TEST-EINFACH',
    datum: '2026-10-13',
    kunde: { kundentyp: 'privat', name: 'Testkunde Einfach', strasse: 'Teststraße 1', plz: '16515', ort: 'Oranienburg' },
    baustelle: { ort: 'Oranienburg', entfernungKm: 4, fahrzone: 'nah' },
    fahrten: { anzahl: 1 },
    raeume: [
      { name: 'Kinderzimmer', laengeM: 3.5, breiteM: 3.4, bodenart: 'teppichboden', belag: { ref: { nr: 'TB-LUMINA-85' } }, rollenbreiteM: 4, verlegeart: 'fixiert' }
    ],
    untergrundOhneArbeiten: true,
    keineSockelleisten: true
  },

  verlegung: {
    vorgangId: 'TEST-VERLEGUNG',
    datum: '2026-10-13',
    kunde: { kundentyp: 'privat', name: 'Testkunde Verlegung', strasse: 'Teststraße 2', plz: '16515', ort: 'Oranienburg' },
    baustelle: { ort: 'Oranienburg', entfernungKm: 9, fahrzone: 'nah' },
    fahrten: { anzahl: 2 },
    raeume: [
      { name: 'Wohnzimmer', laengeM: 5.1, breiteM: 3.9, bodenart: 'teppichboden', belag: { ref: { nr: 'TB-LUMINA-85' } }, rollenbreiteM: 4, verlegeart: 'lose', fixierung: 'optional' },
      { name: 'Schlafzimmer', laengeM: 4.06, breiteM: 3.8, bodenart: 'teppichboden', belag: { ref: { nr: 'TB-LUMINA-85' } }, rollenbreiteM: 4, verlegeart: 'fixiert',
        einschub: { art: 'bestehend', lfm: 14.5 } }
    ],
    zusatzpositionen: [
      { ref: { nr: 'AB-001' }, menge: 34.32 }
    ],
    keineSockelleisten: true
  },

  umfangreich: {
    vorgangId: 'TEST-UMFANGREICH',
    datum: '2026-10-13',
    erstkalkulation: true,
    maler: true,
    kunde: { kundentyp: 'privat', name: 'Testkunde Umfang', strasse: 'Teststraße 3', plz: '10115', ort: 'Berlin' },
    baustelle: { ort: 'Berlin', entfernungKm: 32, fahrzone: 'berlin' },
    fahrten: { anzahl: 3 },
    raeume: [
      { name: 'Wohnzimmer', laengeM: 6.2, breiteM: 4.1, bodenart: 'klebevinyl',
        belag: { ref: { id: '5ce6248b-f867-4e72-b88c-254bd53b698f' }, verschnittProzent: 8 },
        verlegeart: 'verklebt',
        daemmung: { ref: { id: '77794d96-76a3-4415-b1ba-b66f00511cd6' }, rolleninhaltM2: 6.5 },
        silikon: { umlaufend: true, tuerbreitenM: [0.9] },
        sockelleiste: { lfm: 19.5, vorlaeufig: true, material: { ref: { nr: 'SL-010' } }, montage: 'cubu_bis60' },
        profile: [{ laengeM: 0.9, vorlaeufig: true }] },
      { name: 'Flur', laengeM: 4.2, breiteM: 1.3, bodenart: 'klebevinyl',
        belag: { ref: { id: '5ce6248b-f867-4e72-b88c-254bd53b698f' }, verschnittProzent: 8 },
        verlegeart: 'verklebt',
        daemmung: { ref: { id: '77794d96-76a3-4415-b1ba-b66f00511cd6' }, rolleninhaltM2: 6.5 },
        silikon: { umlaufend: true, tuerbreitenM: [0.9, 0.8, 0.8], tuerzargen: 3 },
        sockelleiste: { lfm: 8, vorlaeufig: true, material: { ref: { nr: 'SL-010' } }, montage: 'cubu_bis60' },
        keineProfile: true }
    ],
    zusatzpositionen: [
      { ref: { nr: 'AB-015' }, menge: 30.88 },
      { ref: { nr: 'UG-030' }, menge: 30.88 },
      { ref: { nr: 'SL-094' }, menge: 27.5, optional: true, text: 'Optional: Oberkante der Sockelleisten mit Acryl abdichten' }
    ]
  }
};
