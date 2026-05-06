/**
 * KrishiDukan Sync Server — port 3999
 *
 * In-memory store that makes the demo work end-to-end:
 *   Admin records a sale  →  POST /sales
 *   Customer-web reads    →  GET /retailers  (includes dealer + all recorded sales)
 *   ERP pushes inventory  →  POST /erp-sync/:retailerId
 *
 * Replace with the real NestJS backend (services/api) when deploying.
 */

const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ── Seed data ─────────────────────────────────────────────────────────────────
// KaranArjun Krushi Seva Kendra is both the DEALER and a direct retailer.
const SEED_RETAILERS = [
  {
    id: 'kapl-direct',
    businessName: 'KaranArjun Krushi Seva Kendra',
    ownerName: 'KaranArjun Team',
    phone: '+919800000001',
    whatsapp: '+919800000001',
    addressLine: 'Dealer HQ, Agri Complex',
    city: 'Pune',
    state: 'Maharashtra',
    pincode: '411001',
    lat: 18.5204,
    lng: 73.8567,
    rating: 4.9,
    totalRatings: 512,
    openHours: 'Mon–Sat: 9 AM – 6 PM',
    type: 'dealer',       // dealer | retailer | erp_retailer
    erpLinked: false,
    createdAt: new Date().toISOString(),
  },
];

const SEED_PRODUCTS = [
  { id: 'kapl-gold',    name: 'PowerPlus Gold',   brandId: 'kapl', emoji: '🌟', imageColor: '#f59e0b', categoryLabel: 'Premium Fertilizer' },
  { id: 'kapl-shield',  name: 'PowerPlus Shield', brandId: 'kapl', emoji: '🛡️', imageColor: '#0ea5e9', categoryLabel: 'Fungicide + Bactericide' },
  { id: 'kapl-boost',   name: 'PowerPlus Boost',  brandId: 'kapl', emoji: '🚀', imageColor: '#8b5cf6', categoryLabel: 'Bio-Stimulant' },
  { id: 'kapl-rootmax', name: 'PowerPlus RootMax', brandId: 'kapl', emoji: '🌿', imageColor: '#16a34a', categoryLabel: 'Root Developer' },
];

// Dealer stocks everything
const SEED_STOCK = SEED_PRODUCTS.map((p, i) => ({
  retailerId: 'kapl-direct',
  productId: p.id,
  price: [320, 450, 280, 380][i],
  mrp:   [350, 500, 320, 420][i],
  inStock: true,
  quantity: 200,
  source: 'dealer',
}));

// ── In-memory store ───────────────────────────────────────────────────────────
let retailers = [...SEED_RETAILERS];
let stock = [...SEED_STOCK];
let sales = [];

// ── Helper ────────────────────────────────────────────────────────────────────
function findOrCreateRetailer(data) {
  // Deduplicate by phone
  let existing = retailers.find((r) => r.phone === data.phone);
  if (!existing) {
    existing = {
      id: `retailer-${Date.now()}`,
      businessName: data.businessName,
      ownerName: data.ownerName || 'Shop Owner',
      phone: data.phone,
      whatsapp: data.whatsapp || null,
      addressLine: data.addressLine || '',
      city: data.city || '',
      state: data.state || 'Maharashtra',
      pincode: data.pincode || '',
      lat: parseFloat(data.lat) || 18.5204,
      lng: parseFloat(data.lng) || 73.8567,
      rating: 4.0,
      totalRatings: 0,
      openHours: 'Mon–Sat: 9 AM – 7 PM',
      type: 'retailer',
      erpLinked: false,
      createdAt: new Date().toISOString(),
    };
    retailers.push(existing);
    console.log(`[sync] New retailer created: ${existing.businessName} (${existing.id})`);
  }
  return existing;
}

function upsertStock(retailerId, productId, price, mrp, quantity, source = 'sale') {
  const idx = stock.findIndex((s) => s.retailerId === retailerId && s.productId === productId);
  if (idx >= 0) {
    stock[idx] = { ...stock[idx], price, mrp, quantity, inStock: quantity > 0, source };
  } else {
    stock.push({ retailerId, productId, price, mrp, quantity, inStock: quantity > 0, source });
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Health check
app.get('/health', (_req, res) => res.json({ ok: true, retailers: retailers.length, stockLines: stock.length }));

// Get all products
app.get('/products', (_req, res) => res.json(SEED_PRODUCTS));

// Get all retailers + their stock
app.get('/retailers', (_req, res) => {
  const result = retailers.map((r) => ({
    ...r,
    stock: stock.filter((s) => s.retailerId === r.id),
  }));
  res.json(result);
});

// Get single retailer
app.get('/retailers/:id', (req, res) => {
  const r = retailers.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Not found' });
  res.json({ ...r, stock: stock.filter((s) => s.retailerId === r.id) });
});

// Get stock for a specific product (for customer-web product page)
app.get('/product-stock/:productId', (req, res) => {
  const lines = stock.filter((s) => s.productId === req.params.productId);
  const result = lines.map((s) => {
    const retailer = retailers.find((r) => r.id === s.retailerId);
    return retailer ? { retailer, stock: s } : null;
  }).filter(Boolean);
  res.json(result);
});

// DEALER records a sale to a retailer  ← core flow
app.post('/sales', (req, res) => {
  const { retailer: retailerData, items, dealerNotes } = req.body;
  // items: [{ productId, quantity, price, mrp }]

  if (!retailerData || !items?.length) {
    return res.status(400).json({ error: 'retailer and items required' });
  }

  const retailer = findOrCreateRetailer(retailerData);

  items.forEach(({ productId, quantity, price, mrp }) => {
    upsertStock(retailer.id, productId, price, mrp, quantity, 'sale');
  });

  const sale = {
    id: `sale-${Date.now()}`,
    retailerId: retailer.id,
    retailerName: retailer.businessName,
    items,
    dealerNotes: dealerNotes || '',
    createdAt: new Date().toISOString(),
  };
  sales.push(sale);

  console.log(`[sync] Sale recorded: ${items.length} product(s) → ${retailer.businessName}`);
  res.json({ sale, retailer });
});

// Get all sales (admin view)
app.get('/sales', (_req, res) => res.json(sales));

// ERP bulk sync  ← Fiinny ERP integration
app.post('/erp-sync/:retailerId', (req, res) => {
  const { items, apiKey } = req.body;
  // In production: validate apiKey against bcrypt hash. Here we trust it.
  const retailer = retailers.find((r) => r.id === req.params.retailerId);
  if (!retailer) return res.status(404).json({ error: 'Retailer not found' });

  if (!items?.length) return res.status(400).json({ error: 'items required' });

  items.forEach(({ productId, quantity, price, mrp }) => {
    upsertStock(retailer.id, productId, price ?? 0, mrp ?? 0, quantity, 'erp');
  });

  // Mark retailer as ERP-linked
  retailer.erpLinked = true;

  console.log(`[sync] ERP sync: ${items.length} item(s) from ${retailer.businessName}`);
  res.json({ ok: true, synced: items.length, retailerId: retailer.id });
});

// Admin: update retailer
app.patch('/retailers/:id', (req, res) => {
  const idx = retailers.findIndex((r) => r.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Not found' });
  retailers[idx] = { ...retailers[idx], ...req.body };
  res.json(retailers[idx]);
});

// Reset to seed (dev helper)
app.post('/reset', (_req, res) => {
  retailers = [...SEED_RETAILERS];
  stock = [...SEED_STOCK];
  sales = [];
  console.log('[sync] Store reset to seed data');
  res.json({ ok: true });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = 3999;
app.listen(PORT, () => {
  console.log(`\n🌾 KrishiDukan Sync Server running on http://localhost:${PORT}`);
  console.log(`   Retailers: ${retailers.length} (seeded)`);
  console.log(`   Products:  ${SEED_PRODUCTS.length}`);
  console.log(`   POST /sales         — dealer records a sale → retailer auto-created`);
  console.log(`   POST /erp-sync/:id  — Fiinny ERP pushes inventory`);
  console.log(`   GET  /product-stock/:id — customer-web fetches live stock\n`);
});
