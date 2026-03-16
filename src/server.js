require('dotenv').config();

const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com; font-src https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data: https:;");
  next();
});

app.use(express.static(path.join(__dirname, '../public')));

app.post('/api/shopify', async (req, res) => {
  const { store, token, endpoint, method = 'GET', body } = req.body;
  if (!store || !token || !endpoint) return res.status(400).json({ error: 'Missing store, token, or endpoint' });
  const domain = store.replace(/https?:\/\//, '').replace(/\/$/, '');
  const url = `https://${domain}/admin/api/2024-01/${endpoint}`;
  try {
    const options = { method, headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' } };
    if (body) options.body = JSON.stringify(body);
    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/shopify/graphql', async (req, res) => {
  const { store, token, query, variables } = req.body;
  if (!store || !token || !query) return res.status(400).json({ error: 'Missing store, token, or query' });
  const domain = store.replace(/https?:\/\//, '').replace(/\/$/, '');
  const url = `https://${domain}/admin/api/2024-01/graphql.json`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/shopify/taxonomy', async (req, res) => {
  const { store, token } = req.body;
  console.log('Taxonomy request - store:', store, '| token:', token ? 'present' : 'MISSING');
  if (!store || !token) return res.status(400).json({ error: 'Missing store or token' });
  const domain = store.replace(/https?:\/\//, '').replace(/\/$/, '');
  const url = `https://${domain}/admin/api/2025-10/graphql.json`;
  const query = `
    query getTaxonomy($cursor: String) {
      taxonomy {
        categories(first: 250, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes { id name fullName level isLeaf }
        }
      }
    }
  `;
  try {
    let categories = [];
    let cursor = null;
    let hasNextPage = true;
    let page = 0;
    while (hasNextPage && page < 20) {
      page++;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: cursor ? { cursor } : {} }),
      });
      const data = await response.json();
      if (data.errors) return res.status(400).json({ error: data.errors[0].message });
      const { nodes, pageInfo } = data.data.taxonomy.categories;
      categories = categories.concat(nodes);
      hasNextPage = pageInfo.hasNextPage;
      cursor = pageInfo.endCursor;
    }
    console.log(`Fetched ${categories.length} taxonomy categories`);
    res.json({ categories });
  } catch (err) {
    console.error('Taxonomy fetch error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/claude', async (req, res) => {
  const { messages } = req.body;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY not set on server' });
  const prompt = messages.map(m => m.content).join('\n');
  try {
    console.log('Calling Groq API...');
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], temperature: 0.2 }),
    });
    const data = await response.json();
    console.log('Groq status:', response.status);
    if (!response.ok) return res.status(500).json({ error: data.error?.message || 'Groq API error', details: data });
    const text = data.choices?.[0]?.message?.content || '';
    res.json({ content: [{ type: 'text', text }] });
  } catch (err) {
    console.error('Groq fetch error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/shopify/set-category', async (req, res) => {
  const { store, token, productId, categoryId } = req.body;
  if (!store || !token || !productId || !categoryId) return res.status(400).json({ error: 'Missing required fields' });
  const domain = store.replace(/https?:\/\//, '').replace(/\/$/, '');
  const url = `https://${domain}/admin/api/2025-10/graphql.json`;
  console.log(`Setting category: product=${productId} category=${categoryId}`);
  const mutation = `
    mutation setProductCategory($productId: ID!, $categoryId: ID!) {
      productUpdate(product: {
        id: $productId,
        category: $categoryId
      }) {
        product { id title category { name } }
        userErrors { field message }
      }
    }
  `;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: mutation, variables: { productId, categoryId } }),
    });
    const data = await response.json();
    console.log('Set category response:', JSON.stringify(data).slice(0, 500));
    if (data.errors) return res.status(400).json({ error: data.errors[0].message });
    const userErrors = data.data?.productUpdate?.userErrors;
    if (userErrors?.length > 0) return res.status(400).json({ error: userErrors[0].message, userErrors });
    res.json({ success: true, data });
  } catch (err) {
    console.error('Set category error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Search taxonomy by keyword — returns matching leaf categories
app.post('/api/shopify/search-taxonomy', async (req, res) => {
  const { store, token, query: searchQuery } = req.body;
  if (!store || !token || !searchQuery) return res.status(400).json({ error: 'Missing required fields' });
  const domain = store.replace(/https?:\/\//, '').replace(/\/$/, '');
  const url = `https://${domain}/admin/api/2025-10/graphql.json`;
  const query = `
    query searchTaxonomy($query: String!) {
      taxonomy {
        categories(search: $query, first: 20) {
          nodes { id name fullName level isLeaf }
        }
      }
    }
  `;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { query: searchQuery } }),
    });
    const data = await response.json();
    if (data.errors) return res.status(400).json({ error: data.errors[0].message });
    const categories = data.data?.taxonomy?.categories?.nodes || [];
    // Prefer leaf nodes but include all results
    const sorted = [...categories].sort((a, b) => (b.isLeaf ? 1 : 0) - (a.isLeaf ? 1 : 0));
    res.json({ categories: sorted });
  } catch (err) {
    console.error('Taxonomy search error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Update product fields (title, description, etc.)
app.post('/api/shopify/update-product', async (req, res) => {
  const { store, token, productId, fields } = req.body;
  if (!store || !token || !productId || !fields) return res.status(400).json({ error: 'Missing required fields' });
  const domain = store.replace(/https?:\/\//, '').replace(/\/$/, '');
  const url = `https://${domain}/admin/api/2025-10/graphql.json`;
  const mutation = `
    mutation updateProduct($productId: ID!, $title: String, $descriptionHtml: String) {
      productUpdate(product: {
        id: $productId,
        title: $title,
        descriptionHtml: $descriptionHtml
      }) {
        product { id title descriptionHtml }
        userErrors { field message }
      }
    }
  `;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: mutation, variables: { productId, ...fields } }),
    });
    const data = await response.json();
    if (data.errors) return res.status(400).json({ error: data.errors[0].message });
    const userErrors = data.data?.productUpdate?.userErrors;
    if (userErrors?.length > 0) return res.status(400).json({ error: userErrors[0].message });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update image alt text via productUpdateMedia
app.post('/api/shopify/update-image-alt', async (req, res) => {
  const { store, token, productId, mediaId, altText } = req.body;
  if (!store || !token || !productId || !mediaId || altText === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const domain = store.replace(/https?:\/\//, '').replace(/\/$/, '');
  const url = `https://${domain}/admin/api/2025-10/graphql.json`;
  const mutation = `
    mutation productUpdateMedia($productId: ID!, $media: [UpdateMediaInput!]!) {
      productUpdateMedia(productId: $productId, media: $media) {
        media {
          ... on MediaImage {
            id
            image { src altText }
          }
        }
        mediaUserErrors { field message }
      }
    }
  `;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: mutation, variables: { productId, media: [{ id: mediaId, alt: altText }] } }),
    });
    const data = await response.json();
    if (data.errors) return res.status(400).json({ error: data.errors[0].message });
    const mediaUserErrors = data.data?.productUpdateMedia?.mediaUserErrors;
    if (mediaUserErrors?.length > 0) return res.status(400).json({ error: mediaUserErrors[0].message });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });