import { upsertContact } from './contacts.js';
import { createDeal, setDealStripeSession } from './deals.js';
import { CONTACT_PROPERTIES, DEPOSIT_STATUS } from './properties.js';
import { parseDevice } from '../utils/parseDevice.js';
import { sanitizeText, safeStringify } from '../utils/sanitizeText.js';

const MAX_PAGE_URL_LEN = 2000;
const MAX_QUOTE_ITEMS_JSON_LEN = 65000;

function splitName(fullName) {
  const [firstname, ...rest] = fullName.trim().split(/\s+/);
  return { firstname: firstname || '', lastname: rest.join(' ') };
}

function formatDeviceInfo(device, serverUserAgent, ip) {
  const lines = [
    `User Agent (browser-reported): ${device?.userAgent || 'unknown'}`,
    `User Agent (server-observed): ${serverUserAgent || 'unknown'}`,
    `Platform: ${device?.platform || 'unknown'}`,
    `Language: ${device?.language || 'unknown'}`,
    `Timezone: ${device?.timezone || 'unknown'}`,
    `Screen: ${device?.screen || 'unknown'}`,
    `Viewport: ${device?.viewport || 'unknown'}`,
    `IP: ${ip || 'unknown'}`,
  ];
  return lines.join('\n').slice(0, 5000);
}

/**
 * Creates/updates the HubSpot contact + deal for a quote submission. Callers must treat
 * failures here as non-fatal — a HubSpot outage must never block a customer from reaching
 * Stripe Checkout.
 */
export async function syncQuoteLead({
  name,
  email,
  phone,
  zipCode,
  message,
  pageUrl,
  items,
  total,
  deviceRaw,
  serverUserAgent,
  ip,
  depositStatus = DEPOSIT_STATUS.PENDING,
}) {
  const safeName = sanitizeText(name, 255);
  const { firstname, lastname } = splitName(safeName || 'Unknown');
  const device = parseDevice(deviceRaw);

  const contactId = await upsertContact({
    email: sanitizeText(email, 255).toLowerCase(),
    firstname,
    lastname,
    phone: sanitizeText(phone, 100),
    zip: sanitizeText(zipCode, 20),
    [CONTACT_PROPERTIES.QUOTE_MESSAGE]: sanitizeText(message, 5000),
    [CONTACT_PROPERTIES.QUOTE_PAGE_URL]: sanitizeText(pageUrl, MAX_PAGE_URL_LEN),
    [CONTACT_PROPERTIES.DEVICE_INFO]: formatDeviceInfo(device, serverUserAgent, ip),
  });

  const dealId = await createDeal({
    dealname: `Quote - ${safeName}`.slice(0, 255),
    amount: total,
    contactId,
    quoteItemsJson: safeStringify(items, MAX_QUOTE_ITEMS_JSON_LEN),
    depositStatus,
  });

  return { contactId, dealId };
}

export async function attachStripeSessionToDeal(dealId, sessionId) {
  return setDealStripeSession(dealId, sessionId);
}
