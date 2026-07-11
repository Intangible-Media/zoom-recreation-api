const REQUIRED_VARS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'WEBFLOW_SUCCESS_URL',
  'WEBFLOW_CANCEL_URL',
  'CORS_ORIGIN',
  'HUBSPOT_ACCESS_TOKEN',
];

for (const key of REQUIRED_VARS) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
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
};
