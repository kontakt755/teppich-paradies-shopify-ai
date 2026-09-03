// Mock-Daten für lokales Dashboard-Testing
// Diese Daten simulieren GitHub Issues

const MOCK_ISSUES = [
    // Roadmap Tasks
    {
        id: 1,
        number: 35,
        title: "[SHP-001] Repository-Portabilität",
        body: "Git-Foundation für Windows/Mac stabilisieren",
        state: "open",
        html_url: "https://github.com/kontakt755/teppich-paradies-shopify-ai/issues/35",
        labels: [
            { name: "type:technik" },
            { name: "status:geplant" },
            { name: "priority:p1" },
            { name: "area:backend" }
        ],
        assignee: { login: "claude-code" },
        created_at: "2026-09-03T09:00:00Z",
        updated_at: "2026-09-03T11:00:00Z"
    },
    {
        id: 2,
        number: 36,
        title: "[SHP-003] QA-Logfilter",
        body: "QA-Ausgaben auf relevante Assertions reduzieren",
        state: "open",
        html_url: "https://github.com/kontakt755/teppich-paradies-shopify-ai/issues/36",
        labels: [
            { name: "type:technik" },
            { name: "status:eingang" },
            { name: "priority:p2" },
            { name: "area:backend" }
        ],
        assignee: { login: "codex" },
        created_at: "2026-09-03T09:10:00Z",
        updated_at: "2026-09-03T11:00:00Z"
    },
    {
        id: 3,
        number: 37,
        title: "[SHP-010] Windows-SEO-Tooling angleichen",
        body: "Mac-SEO-Checker auf Windows wiederherstellen",
        state: "open",
        html_url: "https://github.com/kontakt755/teppich-paradies-shopify-ai/issues/37",
        labels: [
            { name: "type:technik" },
            { name: "status:eingang" },
            { name: "priority:p2" },
            { name: "area:backend" }
        ],
        assignee: { login: "codex" },
        created_at: "2026-09-03T09:20:00Z",
        updated_at: "2026-09-03T11:00:00Z"
    },
    {
        id: 4,
        number: 38,
        title: "[SHP-012] Teppichboden-Menü-Audit",
        body: "Menü-Struktur gegen Ziel-Navigation prüfen",
        state: "open",
        html_url: "https://github.com/kontakt755/teppich-paradies-shopify-ai/issues/38",
        labels: [
            { name: "type:ux" },
            { name: "status:geplant" },
            { name: "priority:p2" },
            { name: "area:navigation" }
        ],
        assignee: { login: "chatgpt" },
        created_at: "2026-09-03T09:30:00Z",
        updated_at: "2026-09-03T11:00:00Z"
    },
    {
        id: 5,
        number: 39,
        title: "[SHP-013] Teppichboden-Menü korrigieren",
        body: "Hauptlink und Alle-Teppichböden umsetzen - WARTET AUF AHMET",
        state: "open",
        html_url: "https://github.com/kontakt755/teppich-paradies-shopify-ai/issues/39",
        labels: [
            { name: "type:verbesserung" },
            { name: "status:blockiert" },
            { name: "priority:p1" },
            { name: "area:navigation" },
            { name: "reviewer:mensch" }
        ],
        assignee: { login: "codex" },
        created_at: "2026-09-03T09:40:00Z",
        updated_at: "2026-09-03T11:00:00Z"
    },
    {
        id: 6,
        number: 40,
        title: "[SHP-014] Florhöhen-/ecoVella-Evidenzaudit",
        body: "Sortiment klassifizieren",
        state: "open",
        html_url: "https://github.com/kontakt755/teppich-paradies-shopify-ai/issues/40",
        labels: [
            { name: "type:content" },
            { name: "status:geplant" },
            { name: "priority:p2" },
            { name: "area:produktseite" }
        ],
        assignee: { login: "chatgpt" },
        created_at: "2026-09-03T09:50:00Z",
        updated_at: "2026-09-03T11:00:00Z"
    },
    {
        id: 7,
        number: 41,
        title: "[SHP-015] Live-Collection-Zuordnungen",
        body: "Hoch-/Mittelflor Korrektionen anwenden - WARTET AUF AHMET",
        state: "open",
        html_url: "https://github.com/kontakt755/teppich-paradies-shopify-ai/issues/41",
        labels: [
            { name: "type:verbesserung" },
            { name: "status:blockiert" },
            { name: "priority:p1" },
            { name: "area:produktseite" },
            { name: "reviewer:mensch" }
        ],
        assignee: { login: "codex" },
        created_at: "2026-09-03T10:00:00Z",
        updated_at: "2026-09-03T11:00:00Z"
    },
    {
        id: 8,
        number: 42,
        title: "[SHP-023] Google-Kanalausschluss Rollenware",
        body: "118 Produkte aus Google & YouTube entfernen - P0 KRITISCH - WARTET AUF AHMET",
        state: "open",
        html_url: "https://github.com/kontakt755/teppich-paradies-shopify-ai/issues/42",
        labels: [
            { name: "type:verbesserung" },
            { name: "status:blockiert" },
            { name: "priority:p0" },
            { name: "area:google" },
            { name: "reviewer:mensch" }
        ],
        assignee: { login: "ahmet" },
        created_at: "2026-09-03T10:10:00Z",
        updated_at: "2026-09-03T11:00:00Z"
    },
    // Original Test-Issues
    {
        id: 9,
        number: 30,
        title: "🐛 Produktgalerie responsive machen",
        body: "Mobilgeräte-Support",
        state: "open",
        html_url: "https://github.com/kontakt755/teppich-paradies-shopify-ai/issues/30",
        labels: [
            { name: "type:bug" },
            { name: "status:eingang" },
            { name: "priority:p1" },
            { name: "area:produktseite" }
        ],
        created_at: "2026-09-03T09:16:48Z",
        updated_at: "2026-09-03T09:16:48Z"
    },
    {
        id: 10,
        number: 31,
        title: "✨ Live-Chat Feature implementieren",
        body: "Chat-Widget für Kundensupport",
        state: "open",
        html_url: "https://github.com/kontakt755/teppich-paradies-shopify-ai/issues/31",
        labels: [
            { name: "type:verbesserung" },
            { name: "status:geplant" },
            { name: "priority:p2" },
            { name: "area:sonstiges" }
        ],
        created_at: "2026-09-03T09:16:49Z",
        updated_at: "2026-09-03T09:16:49Z"
    },
    {
        id: 11,
        number: 32,
        title: "💡 KI-basierte Produktempfehlungen",
        body: "ML-Modell für bessere Empfehlungen",
        state: "open",
        html_url: "https://github.com/kontakt755/teppich-paradies-shopify-ai/issues/32",
        labels: [
            { name: "type:idee" },
            { name: "status:eingang" },
            { name: "priority:p3" },
            { name: "area:sonstiges" }
        ],
        created_at: "2026-09-03T09:16:51Z",
        updated_at: "2026-09-03T09:16:51Z"
    },
    {
        id: 12,
        number: 33,
        title: "📈 SEO: Meta-Titles optimieren",
        body: "Im Code Review",
        state: "open",
        html_url: "https://github.com/kontakt755/teppich-paradies-shopify-ai/issues/33",
        labels: [
            { name: "type:seo" },
            { name: "status:review" },
            { name: "priority:p2" },
            { name: "area:seo" },
            { name: "reviewer:codex" }
        ],
        assignee: { login: "claude-code" },
        created_at: "2026-09-03T09:16:52Z",
        updated_at: "2026-09-03T09:16:52Z"
    },
    {
        id: 13,
        number: 34,
        title: "🚧 Shopify Admin API Integration",
        body: "BLOCKIERT - warte auf Credentials",
        state: "open",
        html_url: "https://github.com/kontakt755/teppich-paradies-shopify-ai/issues/34",
        labels: [
            { name: "type:technik" },
            { name: "status:blockiert" },
            { name: "priority:p0" },
            { name: "area:backend" }
        ],
        created_at: "2026-09-03T09:16:54Z",
        updated_at: "2026-09-03T09:16:54Z"
    }
];

// Nutze Mock-Daten wenn GitHub API nicht erreichbar ist
function useMockData() {
    console.log("⚠️ Nutze Mock-Daten (GitHub privat)");
    return MOCK_ISSUES;
}
