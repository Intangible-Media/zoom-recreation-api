const MAX_FIELD_LEN = 300;

function sanitizeField(value) {
  return typeof value === 'string' ? value.slice(0, MAX_FIELD_LEN) : '';
}

/**
 * device arrives as a plain object built inline by the frontend from navigator/screen
 * APIs (not JSON-encoded like quoteItems). Returns null if the payload isn't an object.
 */
export function parseDevice(deviceRaw) {
  if (!deviceRaw || typeof deviceRaw !== 'object') return null;

  return {
    userAgent: sanitizeField(deviceRaw.userAgent),
    platform: sanitizeField(deviceRaw.platform),
    language: sanitizeField(deviceRaw.language),
    timezone: sanitizeField(deviceRaw.timezone),
    screen: sanitizeField(deviceRaw.screen),
    viewport: sanitizeField(deviceRaw.viewport),
  };
}
