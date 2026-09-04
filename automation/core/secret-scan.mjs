import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { findSensitiveUrlQueryNames } from './url-sanitizer.mjs';

const SECRET_PATH = /(^|\/)(\.env(?:\..+)?|\.auth(?:\/|$)|\.sessions?(?:\/|$)|tokens?(?:\/|$)|secrets?(?:\/|$)|cookies?[^/]*\.json$|credentials?[^/]*\.json$)|\.(?:pem|key|p12|pfx)$/i;
// Regeln mit eindeutigem Anbieter-Praefix sind treffsicher und bleiben immer
// scharf - auch in Testdateien und Vorlagen.
const RULES = Object.freeze([
  ['PRIVATE_KEY', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['ANTHROPIC_KEY', /\bsk-ant-[A-Za-z0-9_-]{20,}\b/],
  ['GITHUB_TOKEN', /\bgh[opurs]_[A-Za-z0-9]{20,}\b/],
  ['SHOPIFY_TOKEN', /\bshp(?:at|ca|cs|pa|ss)_[A-Za-z0-9]{20,}\b/i],
  // JWTs enthalten Punkte und wuerden sonst faelschlich als Code durchgehen.
  ['JWT', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/],
]);

// Diese Regeln erkennen nur das Muster "Schluesselwort = Wert" und wissen nichts
// ueber den Wert selbst. Ungeprueft schlagen sie auf jeder Codezeile an, die
// einen Wert bloss weiterreicht - `const cookie = request.headers.cookie` etwa.
// Ein Gate, das dauerhaft rot leuchtet, wird ignoriert und schuetzt dann gar
// nichts mehr; deshalb wird hier zusaetzlich der zugewiesene Wert beurteilt.
const HEURISTIC_RULES = Object.freeze([
  ['GENERIC_API_KEY', /\b(?:api[_-]?key|access[_-]?token|secret[_-]?key)\s*[:=]\s*(.+)$/i, 16],
  ['PASSWORD_ASSIGNMENT', /\b(?:password|passwd|pwd)\s*[:=]\s*(.+)$/i, 8],
  ['SESSION_COOKIE', /\b(?:cookie|session[_-]?(?:id|token))\s*[:=]\s*(.+)$/i, 12],
]);

// Ein unquotierter Wert, der wie Code aussieht, ist eine Weitergabe und kein
// Geheimnis. Diese Pruefung gilt AUSDRUECKLICH NUR fuer unquotierte Werte: in
// Anfuehrungszeichen steht immer ein Wert, nie Code. Sonst wuerde ein JWT oder
// jedes punktgetrennte Token als "Code" durchgewunken.
const CODE_VALUE = /[.()[\]{}]|\|\||&&|=>|^new\s|^await\s|^typeof\s/;
// Ein interpolierter Wert (`${token}`, `{{ secret }}`, `%s`) wird erst zur
// Laufzeit gebildet - im Repository steht dann kein Geheimnis, sondern eine
// Vorlage. Das gilt auch in Anfuehrungszeichen und darum unabhaengig davon.
// Zwei Varianten mit Absicht: ein `g`-Regex merkt sich `lastIndex` zwischen
// `.test()`-Aufrufen und liefert dann abwechselnd falsche Ergebnisse.
const INTERPOLATION_SOURCE = /\$\{[^}]*\}|\{\{[^}]*\}\}|<%[^%]*%>|%\([^)]*\)|%[sd]\b/;
const INTERPOLATION_ALL = new RegExp(INTERPOLATION_SOURCE.source, 'g');
// Sprechende Platzhalter in Beispielen und Testfixtures sind keine Geheimnisse.
const PLACEHOLDER_WORD = /^(?:private|public|session|id|key|token|secret|value|pass|passwort|password|passwd|pwd|user|username|admin|name|url|host|cookie|auth|example|sample|test|fixture|dummy|placeholder|default|your|my|change|changeme|me|here|redacted|gesch(?:ü|ue)tzt|foo|bar|baz|todo|none|null|true|false|x{3,})$/i;

// Liefert den zugewiesenen Wert samt der Information, ob er in
// Anfuehrungszeichen stand. Ohne Quotes endet der Wert am ersten Trenner, damit
// aus `input.session_id, projectDir });` nicht die halbe Zeile zum Wert wird.
export function assignedValue(rest) {
  const trimmed = String(rest).trim();
  // `(?:\\.|[^\\])*?` laeuft ueber maskierte Zeichen hinweg. Ohne das endete
  // "abc\"defghijk" schon am maskierten Anfuehrungszeichen - der Rest fiel weg
  // und ein echtes Geheimnis rutschte unter die Mindestlaenge.
  const quoted = trimmed.match(/^(["'`])((?:\\.|[^\\])*?)\1/);
  if (quoted) return { value: quoted[2], quoted: true };
  const bare = trimmed.match(/^[^\s"'`,;)}\]]+/);
  return bare ? { value: bare[0], quoted: false } : null;
}

// Ein Platzhalter besteht VOLLSTAENDIG aus sprechenden Woertern
// ("your-password-here"). Es genuegt nicht, dass irgendwo "test" vorkommt -
// sonst waere "my-test-key-9f8e7d6c5b4a3210" kein Fund mehr.
export function isPlaceholderValue(value) {
  const segments = value.split(/[-_.\s]+/).filter(Boolean);
  if (!segments.length) return false;
  return segments.every(segment => PLACEHOLDER_WORD.test(segment));
}

export function looksLikeSecretValue(assigned, minimumLength) {
  if (!assigned || typeof assigned.value !== 'string') return false;
  const candidate = assigned.value.trim();
  if (candidate.length < minimumLength) return false;
  if (!assigned.quoted && CODE_VALUE.test(candidate)) return false;
  if (isPlaceholderValue(candidate)) return false;
  if (INTERPOLATION_SOURCE.test(candidate)) {
    // Nicht den ganzen Wert verwerfen: bei "echtesGeheimnis${suffix}" steht der
    // literale Teil sehr wohl im Repository. Geprueft wird deshalb der Rest ohne
    // die Platzhalter - und der muss fuer sich genommen wie ein Geheimnis
    // aussehen, damit ein blosses Praefix wie "tp_dashboard=" nicht anschlaegt.
    const literal = candidate.replace(INTERPOLATION_ALL, '');
    return literal.length >= minimumLength && /[A-Za-z]/.test(literal) && /[0-9]/.test(literal);
  }
  return true;
}
// Vorlagendateien wie .env.local.example gehoeren bewusst ins Repo. Nur die
// Pfadregel wird fuer sie ausgesetzt; der Inhalt laeuft weiter durch alle
// Muster, damit ein echter Key in einer .example-Datei trotzdem blockt.
const TEMPLATE_PATH = /\.(?:example|sample|template|dist)$/i;
const normalize = value => String(value).replaceAll('\\', '/').replace(/^\.\//, '');

export function scanText({ file, text }) {
  const normalized = normalize(file);
  const findings = [];
  if (SECRET_PATH.test(normalized) && !TEMPLATE_PATH.test(normalized)) findings.push({ file: normalized, line: 1, rule: 'SECRET_FILE' });
  String(text).split(/\r?\n/).forEach((line, index) => {
    for (const [rule, pattern] of RULES) if (pattern.test(line)) findings.push({ file: normalized, line: index + 1, rule });
    for (const [rule, pattern, minimumLength] of HEURISTIC_RULES) {
      const match = line.match(pattern);
      if (match && looksLikeSecretValue(assignedValue(match[1]), minimumLength)) findings.push({ file: normalized, line: index + 1, rule });
    }
    if (findSensitiveUrlQueryNames(line).length) findings.push({ file: normalized, line: index + 1, rule: 'URL_AUTH_QUERY' });
  });
  return findings;
}

export function discoverGitFiles({ root, git = 'git' }) {
  const output = execFileSync(git, ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' });
  return output.split('\0').filter(Boolean);
}

export function scanFiles({ root, files, io = fs }) {
  const findings = [];
  for (const relative of files) {
    const normalized = normalize(relative);
    const absolute = path.resolve(root, normalized);
    if (!absolute.startsWith(`${path.resolve(root)}${path.sep}`) || !io.existsSync(absolute) || !io.statSync(absolute).isFile()) continue;
    const buffer = io.readFileSync(absolute);
    if (buffer.includes(0)) continue;
    findings.push(...scanText({ file: normalized, text: buffer.toString('utf8') }));
  }
  return { status: findings.length ? 'BLOCK' : 'PASS', findings };
}

export function formatScanResult(result) {
  return JSON.stringify({ status: result.status, findings: result.findings.map(({ file, line, rule }) => ({ file, line, rule })) });
}
