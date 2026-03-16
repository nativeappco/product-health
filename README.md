# Shopify Product Data Health

A browser-based dashboard for auditing Shopify product data quality and UCP readiness.

## What it checks

- Products with no images / only 1 image
- Missing Shopify native category
- Vague or short product titles
- Missing, short, or ambiguous descriptions
- Unclear variant option values
- Missing SKUs across variants
- Zero-price variants

## Running locally

```bash
npm install
npm start
```

Then open http://localhost:3000

## Deploying to Render

1. Push this repo to GitHub
2. Go to render.com → New → Web Service
3. Connect your GitHub repo
4. Set:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Environment:** Node
5. Deploy

No environment variables required.

## Connecting a store

You need a Shopify Admin API token with **read_products** permission.

To create one:
1. Go to your Shopify Admin → Settings → Apps and sales channels → Develop apps
2. Create a new app
3. Under Configuration, enable: `read_products`, `read_product_listings`
4. Install the app and copy the Admin API access token

## Adding stores

The store switcher in the top right lets you connect multiple stores in one session. Each audit runs fresh — nothing is stored server-side.
