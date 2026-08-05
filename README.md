# Zoom Rec Checkout API

Minimal Express API that turns a Webflow quote form submission into a Stripe Checkout Session,
and syncs the lead to HubSpot as a Contact + Deal so you can see whether they left a deposit.
It can also email the customer their itemized quote directly with no payment involved
([`POST /api/quote/email`](#post-apiquoteemail)), and automatically emails a receipt once a
deposit is actually paid — both sent via [Resend](https://resend.com).

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
| `RESEND_API_KEY` | Resend API key used to send quote/receipt emails — see [Getting your Resend API key](#getting-your-resend-api-key) |
| `EMAIL_FROM` | "From" address for quote/receipt emails, e.g. `Zoom Rec <quotes@yourdomain.com>` — the domain must be verified in Resend |
| `HUBSPOT_DEAL_PIPELINE` | Required. The exact label of the HubSpot deal pipeline new quotes should go into, e.g. `Sales Order Pipeline` — see [Sending deals into a specific pipeline](#sending-deals-into-a-specific-pipeline) |
| `HUBSPOT_DEAL_STAGE` | Optional. The exact label of the stage within `HUBSPOT_DEAL_PIPELINE` new deals start in — defaults to that pipeline's first stage if unset |

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

   There's no separate scope for Notes — HubSpot doesn't expose one (Notes are an
   engagement type, not a standalone CRM object with its own scope). Creating a Note
   associated to a deal is authorized by `crm.objects.deals.write` above, the same
   scope that already covers writing the deal itself.
4. Click **Show**, then **Copy**, next to the key value (starts with `pat-...`). Paste it into
   `HUBSPOT_ACCESS_TOKEN` in `.env`. Never commit this value.
5. Give the key a clear name (e.g. "Checkout HubSpot Sync") so it's identifiable later — not
   something generic or unrelated to what it's actually used for.
6. Run `npm run hubspot:setup` once to create the custom properties this integration uses
   (safe to re-run — it creates anything missing, and backfills any new enum options onto a
   property that already exists, e.g. if you set this up before `no_deposit` was added below):
   - Contact: `quote_message`, `quote_page_url`, `device_info`
   - Deal: `deposit_status` (`pending`/`paid`/`expired`/`failed`/`no_deposit`),
     `stripe_checkout_session_id`, `quote_items_json`

### Sending deals into a specific pipeline

By default HubSpot puts every new deal in the account's default pipeline. To send this app's
deals into a specific one instead (e.g. "Sales Order Pipeline"):

1. In HubSpot, open the pipeline you want (**Settings → Objects → Deals → Pipelines**) and note
   its exact label, and the exact label of whichever stage new deals should start in (or skip the
   stage — it defaults to that pipeline's first stage).
2. Set `HUBSPOT_DEAL_PIPELINE` in `.env` (or your host's environment variables) to that pipeline's
   label, e.g. `Sales Order Pipeline` — must match exactly (case-insensitive, but otherwise exact).
   Optionally set `HUBSPOT_DEAL_STAGE` the same way.
3. No extra HubSpot scope is needed — resolving a pipeline/stage by label uses the same
   `crm.objects.deals.write` scope already required above.

Pipelines and stages are **portal-specific** — if this app talks to more than one HubSpot
account (see [Getting your HubSpot Service Key](#getting-your-hubspot-service-key)), each
deployment sets its own `HUBSPOT_DEAL_PIPELINE`/`HUBSPOT_DEAL_STAGE` matching that portal's own
pipeline, since the same label can (and often will) resolve to a different id per account.

If the configured label doesn't match any pipeline/stage in the connected portal (typo, wrong
portal, pipeline renamed), this is logged as an error and the deal still gets created — just in
the account's default pipeline instead, same fallback behavior as every other best-effort
HubSpot step in this app.

### Getting your Resend API key

This app sends the quote-email and payment-receipt emails through
[Resend](https://resend.com):

1. Sign up / log in at https://resend.com.
2. **Domains** → **Add Domain** → follow the DNS instructions to add the SPF/DKIM records at
   your DNS provider, then wait for the domain to show **Verified** (usually minutes, sometimes
   longer depending on DNS propagation). Sending from an unverified domain, or a personal address
   like a Gmail account, will fail or land in spam.
3. **API Keys** → **Create API Key** → name it (e.g. "Zoom Rec Checkout API") → copy the value
   (starts with `re_...`) into `RESEND_API_KEY` in `.env`. Never commit this value.
4. Set `EMAIL_FROM` to an address at that verified domain, optionally with a display name:
   `Zoom Rec <quotes@yourdomain.com>`.

## Run locally

```bash
npm run dev
```

Server starts on `http://localhost:3000` (or your configured `PORT`).

## Endpoints

### `GET /`

Serves [`public/index.html`](public/index.html) — a self-contained documentation homepage covering
both audiences: a plain-language "how it works" walkthrough (for the business side — what happens
when a customer submits a quote, pays a deposit, or requests an email-only quote, and what shows
up in HubSpot) and a developer-facing API reference. It's a static file with brand colors/logo
matching the emails (see [`src/email/templates/shared.js`](src/email/templates/shared.js)'s
`BRAND` constant — kept in sync by hand, there's no templating engine in this app). Safe to be
public: it documents behavior, not secrets.

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
| `price` | yes | Whole dollars, e.g. `170914` for $170,914. `0` is allowed — see below |
| `qty` | yes | Positive integer |
| `desc` | no | Shown as the Stripe line item description |
| `img` | no | Must be an `https://` URL to be passed through to Stripe |

Any other fields on each item (`id`, `sku`, `category`, `related-products`, etc.) are ignored.
`name` and `email` are required, and the total (sum of `price × qty` across all items) must fall
within `MIN_QUOTE_TOTAL`–`MAX_QUOTE_TOTAL`. One Stripe Checkout line item is created per cart
item, so the customer sees an itemized breakdown at checkout.

**`price: 0` — quote-only items.** Some line items (e.g. "pricing provided after a site
review") don't have a firm price yet. Send them with `price: 0` and they'll still appear in the
itemized quote/receipt email and in HubSpot's `quote_items_json` — with a "Price provided after
review" note instead of "$0.00" — but they're excluded from what's actually sent to Stripe, since
there's nothing to charge for them. A cart can mix `price: 0` and priced items freely. On
`/api/checkout`, the *chargeable* total (sum across priced items only) must still meet
`MIN_QUOTE_TOTAL`, so an all-`price: 0` cart is rejected there — use
[`/api/quote/email`](#post-apiquoteemail) instead, which allows a total of `0`.

Response:

```json
{
  "checkoutUrl": "https://checkout.stripe.com/...",
  "sessionId": "cs_test_..."
}
```

Before creating the Stripe session, this endpoint also upserts a HubSpot Contact (by email) and
creates an associated Deal with `deposit_status` set to `pending`, plus a **Note** on that deal
leading with the deal's own id ("Order #") and an "Order Type" line, then every cart item in
plain language (name, quantity, price or "price provided after review"), and the total — so a
sales rep can tell whether the customer chose the deposit route or the email-only route, and what
they ordered, from the deal alone, without reading `quote_items_json`'s raw JSON. If HubSpot is
unreachable or misconfigured, all of this is logged and swallowed — the customer still gets a
`checkoutUrl`. The deal's id is also the "Order #" shown later in the payment receipt email (see
[`POST /api/webhooks/stripe`](#post-apiwebhooksstripe) below) — the same number a rep sees on the
deal is what the customer sees in their inbox.

Rate-limited to 20 requests / 15 min per IP.

### `POST /api/quote/email`

Same request body as [`POST /api/checkout`](#post-apicheckout) above — same `quoteItems` shape,
same validation rules (`name`/`email` required, item count within `MAX_QUOTE_ITEMS`), except the
total may be as low as `0` here (still capped at `MAX_QUOTE_TOTAL`) — `/api/checkout` requires at
least `MIN_QUOTE_TOTAL`, since it always charges something, while this route doesn't, so a cart
made entirely of `price: 0` quote-only items is valid. Use this instead of `/api/checkout` when
the customer wants the quote emailed to them without paying a deposit right now.

Response on success:

```json
{ "ok": true }
```

A HubSpot Contact + Deal is created first (best-effort, same as `/api/checkout`), except
`deposit_status` is `no_deposit` instead of `pending` — same readable Note as `/api/checkout`
too, so a rep sees "Order Type: Email Quote Only" at a glance. The deal is created *before* the
email so the email can include the deal's id as an "Order #". If HubSpot is unreachable, this is
logged and the email still goes out — just without an order number — rather than blocking the
whole point of this route on a HubSpot outage. If the email send itself then fails, you get back
a `502` (`{"error":"Unable to send quote email"}`).

A duplicate submission (same email/total/item-count) within 5 minutes returns `{ "ok": true }`
without re-sending — protects against a double-click resending the email or creating a second
HubSpot deal.

Rate-limited to 5 requests / 15 min per IP — tighter than `/api/checkout`'s 20, since this route
has no payment step to naturally throttle repeated use.

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

Either `paid`-triggering row above also sends the customer an automatic receipt email via
Resend, to the email address Stripe collected at Checkout. This doesn't require subscribing to
any additional Stripe event — the two events that trigger it were already required for the
HubSpot sync above. The receipt's subject and body include an "Order #" — the same HubSpot deal
id shown on the deal's Note back at checkout time — so a customer referencing "Order #12345" on
a call maps directly to that deal. Omitted (not a placeholder) if the original checkout-time
HubSpot sync never attached a deal id to the session.

The receipt shows the **entire original cart**, not just what got charged: it's built from the
HubSpot deal's `quote_items_json` (the full cart, including any `price: 0` quote-only items that
were never sent to Stripe — see [`price: 0` — quote-only items](#post-apicheckout) above), so the
customer can see both what they paid a deposit for and what still needs pricing, in one email.
Items without a deposit are marked "No deposit collected" instead of showing an amount. If the
deal/cart can't be loaded for any reason (e.g. the original HubSpot sync failed at checkout time),
this falls back to Stripe's own line items instead — which only ever reflects the priced items, so
in that fallback case any `price: 0` items simply won't appear.

See [Getting your Stripe webhook secret](#getting-your-stripe-webhook-secret) above for exactly how
to register this (both locally via the Stripe CLI, and in production via the Dashboard).

## Testing the API

### Automated tests

```bash
npm test
```

Runs unit tests for the pure logic in this app (`parseQuoteItems`, `validateQuoteRequest`, the
HubSpot pipeline/stage resolver, the HubSpot Note formatter, the email templates' order-number
rendering) using Node's built-in test runner — no extra dependency, no network calls. Covers
`price: 0` acceptance, still-rejected cases (`null`, `NaN`, non-integers, negatives, `qty: 0`),
the per-route total minimum (`/api/checkout` vs. `/api/quote/email`), and that the Order #/Order
Type lines render (or correctly omit themselves) as expected. This doesn't cover Stripe/HubSpot/Resend
integration itself — use the manual curl/Postman flows below for that.

### Manual testing

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

# Email the quote instead of paying a deposit
curl -X POST http://localhost:3000/api/quote/email \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Doe",
    "email": "jane@example.com",
    "quoteItems": "[{\"name\":\"Rocket Ship\",\"price\":170914,\"qty\":2}]"
  }'

# Mixed cart on checkout -> 200; Stripe only sees the priced item, the $0 item
# still appears on the emailed receipt (see POST /api/webhooks/stripe above)
curl -X POST http://localhost:3000/api/checkout \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Doe",
    "email": "jane@example.com",
    "quoteItems": "[{\"name\":\"Quote Only\",\"price\":0,\"qty\":1},{\"name\":\"Priced\",\"price\":42840,\"qty\":1}]"
  }'

# All quote-only ($0) items on /api/quote/email -> 200 { "ok": true }
curl -X POST http://localhost:3000/api/quote/email \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Doe",
    "email": "jane@example.com",
    "quoteItems": "[{\"name\":\"Quote Only\",\"price\":0,\"qty\":5}]"
  }'

# The same all-quote-only cart on /api/checkout -> 400, nothing to charge
curl -X POST http://localhost:3000/api/checkout \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Doe",
    "email": "jane@example.com",
    "quoteItems": "[{\"name\":\"Quote Only\",\"price\":0,\"qty\":5}]"
  }'

# Negative price is still rejected (only 0 became valid, not negatives) -> 400
curl -X POST http://localhost:3000/api/checkout \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Doe",
    "email": "jane@example.com",
    "quoteItems": "[{\"name\":\"Bad\",\"price\":-5,\"qty\":1}]"
  }'
```

A real checkout session requires a valid `STRIPE_SECRET_KEY` in `.env` — a placeholder key will
fail with a Stripe authentication error. Likewise, `/api/quote/email` requires a valid
`RESEND_API_KEY` and a verified `EMAIL_FROM` domain — a placeholder key fails with
`{"error":"Unable to send quote email"}` (502).

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
2. Set the environment variables from `.env.example` in the host's environment settings — never
   commit a real `.env` file. This includes `RESEND_API_KEY` and `EMAIL_FROM`: the server refuses
   to start without them (see [Getting your Resend API key](#getting-your-resend-api-key)).
3. Run `npm install` then `npm start`.
4. Set `CORS_ORIGIN` to your live Webflow domain(s), and `WEBFLOW_SUCCESS_URL` /
   `WEBFLOW_CANCEL_URL` to real pages on that site.
5. Update `API_BASE_URL` in `public/webflow-checkout.js` to the deployed API's URL before
   pasting it into Webflow.
6. Redeploying an app that was already live before this email feature existed? Run
   `npm run hubspot:setup` once more (locally, pointed at production's `HUBSPOT_ACCESS_TOKEN`) to
   backfill the new `no_deposit` option onto your existing `deposit_status` property — see step 6
   in [Getting your HubSpot Service Key](#getting-your-hubspot-service-key).
7. Redeploying an app that was already live before pipeline routing existed? Add
   `HUBSPOT_DEAL_PIPELINE` to that host's environment variables before redeploying — the server
   now refuses to start without it (see
   [Sending deals into a specific pipeline](#sending-deals-into-a-specific-pipeline)).

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Server won't start, `Missing required environment variable: X` | `.env` is missing one of `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `WEBFLOW_SUCCESS_URL`, `WEBFLOW_CANCEL_URL`, `CORS_ORIGIN`, `HUBSPOT_ACCESS_TOKEN`, `RESEND_API_KEY`, `EMAIL_FROM`, `HUBSPOT_DEAL_PIPELINE` |
| Server won't start, `EMAIL_FROM must be an email address or "Name <email@domain.com>"` | `EMAIL_FROM` doesn't match either accepted format — fix the value in `.env` |
| Browser console shows a CORS error | The page's origin isn't in `CORS_ORIGIN` (must match exactly, including `https://` and no trailing slash) |
| `{"error":"Unable to create checkout session"}` | Check the server logs — usually an invalid/placeholder `STRIPE_SECRET_KEY` |
| `{"error":"Unable to send quote email"}` (from `/api/quote/email`) | Check the server logs — usually an invalid/placeholder `RESEND_API_KEY`, or `EMAIL_FROM`'s domain isn't verified in Resend yet |
| `{"error":"quoteItems must be a JSON-encoded array..."}` | `quoteItems` isn't valid JSON, isn't an array, or an item is missing `name`/`price`/`qty`. Note `price: 0` itself is valid — only `null`, a missing field, `NaN`, non-integers, and negatives are rejected |
| `{"error":"Too many items in quoteItems"}` | The array has more items than `MAX_QUOTE_ITEMS` |
| `{"error":"Quote total is outside the allowed range"}` | `sum(price × qty)` is outside `MIN_QUOTE_TOTAL`–`MAX_QUOTE_TOTAL` |
| `429 Too Many Requests` on `/api/quote/email` sooner than expected | That route is limited to 5 requests / 15 min per IP (tighter than `/api/checkout`'s 20) — see [`POST /api/quote/email`](#post-apiquoteemail) |
| Deal never moves off `deposit_status: pending` | Check server logs for HubSpot errors, and confirm the Stripe webhook is registered and pointed at the right URL/events (see `/api/webhooks/stripe` above) |
| Customer never gets a receipt email after paying | Check server logs for `Failed to send receipt email` — same causes as the `/api/quote/email` row above, or the Stripe session had no customer email attached |
| Webhook returns `Webhook Error: ...` (400) | `STRIPE_WEBHOOK_SECRET` doesn't match the endpoint's signing secret in the Stripe Dashboard, or the request body was altered (e.g. by a proxy re-encoding JSON) before reaching Express |
| HubSpot sync silently does nothing | `HUBSPOT_ACCESS_TOKEN` is invalid/expired, lacks the required scopes, or `npm run hubspot:setup` was never run — check server logs, errors there don't fail the checkout/quote-email request |
| Deal is created but has no cart-details Note | Check server logs for `Failed to create quote-details note` and the HubSpot error beneath it — the deal itself still gets created either way, since note creation is best-effort |
| Deal lands in the wrong pipeline | Check server logs for `Failed to resolve HubSpot deal pipeline/stage` — `HUBSPOT_DEAL_PIPELINE`/`HUBSPOT_DEAL_STAGE` doesn't exactly match a pipeline/stage label in the connected portal (see [Sending deals into a specific pipeline](#sending-deals-into-a-specific-pipeline)); the deal still gets created, just in the account's default pipeline |

## Webflow frontend

`public/webflow-checkout.js` is a drop-in script for the Webflow form page — it reads plain HTML
`name` attributes off your form, so build the form to this exact pattern and the script needs zero
changes. One form, two actions:

- The form's own submit button pays a deposit (`POST /api/checkout`) and redirects to Stripe
  Checkout.
- An optional second button emails the itemized quote instead (`POST /api/quote/email`) — no
  payment, no redirect, just a success message. Omit it if you only want the deposit flow.

| Element | Attribute | Notes |
| --- | --- | --- |
| The `<form>` itself | `id="quote-form"` | Required — the script won't attach if this is missing |
| Name field | `name="name"` | Required |
| Email field | `name="email"` | Required, must be a valid email |
| Phone field | `name="phone"` | Optional |
| ZIP field | `name="zipCode"` | Optional |
| Message field | `name="message"` | Optional, any `<input>` or `<textarea>` |
| Cart data field | `name="quoteItems"` | Required — see below |
| Pay-deposit button | `type="submit"` (inside the form) | Required — triggers `/api/checkout` |
| Email-quote button | `id="quote-email-btn"`, `type="button"` | Optional — triggers `/api/quote/email`. Must be `type="button"`, not `type="submit"`, or it will also submit the form |
| Error message container | `id="quote-form-error"` | Optional; falls back to a browser `alert()` if omitted |
| Success message container | `id="quote-form-success"` | Optional (used by the email-quote button only); falls back to a browser `alert()` if omitted |

`quoteItems` must be a **hidden field** whose `value` your own cart-building code sets to
`JSON.stringify(cartArray)` before either button is clicked (this script forwards it as-is, it
doesn't build the cart). `pageUrl` and `device` (browser/OS/screen info) are captured
automatically — you don't add fields for those.

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
  <div id="quote-form-success" style="display:none; color:#080;"></div>

  <button type="submit">Get Quote &amp; Pay Deposit</button>
  <button type="button" id="quote-email-btn">Email Me the Quote Instead</button>
</form>
```

To wire it up:

1. Set `API_BASE_URL` at the top of the script below to your deployed API's URL.
2. Paste the script into Webflow: Page Settings → Custom Code → **Before `</body>` tag** (or an
   embedded HTML/Script component near the form).
3. Build the form to the pattern above — field names/ids are case-sensitive and must match
   exactly. Drop the `id="quote-email-btn"` button (and its `#quote-form-success` container) if you
   only want the deposit flow.

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
//
// Two actions share this one form:
// - The form's own submit (a <button type="submit"> inside it) pays a deposit via
//   POST /api/checkout and redirects the browser to Stripe Checkout.
// - A separate button (id="quote-email-btn", type="button" so it doesn't also submit
//   the form) emails the itemized quote instead via POST /api/quote/email — no payment,
//   no redirect. The button is optional: omit it and only the deposit flow is wired up.
//
// Optional error container: <div id="quote-form-error"></div>
// Optional success container (used by the "email me the quote" action only):
// <div id="quote-form-success"></div>
(function () {
  const API_BASE_URL = 'https://your-api-domain.com'; // TODO: set your deployed API URL

  const form = document.querySelector('#quote-form');
  if (!form) return;

  const errorEl = document.querySelector('#quote-form-error');
  const successEl = document.querySelector('#quote-form-success');
  const submitBtn = form.querySelector('[type="submit"]');
  const emailQuoteBtn = document.querySelector('#quote-email-btn');

  function setLoading(button, isLoading) {
    if (!button) return;
    button.disabled = isLoading;

    if (isLoading) {
      button.dataset.originalText =
        button.dataset.originalText || button.value || button.textContent;
      const label = 'Processing...';
      if (button.tagName === 'INPUT') button.value = label;
      else button.textContent = label;
    } else if (button.dataset.originalText) {
      if (button.tagName === 'INPUT') button.value = button.dataset.originalText;
      else button.textContent = button.dataset.originalText;
    }
  }

  function clearSuccess() {
    if (successEl) {
      successEl.textContent = '';
      successEl.style.display = 'none';
    }
  }

  function clearError() {
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
  }

  function showError(message) {
    clearSuccess();
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    } else {
      alert(message);
    }
  }

  function showSuccess(message) {
    clearError();
    if (successEl) {
      successEl.textContent = message;
      successEl.style.display = 'block';
    } else {
      alert(message);
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

  function buildPayload() {
    const formData = new FormData(form);
    return {
      name: formData.get('name') || '',
      email: formData.get('email') || '',
      phone: formData.get('phone') || '',
      zipCode: formData.get('zipCode') || '',
      message: formData.get('message') || '',
      quoteItems: formData.get('quoteItems') || '',
      pageUrl: window.location.href,
      device: collectDeviceInfo(),
    };
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();
    clearSuccess();
    setLoading(submitBtn, true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });

      const data = await response.json();

      if (!response.ok || !data.checkoutUrl) {
        throw new Error(data.error || 'Something went wrong. Please try again.');
      }

      window.location.href = data.checkoutUrl;
    } catch (err) {
      showError(err.message || 'Something went wrong. Please try again.');
      setLoading(submitBtn, false);
    }
  });

  if (emailQuoteBtn) {
    emailQuoteBtn.addEventListener('click', async () => {
      // Runs the form's native required/type validation (e.g. name, email) without
      // submitting it, since this button is type="button".
      if (!form.reportValidity()) return;

      clearError();
      clearSuccess();
      setLoading(emailQuoteBtn, true);

      try {
        const response = await fetch(`${API_BASE_URL}/api/quote/email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload()),
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
          throw new Error(data.error || 'Something went wrong. Please try again.');
        }

        showSuccess("Check your inbox — we've emailed you the quote.");
      } catch (err) {
        showError(err.message || 'Something went wrong. Please try again.');
      } finally {
        setLoading(emailQuoteBtn, false);
      }
    });
  }
})();
```

The submit handler prevents the default form submit, disables the deposit button while the
request is in flight, and redirects the browser to `checkoutUrl` on success. The email-quote
button (if present) instead disables itself, shows a success message on completion, and never
navigates away from the page.

## Notes

- Currency is fixed to USD; `price` in `quoteItems` is assumed to be whole dollars.
- The quote total is computed server-side as `sum(price × qty)` from the client-submitted
  `quoteItems`, not looked up from a trusted product catalog. `MIN_QUOTE_TOTAL`/`MAX_QUOTE_TOTAL`
  are a sanity guardrail against obviously tampered or garbage values, not a substitute for
  server-side pricing if that becomes a concern later.
- `deposit_status` on a HubSpot deal can be `pending`, `paid`, `expired`, `failed`, or
  `no_deposit` (set by `/api/quote/email` when the customer chose to get the quote emailed
  instead of paying now).
- Every deal also gets a **Note** (see [`src/hubspot/formatQuoteNote.js`](src/hubspot/formatQuoteNote.js))
  leading with "Order #" (the deal's own id) and "Order Type" (Deposit vs. Email Quote Only), then
  the cart in plain language for sales — `quote_items_json` remains the machine-readable source of
  truth the receipt email is built from, the Note is a human-readable summary of the same data, not
  a second copy of record. The same deal id shows up as the customer-facing "Order #" in both the
  quote email and the payment receipt.
- Email deliverability for both `/api/quote/email` and the payment receipt depends entirely on
  `EMAIL_FROM`'s domain being verified in Resend — an unverified domain will fail sends outright,
  and even a verified one can still land in spam without properly configured SPF/DKIM (which
  Resend's domain setup walks you through) and a reasonable sending reputation.
- `/api/quote/email` sends to whatever address the request supplies with no proof the requester
  controls that inbox — the same trust model as most "email me a quote" web forms. The 5-per-15-min
  per-IP rate limit and 5-minute duplicate-submission dedup bound casual abuse, but this is not a
  verified-delivery guarantee.
- All three emailed views of a cart — the quote email, the paid receipt, and HubSpot's
  `quote_items_json` — carry the same full list of items, `price: 0` ones included. Only the
  Stripe Checkout Session (and therefore what's actually charged) is filtered to priced items.
- Quote/receipt emails are branded with the logo and colors defined in
  [`src/email/templates/shared.js`](src/email/templates/shared.js) (`BRAND.logoUrl`, `BRAND.primary`,
  `BRAND.dark`) — update that one file to rebrand both templates. The logo is referenced by URL
  (not embedded), so it must stay reachable at that address, and note that some email clients
  (notably Outlook desktop) don't render SVG images — the alt text (`BRAND.name`) shows in those
  clients instead.
