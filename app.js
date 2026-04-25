// ── State ──────────────────────────────────────────────────────────
let currentData = null;
let currentSort = 'asc';

const API_BASE = 'http://127.0.0.1:3000';

// ── Suggestions Database ───────────────────────────────────────────
const SUGGESTIONS = [
  "iPhone 15 Pro 256GB Natural Titanium",
  "iPhone 14 128GB Midnight",
  "Samsung Galaxy S24 Ultra 12GB 256GB",
  "Samsung Galaxy S23 FE 128GB",
  "OnePlus 12 16GB 512GB",
  "OnePlus Nord CE 4 128GB",
  "Google Pixel 8 Pro 256GB",
  "Realme GT 6 256GB",
  "Xiaomi 14 Pro 512GB",
  "Sony WH-1000XM5 Wireless Headphones",
  "Sony WF-1000XM5 TWS Earbuds",
  "Apple AirPods Pro 2nd Generation",
  "Apple AirPods 4 ANC",
  "Bose QuietComfort 45 Headphones",
  "JBL Tune 770NC Wireless",
  "MacBook Air M3 13-inch 16GB 512GB",
  "MacBook Pro M3 Pro 14-inch",
  "Dell XPS 15 Intel Core i7 RTX 4060",
  "Asus ROG Strix G16 RTX 4070",
  "HP Spectre x360 14-inch",
  "Lenovo ThinkPad X1 Carbon Gen 12",
  "Apple Watch Series 9 45mm",
  "Apple Watch Ultra 2",
  "Samsung Galaxy Watch 6 Classic 47mm",
  "Garmin Fenix 7 Pro",
  "iPad Pro M4 11-inch 256GB",
  "iPad Air M2 256GB",
  "Samsung Galaxy Tab S9 Ultra 512GB",
  "LG OLED C3 65-inch 4K TV",
  "Sony Bravia XR A95L 65-inch OLED",
  "Canon EOS R6 Mark II Body",
  "Sony Alpha A7 IV Mirrorless",
  "Dyson V15 Detect Vacuum",
  "Dyson Airwrap Complete",
  "PlayStation 5 Slim Disc Edition",
  "Xbox Series X 1TB",
  "Nintendo Switch OLED White",
];


// ── Input Suggestions ─────────────────────────────────────────────
function handleInput() {
  const val = document.getElementById('product-input').value.trim();
  const box = document.getElementById('suggestions-box');
  if (val.length < 2) { box.innerHTML = ''; return; }
  const matches = SUGGESTIONS.filter(s => s.toLowerCase().includes(val.toLowerCase())).slice(0, 5);
  box.innerHTML = matches.map(m =>
    `<div class="suggestion-item" onclick="selectSuggestion('${m.replace(/'/g, "\\'")}')">🔍 ${m}</div>`
  ).join('');
}

function selectSuggestion(val) {
  document.getElementById('product-input').value = val;
  document.getElementById('suggestions-box').innerHTML = '';
}

function handleKey(e) {
  if (e.key === 'Enter') searchProduct();
}

function clearInput() {
  document.getElementById('product-input').value = '';
  document.getElementById('suggestions-box').innerHTML = '';
}


// ── Render Results ─────────────────────────────────────────────────
function renderResults(data) {
  currentData = data;
  const sorted = [...data.results].sort((a, b) => {
    const pa = parsePrice(a.price), pb = parsePrice(b.price);
    return currentSort === 'asc' ? pa - pb : pb - pa;
  });
  const best = sorted[0];

  document.getElementById('product-id-chip').textContent = 'Live Price Results';
  document.getElementById('result-product-name').textContent = data.product_name;

  document.getElementById('meta-row').innerHTML = `
    <span class="meta-badge high">Live Data</span>
    <span class="meta-badge">Source: ${cap(data.identified_from)}</span>
    <span class="meta-badge">${data.results.length} platforms</span>
  `;

  document.getElementById('deal-site').textContent = best.website;
  document.getElementById('deal-price').textContent = best.price;
  document.getElementById('deal-cta').href = best.url;

  const prices = data.results.map(r => parsePrice(r.price));
  const min = Math.min(...prices), max = Math.max(...prices);
  document.getElementById('stat-range').textContent = `₹${min.toLocaleString('en-IN')} – ₹${max.toLocaleString('en-IN')}`;
  document.getElementById('stat-count').textContent = data.results.length + ' found';
  document.getElementById('stat-confidence').textContent = 'Live';
  document.getElementById('stat-source').textContent = cap(data.identified_from);

  const list = document.getElementById('results-list');
  list.innerHTML = sorted.map((r, i) => {
    const isBest = i === 0;
    return `<div class="result-item ${isBest ? 'best' : ''}" style="animation-delay:${i * 80}ms">
      <div class="result-rank ${isBest ? 'gold' : ''}">${isBest ? '🥇' : '#' + (i + 1)}</div>
      <div class="result-logo">${r.icon || '🛒'}</div>
      <div class="result-info">
        <div class="result-site">${r.website}</div>
        <div class="result-url">${r.url}</div>
      </div>
      <div class="result-price ${isBest ? 'best-price' : ''}">${r.price}</div>
      <a class="result-link" href="${r.url}" target="_blank" rel="noopener">View →</a>
    </div>`;
  }).join('');

  document.getElementById('notes-text').textContent = data.notes || '';

  const out = {
    product_name: data.product_name,
    identified_from: data.identified_from,
    results: data.results.map(r => ({ website: r.website, price: r.price, url: r.url })),
    best_deal: { website: best.website, price: best.price, url: best.url },
    price_range: data.price_range,
    notes: data.notes || '',
  };
  document.getElementById('json-pre').textContent = JSON.stringify(out, null, 2);

  document.getElementById('results-inner').classList.remove('hidden');
  document.getElementById('results-section').scrollIntoView({ behavior: 'smooth' });
}

// ── Search ─────────────────────────────────────────────────────────
async function searchProduct() {
  const query = document.getElementById('product-input').value.trim();
  if (!query) { shakeInput(); return; }

  document.getElementById('suggestions-box').innerHTML = '';
  startLoading();

  try {
    const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    stopLoading();

    if (!res.ok) {
      showError('No Results Found', data.error || `Could not find "${query}". Try a more specific name.`);
      return;
    }
    renderResults(data);
  } catch (err) {
    stopLoading();
    showError('Server Not Running', 'Error: ' + err.message + '. Please start the backend: open a terminal in the project folder and run "npm start"');
  }
}



function startLoading() {
  document.getElementById('loading-state').classList.remove('hidden');
  document.getElementById('results-inner').classList.add('hidden');
  document.getElementById('error-state').classList.add('hidden');
}
function stopLoading() {
  document.getElementById('loading-state').classList.add('hidden');
}

function showError(title, msg) {
  document.getElementById('error-title').textContent = title;
  document.getElementById('error-msg').textContent = msg;
  document.getElementById('error-state').classList.remove('hidden');
  document.getElementById('results-section').scrollIntoView({ behavior: 'smooth' });
}

function searchAgain() {
  document.getElementById('results-inner').classList.add('hidden');
  document.getElementById('error-state').classList.add('hidden');
  document.getElementById('product-input').value = '';
  document.getElementById('suggestions-box').innerHTML = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Sort ───────────────────────────────────────────────────────────
function sortResults(dir) {
  currentSort = dir;
  document.getElementById('sort-asc').classList.toggle('active', dir === 'asc');
  document.getElementById('sort-desc').classList.toggle('active', dir === 'desc');
  if (currentData) renderResults(currentData);
}

// ── JSON Toggle ────────────────────────────────────────────────────
function toggleJson() {
  document.getElementById('json-output').classList.toggle('hidden');
}
function copyJson() {
  const text = document.getElementById('json-pre').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copy-json-btn');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  });
}

// ── Helpers ────────────────────────────────────────────────────────
function parsePrice(str) {
  return parseInt(str.replace(/[^\d]/g, '')) || 0;
}
function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}
function shakeInput() {
  const inp = document.querySelector('.input-group');
  inp.style.animation = 'shake 0.4s ease';
  setTimeout(() => { inp.style.animation = ''; }, 500);
}

// ── Shake Animation ────────────────────────────────────────────────
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `@keyframes shake {
  0%,100%{transform:translateX(0)} 20%{transform:translateX(-8px)} 40%{transform:translateX(8px)}
  60%{transform:translateX(-6px)} 80%{transform:translateX(6px)}
}`;
document.head.appendChild(shakeStyle);

// ── Navbar scroll effect ───────────────────────────────────────────
window.addEventListener('scroll', () => {
  const nav = document.querySelector('.navbar');
  nav.style.boxShadow = window.scrollY > 20 ? '0 4px 30px rgba(0,0,0,0.4)' : 'none';
});
