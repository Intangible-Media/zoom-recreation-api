import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './src/config.js';
import healthRouter from './src/routes/health.js';
import checkoutRouter from './src/routes/checkout.js';
import stripeWebhookRouter from './src/routes/stripeWebhook.js';

const app = express();

// Deployed behind a single reverse proxy (Render/Railway/Fly.io) — needed so
// req.ip and express-rate-limit see the real client IP instead of the proxy's.
app.set('trust proxy', 1);

// CORS_ORIGIN is required (see src/config.js), so unknown origins are denied by default.
app.use(cors({ origin: config.corsOrigins }));

// Must be mounted with the raw body, and before express.json() below, because
// Stripe's signature verification needs the exact unparsed request bytes.
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhookRouter);

app.use(express.json());

const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/health', healthRouter);
app.use('/api/checkout', checkoutLimiter, checkoutRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Catches malformed JSON bodies and any other error thrown in a route,
// so clients always get JSON instead of Express's default HTML error page.
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
});
