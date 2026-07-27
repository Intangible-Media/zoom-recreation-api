import crypto from 'node:crypto';

/**
 * Small in-process, best-effort dedup cache — doesn't survive a restart or a
 * multi-instance deployment. Used to collapse retries/redeliveries of the same
 * logical event within a short window (double-click on a form, Stripe's
 * at-least-once webhook redelivery) so a side effect (HubSpot deal, email
 * send) doesn't happen twice for one real-world event.
 */
export function createIdempotencyCache(windowMs) {
  const entries = new Map();

  function get(key) {
    const entry = entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      entries.delete(key);
      return null;
    }
    return entry.result;
  }

  function set(key, result) {
    for (const [cachedKey, entry] of entries) {
      if (entry.expiresAt < Date.now()) entries.delete(cachedKey);
    }
    entries.set(key, { result, expiresAt: Date.now() + windowMs });
  }

  return { get, set };
}

/** Groups repeat submits (double-clicks, network retries) of the same quote within windowMs. */
export function computeQuoteIdempotencyKey({ email, total, itemCount, windowMs }) {
  const bucket = Math.floor(Date.now() / windowMs);
  return crypto.createHash('sha256').update(`${email}|${total}|${itemCount}|${bucket}`).digest('hex');
}
