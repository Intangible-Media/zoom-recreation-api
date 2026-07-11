# Zoom Rec Checkout API

Minimal Express API that turns a Webflow quote form submission into a Stripe Checkout Session,
and syncs the lead to HubSpot as a Contact + Deal so you can see whether they left a deposit.

## Requirements

- Node.js 18.11+

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

| Variable | Description |
| --- | --- |
| `PORT` | Port the server listens on (default `3000`) |
| `STRIPE_SECRET_KEY` | Your Stripe secret key — see [Getting your Stripe secret key](#getting-your-stripe-secret-key) |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for `/api/webhooks/stripe` — see [Getting your Stripe webhook secret](#getting-your-stripe-webhook-secret) |
| `WEBFLOW_SUCCESS_URL` | Redirect URL after a successful payment |
| `WEBFLOW_CANCEL_URL` | Redirect URL if the customer cancels |
| `CORS_ORIGIN` | Required. Comma-separated list of allowed origins (your Webflow domain(s)). Requests from any other origin are rejected. |
| `MIN_QUOTE_TOTAL` | Optional. Lowest accepted quote total in dollars (default `1`) |
| `MAX_QUOTE_TOTAL` | Optional. Highest accepted quote total in dollars (default `1000000`) |
| `MAX_QUOTE_ITEMS` | Optional. Highest number of line items accepted in `quoteItems` (default `50`) |
| `HUBSPOT_ACCESS_TOKEN` | HubSpot Service Key — see [Getting your HubSpot Service Key](#getting-your-hubspot-service-key) |

### Getting your Stripe secret key

1. Go to the Stripe Dashboard API keys page — **test mode**: https://dashboard.stripe.com/test/apikeys
   (use this for local dev and the `npm run dev` / Postman testing described below), or **live mode**:
   https://dashboard.stripe.com/apikeys (only once you're ready to take real payments).
2. Under **Standard keys**, either copy an existing secret key's value or click **"+ Create secret key"**
   to make a new one. The value starts with `sk_test_...` (test mode) or `sk_live_...` (live mode).
3. Paste it into `STRIPE_SECRET_KEY` in `.env`. Never commit this value — `.env` is already gitignored.

### Getting your Stripe webhook secret

This app needs a webhook so it actually knows when a customer pays (see
[`POST /api/webhooks/stripe`](#post-apiwebhooksstripe) below) — there are two separate secrets
depending on where you're running:

**Local development (using the Stripe CLI):**
1. Go to https://dashboard.stripe.com/test/workbench/webhooks and click **"Test with a local listener"**.
2. Follow the dialog's step 1 (`stripe login` — approve the pairing code that opens in your browser).
3. For step 2, run this yourself instead of the placeholder command shown (it uses this app's real
   port and route):
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```
4. Leave that terminal running. It prints a line like
   `Ready! Your webhook signing secret is whsec_...` — copy that value into `STRIPE_WEBHOOK_SECRET`
   in `.env` and (re)start the server.
5. Skip the dialog's step 3 example command (`stripe trigger payment_intent.succeeded`) — that event
   isn't one this app listens for. Instead, submit a real test checkout (see
   [Testing the API](#testing-the-api)) and pay with test card `4242 4242 4242 4242`, any future
   expiry, any CVC.

**Production (after deploying):**
1. Go to https://dashboard.stripe.com/webhooks (make sure you're in **live mode**, top-left toggle)
   and click **"+ Add destination"**.
2. Endpoint URL: `https://your-deployed-domain.com/api/webhooks/stripe`.
3. Subscribe to these 4 events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`.
4. Save, open the new endpoint, and click **"Reveal"** under its signing secret. Copy that `whsec_...`
   value into `STRIPE_WEBHOOK_SECRET` in your production host's environment variables (not `.env` —
   that file never leaves your machine).

### Getting your HubSpot Service Key

HubSpot has moved this more than once — **Private Apps** and **Legacy Apps** are both deprecated
for new accounts, so skip anything with those names if you see them. The current path is
**Service Keys**:

1. In HubSpot, use the top search bar ("Find or Ask") and search **"Service Keys"** — or navigate
   the left sidebar: **Development → Keys → Service Keys**.
   - If you land on **"Private Apps"** and see "Your private apps have moved" → **"Go to Legacy
     Apps"**, and that page says "No legacy apps available" — that's expected for a newer account.
     You don't need either page; go to **Service Keys** instead.
   - Don't confuse this with **"Developer API Key"** (also under Keys) — that's a different,
     account-wide key for managing app configs/webhook subscriptions, and won't work for this
     integration's CRM calls.
2. Click **"Create service key"** (or open an existing one you've already made for this).
3. Under **Scopes**, add all 5 of these — the app will fail without any one of them:
   - `crm.objects.contacts.read`
   - `crm.objects.contacts.write`
   - `crm.objects.deals.write`
   - `crm.schemas.contacts.write`
   - `crm.schemas.deals.write`
4. Click **Show**, then **Copy**, next to the key value (starts with `pat-...`). Paste it into
   `HUBSPOT_ACCESS_TOKEN` in `.env`. Never commit this value.
5. Give the key a clear name (e.g. "Checkout HubSpot Sync") so it's identifiable later — not
   something generic or unrelated to what it's actually used for.
6. Run `npm run hubspot:setup` once to create the custom properties this integration uses
   (safe to re-run — it skips properties that already exist):
   - Contact: `quote_message`, `quote_page_url`, `device_info`
   - Deal: `deposit_status` (`pending`/`paid`/`expired`/`failed`), `stripe_checkout_session_id`,
     `quote_items_json`

## Run locally

```bash
npm run dev
```

Server starts on `http://localhost:3000` (or your configured `PORT`).

## Endpoints

### `GET /health`

Returns `{ ok: true }`.

### `POST /api/checkout`

Body:

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "phone": "555-123-4567",
  "zipCode": "90210",
  "message": "Please call before install",
  "quoteItems": "[{\"name\":\"Rocket Ship\",\"price\":170914,\"qty\":2,\"desc\":\"...\",\"img\":\"https://...\"}]",
  "pageUrl": "https://yoursite.com/quote",
  "device": {
    "userAgent": "Mozilla/5.0 ...",
    "platform": "MacIntel",
    "language": "en-US",
    "timezone": "America/Chicago",
    "screen": "1920x1080",
    "viewport": "1280x720"
  }
}
```

`device` is optional and best-effort — `public/webflow-checkout.js` builds it automatically from
`navigator`/`screen`. It's stored on the HubSpot contact as free-text context, not used for any
business logic.

`quoteItems` is a **JSON-encoded string** holding an array of cart line items (the same shape the
Webflow cart already builds). Each item needs at minimum:

| Field | Required | Notes |
| --- | --- | --- |
| `name` | yes | Shown as the Stripe line item name |
| `price` | yes | Whole dollars, e.g. `170914` for $170,914 |
| `qty` | yes | Positive integer |
| `desc` | no | Shown as the Stripe line item description |
| `img` | no | Must be an `https://` URL to be passed through to Stripe |

Any other fields on each item (`id`, `sku`, `category`, `related-products`, etc.) are ignored.
`name` and `email` are required, and the total (sum of `price × qty` across all items) must fall
within `MIN_QUOTE_TOTAL`–`MAX_QUOTE_TOTAL`. One Stripe Checkout line item is created per cart
item, so the customer sees an itemized breakdown at checkout.

Response:

```json
{
  "checkoutUrl": "https://checkout.stripe.com/...",
  "sessionId": "cs_test_..."
}
```

Before creating the Stripe session, this endpoint also upserts a HubSpot Contact (by email) and
creates an associated Deal with `deposit_status` set to `pending`. If HubSpot is unreachable or
misconfigured, this is logged and swallowed — the customer still gets a `checkoutUrl`.

### `POST /api/webhooks/stripe`

Stripe calls this directly — not meant to be called manually. Verifies the `Stripe-Signature`
header against `STRIPE_WEBHOOK_SECRET`, then updates the HubSpot deal's `deposit_status` based on
the event:

| Stripe event | `deposit_status` set to |
| --- | --- |
| `checkout.session.completed` (with `payment_status: paid`) | `paid` |
| `checkout.session.async_payment_succeeded` | `paid` |
| `checkout.session.async_payment_failed` | `failed` |
| `checkout.session.expired` | `expired` |

See [Getting your Stripe webhook secret](#getting-your-stripe-webhook-secret) above for exactly how
to register this (both locally via the Stripe CLI, and in production via the Dashboard).

## Testing the API

With the server running (`npm run dev`), try it from another terminal:

```bash
# Health check
curl http://localhost:3000/health

# Successful checkout session
curl -X POST http://localhost:3000/api/checkout \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Doe",
    "email": "jane@example.com",
    "quoteItems": "[{\"name\":\"Rocket Ship\",\"price\":170914,\"qty\":2}]"
  }'

# Malformed quoteItems -> 400
curl -X POST http://localhost:3000/api/checkout \
  -H "Content-Type: application/json" \
  -d '{"name": "Jane Doe", "email": "jane@example.com", "quoteItems": "not json"}'
```

A real checkout session requires a valid `STRIPE_SECRET_KEY` in `.env` — a placeholder key will
fail with a Stripe authentication error.

### Testing with Postman

1. Make sure the server is running (`npm run dev`) and, for webhook testing, the Stripe CLI
   listener from [Getting your Stripe webhook secret](#getting-your-stripe-webhook-secret) is
   running in another terminal.
2. New Postman request: `POST` → `http://localhost:3000/api/checkout`, header
   `Content-Type: application/json`, body → raw → JSON, using the same shape as the
   [`POST /api/checkout`](#post-apicheckout) example above (`quoteItems` must be a JSON **string**,
   not a nested JSON object).
3. Send it. The response's `checkoutUrl` is a real Stripe Checkout link — paste it directly into
   your browser's address bar (don't click a rendered link if one got mangled by whatever tool
   displayed it) and pay with test card `4242 4242 4242 4242`, any future expiry, any CVC.
4. Confirm the deposit was recorded: in HubSpot, open **CRM → Deals**, find the deal named
   `Quote - <name you sent>` (sorted to the top by most recent), and look for **Deposit Status** in
   the "About this deal" panel. If you don't see it listed, click the small gear icon next to
   **Actions** in that panel → search "Deposit Status" → add it → Save. It should read **Paid**.
   Consider adding it as a default column on your Deals board/list view so you don't have to repeat
   this per deal.

## Deployment

1. Push the code to your host (Render, Railway, Fly.io, a VPS, etc.).
2. Set the environment variables from `.env.example` in the host's environment settings —
   never commit a real `.env` file.
3. Run `npm install` then `npm start`.
4. Set `CORS_ORIGIN` to your live Webflow domain(s), and `WEBFLOW_SUCCESS_URL` /
   `WEBFLOW_CANCEL_URL` to real pages on that site.
5. Update `API_BASE_URL` in `public/webflow-checkout.js` to the deployed API's URL before
   pasting it into Webflow.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Server won't start, `Missing required environment variable: X` | `.env` is missing one of `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `WEBFLOW_SUCCESS_URL`, `WEBFLOW_CANCEL_URL`, `CORS_ORIGIN`, `HUBSPOT_ACCESS_TOKEN` |
| Browser console shows a CORS error | The page's origin isn't in `CORS_ORIGIN` (must match exactly, including `https://` and no trailing slash) |
| `{"error":"Unable to create checkout session"}` | Check the server logs — usually an invalid/placeholder `STRIPE_SECRET_KEY` |
| `{"error":"quoteItems must be a JSON-encoded array..."}` | `quoteItems` isn't valid JSON, isn't an array, or an item is missing `name`/`price`/`qty` |
| `{"error":"Too many items in quoteItems"}` | The array has more items than `MAX_QUOTE_ITEMS` |
| `{"error":"Quote total is outside the allowed range"}` | `sum(price × qty)` is outside `MIN_QUOTE_TOTAL`–`MAX_QUOTE_TOTAL` |
| Deal never moves off `deposit_status: pending` | Check server logs for HubSpot errors, and confirm the Stripe webhook is registered and pointed at the right URL/events (see `/api/webhooks/stripe` above) |
| Webhook returns `Webhook Error: ...` (400) | `STRIPE_WEBHOOK_SECRET` doesn't match the endpoint's signing secret in the Stripe Dashboard, or the request body was altered (e.g. by a proxy re-encoding JSON) before reaching Express |
| HubSpot sync silently does nothing | `HUBSPOT_ACCESS_TOKEN` is invalid/expired, lacks the required scopes, or `npm run hubspot:setup` was never run — check server logs, errors there don't fail the checkout request |

## Webflow frontend

`public/webflow-checkout.js` is a drop-in script for the Webflow form page — it reads plain HTML
`name` attributes off your form, so build the form to this exact pattern and the script needs zero
changes:

| Element | Attribute | Notes |
| --- | --- | --- |
| The `<form>` itself | `id="quote-form"` | Required — the script won't attach if this is missing |
| Name field | `name="name"` | Required |
| Email field | `name="email"` | Required, must be a valid email |
| Phone field | `name="phone"` | Optional |
| ZIP field | `name="zipCode"` | Optional |
| Message field | `name="message"` | Optional, any `<input>` or `<textarea>` |
| Cart data field | `name="quoteItems"` | Required — see below |
| Error message container | `id="quote-form-error"` | Optional; falls back to a browser `alert()` if omitted |

`quoteItems` must be a **hidden field** whose `value` your own cart-building code sets to
`JSON.stringify(cartArray)` before submit (this script forwards it as-is, it doesn't build the
cart). `pageUrl` and `device` (browser/OS/screen info) are captured automatically — you don't add
fields for those.

Example markup that follows this pattern exactly:

```html
<form id="quote-form">
  <input type="text"   name="name"     placeholder="Full name" required>
  <input type="email"  name="email"    placeholder="Email" required>
  <input type="tel"    name="phone"    placeholder="Phone">
  <input type="text"   name="zipCode"  placeholder="ZIP code">
  <textarea             name="message" placeholder="Anything else?"></textarea>

  <!-- Set via JS from your cart logic: quoteItemsField.value = JSON.stringify(cartArray) -->
  <input type="hidden" name="quoteItems" value="">

  <div id="quote-form-error" style="display:none; color:#c00;"></div>
  <button type="submit">Get Quote &amp; Pay Deposit</button>
</form>
```

To wire it up:

1. Set `API_BASE_URL` at the top of the script below to your deployed API's URL.
2. Paste the script into Webflow: Page Settings → Custom Code → **Before `</body>` tag** (or an
   embedded HTML/Script component near the form).
3. Build the form to the pattern above — field names are case-sensitive and must match exactly.

This script is kept in [`public/webflow-checkout.js`](public/webflow-checkout.js) — the copy below
must be kept in sync with that file if either one changes:

```javascript
// Paste this in Webflow: Page Settings > Custom Code > Before </body> tag,
// or as an embedded HTML/Script component near the form.
//
// Expects a <form id="quote-form"> with fields named:
// name, email, phone, zipCode, message, quoteItems
// quoteItems must already hold the cart array serialized via JSON.stringify(...)
// (this script forwards the string as-is, it does not build the cart itself).
// Optional error container: <div id="quote-form-error"></div>
(function () {
  const API_BASE_URL = 'https://your-api-domain.com'; // TODO: set your deployed API URL

  const form = document.querySelector('#quote-form');
  if (!form) return;

  const errorEl = document.querySelector('#quote-form-error');
  const submitBtn = form.querySelector('[type="submit"]');

  function setLoading(isLoading) {
    if (!submitBtn) return;
    submitBtn.disabled = isLoading;

    if (isLoading) {
      submitBtn.dataset.originalText =
        submitBtn.dataset.originalText || submitBtn.value || submitBtn.textContent;
      const label = 'Processing...';
      if (submitBtn.tagName === 'INPUT') submitBtn.value = label;
      else submitBtn.textContent = label;
    } else if (submitBtn.dataset.originalText) {
      if (submitBtn.tagName === 'INPUT') submitBtn.value = submitBtn.dataset.originalText;
      else submitBtn.textContent = submitBtn.dataset.originalText;
    }
  }

  function showError(message) {
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    } else {
      alert(message);
    }
  }

  function clearError() {
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
  }

  function collectDeviceInfo() {
    return {
      userAgent: navigator.userAgent || '',
      platform: navigator.platform || '',
      language: navigator.language || '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      screen: `${screen.width}x${screen.height}`,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
    };
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();
    setLoading(true);

    const formData = new FormData(form);
    const payload = {
      name: formData.get('name') || '',
      email: formData.get('email') || '',
      phone: formData.get('phone') || '',
      zipCode: formData.get('zipCode') || '',
      message: formData.get('message') || '',
      quoteItems: formData.get('quoteItems') || '',
      pageUrl: window.location.href,
      device: collectDeviceInfo(),
    };

    try {
      const response = await fetch(`${API_BASE_URL}/api/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || !data.checkoutUrl) {
        throw new Error(data.error || 'Something went wrong. Please try again.');
      }

      window.location.href = data.checkoutUrl;
    } catch (err) {
      showError(err.message || 'Something went wrong. Please try again.');
      setLoading(false);
    }
  });
})();
```

The script prevents the default form submit, disables the submit button while the request is in
flight, and redirects the browser to `checkoutUrl` on success.

## Notes

- Currency is fixed to USD; `price` in `quoteItems` is assumed to be whole dollars.
- The quote total is computed server-side as `sum(price × qty)` from the client-submitted
  `quoteItems`, not looked up from a trusted product catalog. `MIN_QUOTE_TOTAL`/`MAX_QUOTE_TOTAL`
  are a sanity guardrail against obviously tampered or garbage values, not a substitute for
  server-side pricing if that becomes a concern later.
