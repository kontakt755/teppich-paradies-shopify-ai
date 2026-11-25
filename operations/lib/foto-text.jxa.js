// Texterkennung mit Apples Vision-Framework (JXA, laeuft mit osascript ohne Zusatzprogramm).
// Aufruf: osascript -l JavaScript foto-text.jxa.js <bilddatei> - gibt die erkannten Zeilen aus.
ObjC.import('Foundation'); ObjC.import('Vision');
function run(argv) {
  const req = $.VNRecognizeTextRequest.alloc.init;
  req.recognitionLevel = 0; // genau statt schnell
  req.usesLanguageCorrection = false; // Farbnummern wie "3N55" nicht "verbessern"
  req.recognitionLanguages = $(['de-DE', 'en-US']);
  const h = $.VNImageRequestHandler.alloc.initWithURLOptions($.NSURL.fileURLWithPath(argv[0]), $({}));
  if (!h.performRequestsError($([req]), Ref())) throw new Error('Texterkennung fehlgeschlagen');
  const r = req.results, zeilen = [];
  for (let i = 0; i < r.count; i++) zeilen.push(r.objectAtIndex(i).topCandidates(1).objectAtIndex(0).string.js);
  return zeilen.join('\n');
}
