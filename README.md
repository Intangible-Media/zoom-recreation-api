# Zoom Rec Checkout API

Minimal Express API that turns a Webflow quote form submission into a Stripe Checkout Session.

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
| `STRIPE_SECRET_KEY` | Your Stripe secret key |
| `WEBFLOW_SUCCESS_URL` | Redirect URL after a successful payment |
| `WEBFLOW_CANCEL_URL` | Redirect URL if the customer cancels |
| `CORS_ORIGIN` | Required. Comma-separated list of allowed origins (your Webflow domain(s)). Requests from any other origin are rejected. |
| `MIN_QUOTE_TOTAL` | Optional. Lowest accepted quote total in dollars (default `1`) |
| `MAX_QUOTE_TOTAL` | Optional. Highest accepted quote total in dollars (default `1000000`) |
| `MAX_QUOTE_ITEMS` | Optional. Highest number of line items accepted in `quoteItems` (default `50`) |

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
  "pageUrl": "https://yoursite.com/quote"
}
```

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
| Server won't start, `Missing required environment variable: X` | `.env` is missing one of `STRIPE_SECRET_KEY`, `WEBFLOW_SUCCESS_URL`, `WEBFLOW_CANCEL_URL`, `CORS_ORIGIN` |
| Browser console shows a CORS error | The page's origin isn't in `CORS_ORIGIN` (must match exactly, including `https://` and no trailing slash) |
| `{"error":"Unable to create checkout session"}` | Check the server logs — usually an invalid/placeholder `STRIPE_SECRET_KEY` |
| `{"error":"quoteItems must be a JSON-encoded array..."}` | `quoteItems` isn't valid JSON, isn't an array, or an item is missing `name`/`price`/`qty` |
| `{"error":"Too many items in quoteItems"}` | The array has more items than `MAX_QUOTE_ITEMS` |
| `{"error":"Quote total is outside the allowed range"}` | `sum(price × qty)` is outside `MIN_QUOTE_TOTAL`–`MAX_QUOTE_TOTAL` |

## Webflow frontend

`public/webflow-checkout.js` is a drop-in script for the Webflow form page. Before pasting it in:

1. Set `API_BASE_URL` at the top of the file to your deployed API's URL.
2. Make sure the form has `id="quote-form"` and fields named `name`, `email`, `phone`,
   `zipCode`, `message`, `quoteItems` (matching the request body above). The `quoteItems`
   field's value must already be the cart array serialized with `JSON.stringify(...)` —
   this script sends it through as-is.
3. Optionally add `<div id="quote-form-error"></div>` near the form to show error messages.

The script prevents the default form submit, disables the submit button while the request is in
flight, and redirects the browser to `checkoutUrl` on success.

## Notes

- HubSpot integration and Stripe webhooks are intentionally not included yet — planned for a
  follow-up pass.
- Currency is fixed to USD; `price` in `quoteItems` is assumed to be whole dollars.
- The quote total is computed server-side as `sum(price × qty)` from the client-submitted
  `quoteItems`, not looked up from a trusted product catalog. `MIN_QUOTE_TOTAL`/`MAX_QUOTE_TOTAL`
  are a sanity guardrail against obviously tampered or garbage values, not a substitute for
  server-side pricing if that becomes a concern later.
