const taskIndex = process.argv.indexOf('--task');
const taskIdIndex = process.argv.indexOf('--task-id');
const task = taskIndex >= 0 ? process.argv[taskIndex + 1] : '';
const taskId = taskIdIndex >= 0 ? process.argv[taskIdIndex + 1] : 'FIXTURE';

process.stderr.write('@@TP_EVENT@@{"status":"ROUTED","risk":"LOW","taskType":"IMPLEMENTATION"}\n');
process.stderr.write('@@TP_EVENT@@{"status":"PROVIDER","provider":"Claude Code Pro"}\n');
process.stderr.write('@@TP_EVENT@@{"status":"ACTIVITY","kind":"Read","message":"Liest Datei: snippets/test.liquid"}\n');
process.stderr.write('@@TP_EVENT@@{"status":"REVIEW","reviewRound":1,"maxReviewRounds":3}\n');
process.stdout.write(JSON.stringify({ status: 'PASS', taskId, authMode: 'SUBSCRIPTION', reviewRound: 1, findings: [], result: `Testauftrag abgeschlossen: ${task.slice(0, 80)}` }));
