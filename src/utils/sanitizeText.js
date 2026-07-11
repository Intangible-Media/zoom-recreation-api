/** Coerces untrusted request input to a bounded string; non-string/number input becomes ''. */
export function sanitizeText(value, maxLen = 500) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).slice(0, maxLen);
}

/** JSON.stringify with a hard length cap, so an oversized payload can't blow past a field's limit. */
export function safeStringify(value, maxLen) {
  const json = JSON.stringify(value);
  return json.length <= maxLen ? json : `${json.slice(0, maxLen)}...(truncated)`;
}
