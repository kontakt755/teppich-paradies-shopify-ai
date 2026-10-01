/**
 * Gemeinsamer Zustand der Oberflaeche: geladene Aufgaben, Sitzung, aktuelle Route.
 *
 * Was nur eine Ansicht braucht (Einkauf, Kunden, Lexikon ...), liegt als eigener
 * Zwischenspeicher im Modul dieser Ansicht - nicht hier.
 */

export const state = {
  raw: null,            // issues.json
  tasks: [],
  scores: new Map(),
  loadError: null,
  capabilities: { mode: 'static' },
  session: { required: false, authenticated: true },
  me: null,
  agentRuns: null,      // nur lokal
  route: { view: 'heute', params: new URLSearchParams() },
  selectedRow: -1,
  sheetOffenFuer: null,    // welche Aufgabe im Panel steht (Fokus nur beim Oeffnen setzen)
  detailCache: new Map(),
  bodenwissen: null,       // docs/ai-dashboard/bodenwissen.json, siehe ensureBodenwissen()
  bodenwissenError: null,
  bodenwissenLoaded: false,
};
