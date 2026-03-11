const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
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

// Gemini API proxy (keeps API key server-side)
app.post('/api/claude', async (req, res) => {
  const { messages } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not set on server' });

  // Combine all message content into a single prompt
  const prompt = messages.map(m => m.content).join('\n');

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2 }
        }),
      }
    );
    const data = await response.json();

    // Normalise response to match the shape the frontend expects
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    res.json({ content: [{ type: 'text', text }] });
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
