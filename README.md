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
  "quoteItems": "1x Widget\n2x Gadget\nEstimated total: $103,577",
  "pageUrl": "https://yoursite.com/quote"
}
```

The dollar amount is parsed from a line in `quoteItems` formatted as `Estimated total: $103,577`.
`name` and `email` are required, and `quoteItems` must contain a valid total line.

Response:

```json
{
  "checkoutUrl": "https://checkout.stripe.com/...",
  "sessionId": "cs_test_..."
}
```

## Webflow frontend

`public/webflow-checkout.js` is a drop-in script for the Webflow form page. Before pasting it in:

1. Set `API_BASE_URL` at the top of the file to your deployed API's URL.
2. Make sure the form has `id="quote-form"` and fields named `name`, `email`, `phone`,
   `zipCode`, `message`, `quoteItems` (matching the request body above).
3. Optionally add `<div id="quote-form-error"></div>` near the form to show error messages.

The script prevents the default form submit, disables the submit button while the request is in
flight, and redirects the browser to `checkoutUrl` on success.

## Notes

- HubSpot integration and Stripe webhooks are intentionally not included yet — planned for a
  follow-up pass.
- Currency is fixed to USD to match the `$` formatting in `quoteItems`.
- The quote total is parsed from client-submitted text, not recomputed from a trusted price
  catalog. `MIN_QUOTE_TOTAL`/`MAX_QUOTE_TOTAL` are a sanity guardrail against obviously tampered
  or garbage values, not a substitute for server-side pricing if that becomes a concern later.
