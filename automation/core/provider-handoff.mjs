const PROVIDERS = new Set(['CODEX', 'CLAUDE_CODE']);

export class ProviderHandoffError extends Error {
  constructor(message) { super(message); this.name = 'ProviderHandoffError'; }
}

export async function prepareProviderHandoff({ taskId, fromProvider, toProvider, contextPack, failureSummary, diffSummary, saveArtifact, restoreCleanBaseline, verifyClean, createSession, now = () => new Date() }) {
  if (!PROVIDERS.has(fromProvider) || !PROVIDERS.has(toProvider) || fromProvider === toProvider) throw new ProviderHandoffError('Provider switch requires two different known providers');
  if (!taskId || !contextPack || typeof saveArtifact !== 'function' || typeof restoreCleanBaseline !== 'function' || typeof verifyClean !== 'function' || typeof createSession !== 'function') throw new ProviderHandoffError('Incomplete provider handoff contract');
  const handoffId = `${taskId}-${now().toISOString().replace(/[:.]/g, '-')}`;
  await saveArtifact({ handoffId, type: 'TASK_STATE', data: { taskId, provider: fromProvider, status: 'HANDOFF_PENDING' } });
  await saveArtifact({ handoffId, type: 'FAILURE_SUMMARY', data: failureSummary });
  await saveArtifact({ handoffId, type: 'DIFF_SUMMARY', data: diffSummary });
  await restoreCleanBaseline({ taskId, handoffId });
  if (!await verifyClean({ taskId, handoffId })) throw new ProviderHandoffError('Clean task baseline could not be verified');
  const recipientPack = { taskId, contextPack, failureSummary, evidence: diffSummary };
  const session = await createSession({ provider: toProvider, newSession: true, input: recipientPack });
  return { status: 'READY', handoffId, fromProvider, toProvider, session };
}
