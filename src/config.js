const REQUIRED_VARS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'WEBFLOW_SUCCESS_URL',
  'WEBFLOW_CANCEL_URL',
  'CORS_ORIGIN',
  'HUBSPOT_ACCESS_TOKEN',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'HUBSPOT_DEAL_PIPELINE',
];

for (const key of REQUIRED_VARS) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

// Accepts a bare address ("a@b.com") or "Display Name <a@b.com>" — the two forms
// Resend's `from` field supports. Catches a typo'd EMAIL_FROM at boot instead of at
// the first send, where the only symptom would be every quote/receipt email quietly
// failing until someone notices.
const EMAIL_FROM_PATTERN = /^(?:[^<>]*<)?[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>?$/;
if (!EMAIL_FROM_PATTERN.test(process.env.EMAIL_FROM)) {
  throw new Error('EMAIL_FROM must be an email address or "Name <email@domain.com>"');
}

export const config = {
  port: Number(process.env.PORT) || 3000,
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  successUrl: process.env.WEBFLOW_SUCCESS_URL,
  cancelUrl: process.env.WEBFLOW_CANCEL_URL,
  corsOrigins: (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  minQuoteTotal: Number(process.env.MIN_QUOTE_TOTAL) || 1,
  maxQuoteTotal: Number(process.env.MAX_QUOTE_TOTAL) || 1_000_000,
  maxQuoteItems: Number(process.env.MAX_QUOTE_ITEMS) || 50,
  hubspotAccessToken: process.env.HUBSPOT_ACCESS_TOKEN,
  resendApiKey: process.env.RESEND_API_KEY,
  emailFrom: process.env.EMAIL_FROM,
  // Pipeline/stage are resolved by label, not id — ids are portal-specific and this
  // app now talks to more than one HubSpot portal. Stage is optional: unset means
  // "use the pipeline's first stage" (see src/hubspot/pipelines.js).
  hubspotDealPipeline: process.env.HUBSPOT_DEAL_PIPELINE,
  hubspotDealStage: process.env.HUBSPOT_DEAL_STAGE || null,
};
