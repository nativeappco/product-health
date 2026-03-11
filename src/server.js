const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com; font-src https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data: https:;");
  next();
});
app.use(express.static(path.join(__dirname, '../public')));

// Proxy endpoint for Shopify Admin API
app.post('/api/shopify', async (req, res) => {
  const { store, token, endpoint, method = 'GET', body } = req.body;

  if (!store || !token || !endpoint) {
    return res.status(400).json({ error: 'Missing store, token, or endpoint' });
  }

  // Clean store domain
  const domain = store.replace(/https?:\/\//, '').replace(/\/$/, '');
  const url = `https://${domain}/admin/api/2024-01/${endpoint}`;

  try {
    const options = {
      method,
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
    };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GraphQL proxy endpoint
app.post('/api/shopify/graphql', async (req, res) => {
  const { store, token, query, variables } = req.body;

  if (!store || !token || !query) {
    return res.status(400).json({ error: 'Missing store, token, or query' });
  }

  const domain = store.replace(/https?:\/\//, '').replace(/\/$/, '');
  const url = `https://${domain}/admin/api/2024-01/graphql.json`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Anthropic API proxy (keeps API key server-side)
app.post('/api/claude', async (req, res) => {
  const { messages, system } = req.body;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set on server' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system,
        messages,
      }),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Shopify product category via GraphQL mutation
app.post('/api/shopify/set-category', async (req, res) => {
  const { store, token, productId, categoryId } = req.body;
  if (!store || !token || !productId || !categoryId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const domain = store.replace(/https?:\/\//, '').replace(/\/$/, '');
  const url = `https://${domain}/admin/api/2024-01/graphql.json`;

  const mutation = `
    mutation updateProductCategory($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id category { name } }
        userErrors { field message }
      }
    }
  `;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: mutation,
        variables: { input: { id: productId, category: { id: categoryId } } },
      }),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
