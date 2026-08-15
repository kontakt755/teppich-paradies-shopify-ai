const app = document.querySelector('#app');

const esc = value => String(value ?? 'UNKNOWN').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
const yesNo = value => value ? 'JA' : 'NEIN';
const short = value => value && value !== 'UNKNOWN' ? String(value).slice(0, 10) : 'UNKNOWN';
const when = value => value ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'UNKNOWN';
const statusClass = value => `s-${String(value ?? 'UNKNOWN').toLowerCase()}`;
const badge = (value, stale = false) => `<span class="badge ${statusClass(stale ? 'STALE' : value)}">${esc(stale ? `${value} · STALE` : value)}</span>`;
const fact = (label, value) => `<div class="fact"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;

function pipeline(items) {
  return items.map((item, index) => `<article class="step">
    <span class="step-index">0${index + 1}</span>
    <h3>${esc(item.label)}</h3>
    ${badge(item.status)}
    <p>${esc(item.description)}</p>
    <footer>${esc(item.role)}<br>${esc(when(item.timestamp))}<br>${esc(item.file ?? 'NO REPORT')}</footer>
  </article>`).join('');
}

function evidenceRows(evidence) {
  const labels = { localVerification: 'Local Verification', qaCompare: 'QA Compare', fullQa: 'Full QA', salesReadiness: 'Sales Readiness', secretScan: 'Secret Scan', securityReview: 'Security Review', secondModelReview: 'Second Model Review' };
  return Object.entries(evidence).map(([key, item]) => `<div class="evidence-row">
    <strong>${esc(labels[key] ?? key)}</strong>
    ${badge(item.status, item.stale)}
    <span class="evidence-meta">${esc(when(item.timestamp))}<br>${esc(short(item.commit))} · ${esc(item.file ?? 'NO REPORT')}</span>
  </div>`).join('');
}

function changesTable(changes) {
  if (!changes.length) return '<div class="empty">Keine belegbare Preview-/Write-Datei geladen.<br>Es werden keine Änderungen aus dem Auftragstext erfunden.</div>';
  return `<table><thead><tr><th>Objekt</th><th>SKU</th><th>Feld</th><th>Ist / Alt</th><th>Soll / Neu</th><th>Differenz</th><th>Risiko</th><th>Quelle</th><th>Status</th></tr></thead><tbody>${changes.map(item => `<tr>
    <td>${esc(item.object)}</td><td>${esc(item.sku)}</td><td>${esc(item.field)}</td><td>${esc(item.current)}</td><td>${esc(item.planned)}</td><td>${esc(item.difference)}</td><td>${esc(item.risk)}</td><td>${esc(item.source)}</td><td>${esc(item.status)}</td>
  </tr>`).join('')}</tbody></table>`;
}

function taskHistory(items) {
  if (!items.length) return '<div class="empty">Keine zuverlässig ableitbare Task-Historie.</div>';
  return `<table><thead><tr><th>Task ID</th><th>Beschreibung</th><th>Klasse</th><th>Branch</th><th>PR</th><th>Status</th><th>Human Gate</th><th>Result</th></tr></thead><tbody>${items.map(item => `<tr><td>${esc(item.taskId)}</td><td>${esc(item.description)}</td><td>${esc(item.class)}</td><td>${esc(item.branch)}</td><td>${esc(item.pr ?? 'UNKNOWN')}</td><td>${esc(item.status)}</td><td>${esc(item.humanGate)}</td><td>${esc(item.result)}</td></tr>`).join('')}</tbody></table>`;
}

function render(data) {
  const s = data.summary;
  const a = data.agentAudit;
  const c = data.credit;
  const g = data.humanGate;
  app.innerHTML = `
    <section class="overview">
      <article class="card">
        <p class="eyebrow">CURRENT TASK · ${esc(s.taskId)}</p>
        <h2 class="task-title">${esc(s.currentTask)}</h2>
        <div class="meta-line"><span>${esc(s.taskClass)}</span><span>${esc(s.executionMode)}</span><span>${esc(data.repository.branch)}</span><span>${esc(data.repository.shortCommit)}</span><span>PR ${esc(data.repository.pr ?? 'UNKNOWN')}</span></div>
      </article>
      <aside class="card action-card">
        <p class="action-label">Next allowed action</p>
        <p class="action">${esc(s.nextAllowedAction)}</p>
        <p class="caption">Nur Anzeige. Keine Aktion, Freigabe, Write-Operation oder Agenten-API ist verbunden.</p>
      </aside>
    </section>

    <section class="section">
      <div class="section-head"><h2>Workflow Pipeline</h2><p>Task → Router → Execution → Validation → Review → Audit → Gate → Write → Verification</p></div>
      <div class="pipeline">${pipeline(data.pipeline)}</div>
    </section>

    <section class="section grid">
      <article class="card span-8">
        <h2>Auftragsstatus</h2>
        <dl class="facts">
          ${fact('Task Class', s.taskClass)}${fact('Execution Mode', s.executionMode)}${fact('Primary Agent', s.primaryAgent)}${fact('Model Used', s.modelUsed)}
          ${fact('Second Review Required', yesNo(s.secondReviewRequired))}${fact('Second Reviewer', s.secondReviewer)}${fact('Local Runner Required', yesNo(s.localRunnerRequired))}${fact('Validation Status', s.validationStatus)}
          ${fact('Script Steps', s.scriptSteps)}${fact('AI Steps', s.aiSteps)}${fact('External Blocks', s.externalBlocks)}${fact('Live Status', s.liveStatus)}
          ${fact('P0 / P1 / P2', `${s.p0} / ${s.p1} / ${s.p2}`)}${fact('Shopify Write Required', yesNo(s.shopifyWriteRequired))}${fact('Shopify Write Approved', 'NEIN · NICHT GESPEICHERT')}${fact('Human Gate', s.humanGate)}
        </dl>
      </article>
      <article class="card span-4">
        <h2>Credit / Cost Profile</h2>
        <dl class="facts">
          ${fact('Credit Profile', c.profile)}${fact('AI Steps', c.aiSteps)}${fact('Script Steps', c.scriptSteps)}${fact('Second Review Used', c.secondReviewUsed)}${fact('Strong Model Used', c.strongModelUsed)}${fact('Tokens / Credits', `${c.tokens} / ${c.credits}`)}
        </dl>
        <div class="callout">Keine Kosten-API aktiv. Keine Token- oder Euro-Schätzungen.</div>
      </article>
    </section>

    <section class="section grid">
      <article class="card span-5">
        <h2>Agent Audit Trail</h2>
        <dl class="facts">
          ${fact('Vorgesehener Agent', a.intendedAgent)}${fact('Tatsächlicher Agent', a.actualAgent)}${fact('Sicher bekanntes Modell', a.knownModel)}${fact('Implementer', a.implementer)}${fact('Reviewer', a.reviewer)}${fact('Local Runner', a.localRunner)}${fact('AI / Script Steps', `${a.aiSteps} / ${a.scriptSteps}`)}${fact('Retries', a.retries)}
        </dl>
      </article>
      <article class="card span-7">
        <h2>Human Gate</h2>
        <div class="gate-status"><strong>${esc(g.readiness.replaceAll('_', ' '))}</strong>${badge(g.required ? 'HUMAN_GATE' : 'SKIPPED')}</div>
        <dl class="facts space-top">
          ${fact('Warum', g.reason)}${fact('Geplante Aktion', g.plannedAction)}${fact('Betroffene Objekte', g.affected.length ? g.affected.join(', ') : 'UNKNOWN')}${fact('Geplante Writes', g.plannedWrites)}${fact('P0 / P1 / P2', `${g.findings.p0} / ${g.findings.p1} / ${g.findings.p2}`)}${fact('Commit', short(g.commit))}${fact('Review Status', g.reviewStatus)}${fact('Evidence Status', g.evidenceStatus)}
        </dl>
        <div class="callout">Freigaben werden niemals aus alten Dateien übernommen. Stufe 1 führt keine Aktion aus.</div>
      </article>
    </section>

    <section class="section grid">
      <article class="card span-8">
        <div class="section-head"><h2>Planned Changes / Writes · Ist / Soll</h2><p>${data.plannedChanges.length} belegbare Änderung(en)</p></div>
        <div class="table-wrap">${changesTable(data.plannedChanges)}</div>
      </article>
      <article class="card span-4">
        <h2>Odense Dry Run</h2>
        <div class="gate-status"><strong>${esc(data.odense.status.replaceAll('_', ' '))}</strong>${badge(data.odense.loaded ? 'PASS' : 'WAITING')}</div>
        <p class="caption space-top-lg">${data.odense.loaded ? `${esc(data.odense.changes.length)} Änderungen aus ${esc(data.odense.sources.join(', '))}` : 'Keine echte Odense-Preview-Datei im Repository gefunden. Promptdaten werden nicht als State übernommen.'}</p>
      </article>
    </section>

    <section class="section grid">
      <article class="card span-8"><h2>Evidence View</h2><div class="evidence-list">${evidenceRows(data.evidence)}</div></article>
      <article class="card span-4">
        <h2>External Block</h2>
        ${data.externalBlock.type ? `<dl class="facts">${fact('Type', data.externalBlock.type)}${fact('Retries', data.externalBlock.retries)}${fact('Letzter Fehler', data.externalBlock.lastError ?? 'UNKNOWN')}${fact('Nächster Schritt', data.externalBlock.nextAllowedAction)}</dl>` : '<div class="blocker-box">Kein aktueller externer Blocker protokolliert.</div>'}
        <div class="callout">Keine automatischen Agenten-Retries in Stufe 1.</div>
      </article>
    </section>

    <section class="section"><article class="card"><h2>Task History</h2><div class="table-wrap">${taskHistory(data.taskHistory)}</div></article></section>
    <p class="footer-note">Generiert ${esc(when(data.generatedAt))} · ausschließlich lokale, erlaubte Repo-Quellen · Approval Stored: NEIN · READ-ONLY</p>
  `;
}

fetch('/api/state', { cache: 'no-store' })
  .then(response => { if (!response.ok) throw new Error('State unavailable'); return response.json(); })
  .then(render)
  .catch(() => { app.innerHTML = '<section class="error">Der lokale Repo-State konnte nicht gelesen werden. Es wurde keine Aktion ausgeführt.</section>'; });
