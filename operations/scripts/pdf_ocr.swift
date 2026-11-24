// Texterkennung fuer PDF-Seiten mit macOS Vision (lokal, ohne Netz, ohne KI-Dienst).
// Fuer Rechnungen, deren Bankverbindung nur als Bild im PDF steht (Benutzer 24.11.2026).
//   swift operations/scripts/pdf_ocr.swift <datei.pdf>   -> erkannter Text auf stdout
import Foundation
import PDFKit
import Vision

guard CommandLine.arguments.count == 2, let doc = PDFDocument(url: URL(fileURLWithPath: CommandLine.arguments[1])) else {
  FileHandle.standardError.write("PDF nicht lesbar\n".data(using: .utf8)!); exit(2)
}
for i in 0..<min(doc.pageCount, 5) {
  guard let seite = doc.page(at: i) else { continue }
  let box = seite.bounds(for: .mediaBox)
  let massstab: CGFloat = 3 // etwa 216 dpi: kleine Fusszeilen bleiben lesbar
  let bild = seite.thumbnail(of: CGSize(width: box.width * massstab, height: box.height * massstab), for: .mediaBox)
  guard let cg = bild.cgImage(forProposedRect: nil, context: nil, hints: nil) else { continue }
  let anfrage = VNRecognizeTextRequest()
  anfrage.recognitionLevel = .accurate
  anfrage.recognitionLanguages = ["de-DE", "en-US"]
  anfrage.usesLanguageCorrection = false // IBANs und Nummern nicht "korrigieren"
  try? VNImageRequestHandler(cgImage: cg, options: [:]).perform([anfrage])
  for z in anfrage.results ?? [] { if let t = z.topCandidates(1).first?.string { print(t) } }
}
