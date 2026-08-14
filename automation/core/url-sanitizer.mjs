const DEFAULT_BASE_URL = 'https://sanitizer.invalid';

export const SENSITIVE_QUERY_PARAMETERS = Object.freeze([
  'token',
  'access_token',
  'auth',
  'authorization',
  'session',
  'session_id',
  'signature',
  'signed',
  'code',
  'secret',
  'key',
]);

const normalizeParameterName = value => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
const SENSITIVE_NAMES = new Set(SENSITIVE_QUERY_PARAMETERS.map(normalizeParameterName));
const AUTH_CALLBACK_PATHS = new Set(['/services/login_with_shop/buyer/callback']);
const ABSOLUTE_URL = /\bhttps?:\/\/[^\s<>"'`()\[\]{}]+/gi;
const RELATIVE_URL = /\/[a-z0-9._~!$&'()*+,;=:@%/-]*\?[^\s<>"'`()\[\]{}]+/gi;
const SENSITIVE_ASSIGNMENT = new RegExp(
  `([?&]|\\b)(${SENSITIVE_QUERY_PARAMETERS.join('|')})=([^&#\\s]+)`,
  'gi',
);

function isSensitiveName(value) {
  const normalized = normalizeParameterName(value);
  return SENSITIVE_NAMES.has(normalized) || normalized.endsWith('sessionid');
}

function sanitizeQueryFallback(value) {
  const queryIndex = value.indexOf('?');
  if (queryIndex < 0) return value;
  const pathPart = value.slice(0, queryIndex);
  if (AUTH_CALLBACK_PATHS.has(pathPart)) return pathPart;
  const hashIndex = value.indexOf('#', queryIndex);
  const queryPart = value.slice(queryIndex + 1, hashIndex < 0 ? undefined : hashIndex);
  const hashPart = hashIndex < 0 ? '' : value.slice(hashIndex);
  const safeParts = queryPart.split('&').filter(part => {
    const rawName = part.split('=', 1)[0];
    let name = rawName;
    try { name = decodeURIComponent(rawName.replace(/\+/g, ' ')); } catch {}
    return !isSensitiveName(name);
  });
  return `${pathPart}${safeParts.length ? `?${safeParts.join('&')}` : ''}${hashPart}`;
}

export function sanitizeUrl(value) {
  const input = String(value ?? '');
  if (!input.includes('?')) return input;
  const absolute = /^[a-z][a-z\d+.-]*:\/\//i.test(input);
  const supportedRelative = /^(?:\/|\.\/|\.\.\/|\?)/.test(input);
  if (!absolute && !supportedRelative) return sanitizeQueryFallback(input);

  try {
    const parsed = new URL(input, DEFAULT_BASE_URL);
    if (AUTH_CALLBACK_PATHS.has(parsed.pathname)) parsed.search = '';
    else for (const name of [...parsed.searchParams.keys()]) if (isSensitiveName(name)) parsed.searchParams.delete(name);

    if (absolute) return parsed.href;
    const prefix = input.startsWith('//') ? '//' : input.startsWith('./') ? './' : input.startsWith('../') ? '../' : '';
    if (prefix === '//') return `//${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
    if (prefix === './' || prefix === '../') return `${prefix}${parsed.pathname.replace(/^\//, '')}${parsed.search}${parsed.hash}`;
    if (input.startsWith('?')) return `${parsed.search}${parsed.hash}`;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return sanitizeQueryFallback(input);
  }
}

export function sanitizeText(value) {
  return String(value ?? '')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(ABSOLUTE_URL, match => sanitizeUrl(match))
    .replace(RELATIVE_URL, match => sanitizeUrl(match))
    .replace(SENSITIVE_ASSIGNMENT, (_match, prefix, name) => `${prefix}${name}=[redacted]`);
}

export function sanitizeDeep(value) {
  if (typeof value === 'string') return sanitizeText(value);
  if (Array.isArray(value)) return value.map(sanitizeDeep);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [sanitizeText(key), sanitizeDeep(entry)]));
}

function sensitiveNamesInUrl(candidate) {
  try {
    const parsed = new URL(candidate, DEFAULT_BASE_URL);
    return [...new Set([...parsed.searchParams.keys()].filter(isSensitiveName).map(name => name.toLowerCase()))];
  } catch {
    const query = candidate.split('?', 2)[1] || '';
    return [...new Set(query.split('&').map(part => part.split('=', 1)[0]).filter(isSensitiveName).map(name => name.toLowerCase()))];
  }
}

export function findSensitiveUrlQueryNames(value) {
  const text = String(value ?? '');
  const candidates = [
    ...(text.match(ABSOLUTE_URL) || []),
    ...(text.match(RELATIVE_URL) || []),
  ];
  return [...new Set(candidates.flatMap(sensitiveNamesInUrl))];
}
