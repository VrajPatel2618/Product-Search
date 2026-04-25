const express = require('express');
const axios = require('axios');
const axiosRetry = require('axios-retry').default;
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ── Axios with retry ───────────────────────────────────────────────
const http = axios.create({ timeout: 12000 });
axiosRetry(http, { retries: 2, retryDelay: axiosRetry.exponentialDelay });

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'en-IN,en;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
};

// ── Helpers ────────────────────────────────────────────────────────
function cleanPrice(raw) {
  if (!raw) return null;
  const match = raw.replace(/,/g, '').match(/[\d]+/);
  return match ? '₹' + parseInt(match[0]).toLocaleString('en-IN') : null;
}

function slug(q) {
  return encodeURIComponent(q.trim());
}

// ── Scrapers ───────────────────────────────────────────────────────

async function scrapeAmazon(query) {
  try {
    const url = `https://www.amazon.in/s?k=${slug(query)}`;
    const { data } = await http.get(url, { headers: HEADERS });
    const $ = cheerio.load(data);
    const item = $('[data-component-type="s-search-result"]').first();
    const title = item.find('h2 span').first().text().trim();
    const priceWhole = item.find('.a-price-whole').first().text().trim();
    const price = cleanPrice(priceWhole);
    const asin = item.attr('data-asin');
    if (!price) return null;
    return {
      website: 'Amazon India',
      price,
      url: asin ? `https://www.amazon.in/dp/${asin}` : url,
      icon: '🛒',
      title,
    };
  } catch { return null; }
}

async function scrapeFlipkart(query) {
  try {
    const url = `https://www.flipkart.com/search?q=${slug(query)}`;
    const { data } = await http.get(url, { headers: HEADERS });
    const $ = cheerio.load(data);
    // Flipkart uses multiple possible selectors
    const priceSelectors = ['._30jeq3', '._1_WHN1', '.Nx9bqj'];
    const titleSelectors = ['._4rR01T', '.s1Q9rs', '.IRpwTa', 'a.WKTcLC'];
    const linkSelectors = ['a._1fQZEK', 'a.s1Q9rs', 'a.WKTcLC', 'a._2rpwqI'];

    let price = null, title = '', link = url;
    for (const sel of priceSelectors) {
      const raw = $(sel).first().text().trim();
      price = cleanPrice(raw);
      if (price) break;
    }
    for (const sel of titleSelectors) {
      title = $(sel).first().text().trim();
      if (title) break;
    }
    for (const sel of linkSelectors) {
      const href = $(sel).first().attr('href');
      if (href) { link = 'https://www.flipkart.com' + href; break; }
    }
    if (!price) return null;
    return { website: 'Flipkart', price, url: link, icon: '🛍️', title };
  } catch { return null; }
}

async function scrapeCroma(query) {
  try {
    const url = `https://www.croma.com/search/?q=${slug(query)}`;
    const { data } = await http.get(url, { headers: HEADERS });
    const $ = cheerio.load(data);
    const priceRaw = $('.amount').first().text().trim() ||
                     $('[class*="price"]').first().text().trim();
    const price = cleanPrice(priceRaw);
    const title = $('h3.product-title').first().text().trim() ||
                  $('[class*="product-title"]').first().text().trim();
    const href = $('a.product-title').first().attr('href') ||
                 $('[class*="product-title"] a').first().attr('href');
    if (!price) return null;
    return {
      website: 'Croma',
      price,
      url: href ? `https://www.croma.com${href}` : url,
      icon: '📦',
      title,
    };
  } catch { return null; }
}

async function scrapeRelianceDigital(query) {
  try {
    const url = `https://www.reliancedigital.in/search?q=${slug(query)}`;
    const { data } = await http.get(url, { headers: HEADERS });
    const $ = cheerio.load(data);
    const priceRaw = $('span.pdp__offerPrice').first().text().trim() ||
                     $('[class*="price"]').first().text().trim();
    const price = cleanPrice(priceRaw);
    const title = $('p.pdp__title').first().text().trim() ||
                  $('[class*="title"]').first().text().trim();
    if (!price) return null;
    return { website: 'Reliance Digital', price, url, icon: '🔌', title };
  } catch { return null; }
}

async function scrapeVijaysSales(query) {
  try {
    const url = `https://www.vijaysales.com/search/${slug(query)}`;
    const { data } = await http.get(url, { headers: HEADERS });
    const $ = cheerio.load(data);
    const priceRaw = $('[class*="price"]').first().text().trim();
    const price = cleanPrice(priceRaw);
    const title = $('[class*="product-name"], [class*="title"]').first().text().trim();
    if (!price) return null;
    return { website: 'Vijay Sales', price, url, icon: '💻', title };
  } catch { return null; }
}

async function scrapeTataCliq(query) {
  try {
    const url = `https://www.tatacliq.com/search/?searchCategory=all&text=${slug(query)}`;
    const { data } = await http.get(url, { headers: HEADERS });
    const $ = cheerio.load(data);
    const priceRaw = $('[class*="ProductModule__price"], [class*="price"]').first().text().trim();
    const price = cleanPrice(priceRaw);
    const title = $('[class*="ProductModule__title"], [class*="product-title"]').first().text().trim();
    if (!price) return null;
    return { website: 'Tata Cliq', price, url, icon: '🏪', title };
  } catch { return null; }
}

// ── Main Search Route ──────────────────────────────────────────────
app.get('/api/search', async (req, res) => {
  const query = (req.query.q || '').trim();
  if (!query) return res.status(400).json({ error: 'Query is required' });

  // Run all scrapers in parallel
  const [amazon, flipkart, croma, reliance, vijay, tatacliq] = await Promise.all([
    scrapeAmazon(query),
    scrapeFlipkart(query),
    scrapeCroma(query),
    scrapeRelianceDigital(query),
    scrapeVijaysSales(query),
    scrapeTataCliq(query),
  ]);

  const results = [amazon, flipkart, croma, reliance, vijay, tatacliq].filter(Boolean);

  if (results.length === 0) {
    return res.status(404).json({ error: 'No results found. Try a more specific product name.' });
  }

  // Determine best title from Amazon or Flipkart
  const productName = (amazon?.title || flipkart?.title || results[0]?.title || query)
    .replace(/\s+/g, ' ').trim().slice(0, 120);

  // Sort by price ascending
  results.sort((a, b) => {
    const pa = parseInt(a.price.replace(/[^\d]/g, ''));
    const pb = parseInt(b.price.replace(/[^\d]/g, ''));
    return pa - pb;
  });

  const prices = results.map(r => parseInt(r.price.replace(/[^\d]/g, '')));
  const min = Math.min(...prices), max = Math.max(...prices);

  res.json({
    product_name: productName,
    query,
    confidence: 'live',
    identified_from: 'search',
    results,
    best_deal: results[0],
    price_range: `₹${min.toLocaleString('en-IN')} – ₹${max.toLocaleString('en-IN')}`,
    notes: `Live prices fetched from ${results.length} platform(s). Prices include all applicable taxes. Verify on seller site before purchase.`,
  });
});

// ── Health check ───────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

const PORT = 3000;
app.listen(PORT, '127.0.0.1', () => console.log(`✅ PriceScope backend running at http://127.0.0.1:${PORT}`));
