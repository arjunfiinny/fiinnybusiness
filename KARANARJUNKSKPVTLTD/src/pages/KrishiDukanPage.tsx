/**
 * KrishiDukan ERP Module — injected into Fiinny ERP at /krishidukan
 *
 * Flow:
 *   1. ABC retailer opens this page inside Fiinny ERP
 *   2. They see their current ERP inventory
 *   3. They click "Publish to KrishiDukan" → stock pushed to sync-server
 *   4. Customers on KrishiDukan see this retailer on the map with live stock
 *
 * When KaranArjun (dealer) records a sale to this retailer via the admin panel,
 * this retailer also gets auto-created on KrishiDukan with that stock.
 */

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, Wifi, WifiOff, RefreshCw, Upload, Store, Package, AlertCircle, ExternalLink, Zap } from 'lucide-react';

const SYNC_API = 'http://localhost:3999';

// ── Demo ERP inventory ────────────────────────────────────────────────────────
// In production: replace with real query from Fiinny billing database
const DEMO_ERP_INVENTORY = [
  { productId: 'kapl-gold',    name: '⚡ PowerPlus Gold',    quantity: 45, price: 320, mrp: 350 },
  { productId: 'kapl-shield',  name: '⚡ PowerPlus Shield',  quantity: 22, price: 440, mrp: 500 },
  { productId: 'kapl-boost',   name: '⚡ PowerPlus Boost',   quantity: 0,  price: 270, mrp: 320 },
  { productId: 'kapl-rootmax', name: '⚡ PowerPlus RootMax', quantity: 15, price: 375, mrp: 420 },
];

// ── Demo shop config ──────────────────────────────────────────────────────────
// In production: loaded from Firestore tenants/{tenantId}/settings/krishidukan
const DEMO_SHOP = {
  retailerId: 'erp-demo-retailer',
  businessName: 'Fiinny Demo Agro Store',
  ownerName: 'Demo Owner',
  phone: '+919900000099',
  city: 'Pune',
  state: 'Maharashtra',
  pincode: '411001',
  addressLine: 'Demo Nagar, Pune',
  lat: 18.5248,
  lng: 73.8571,
};

interface SyncResult { ok: boolean; synced?: number; error?: string; }
interface ListingStatus { listed: boolean; liveStockCount: number; erpLinked: boolean; }

export default function KrishiDukanPage() {
  const [status, setStatus] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<SyncResult | null>(null);
  const [listing, setListing] = useState<ListingStatus | null>(null);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [inventory, setInventory] = useState(DEMO_ERP_INVENTORY);
  const [selected, setSelected] = useState<Set<string>>(new Set(DEMO_ERP_INVENTORY.map((i) => i.productId)));
  const [resolvedRetailerId, setResolvedRetailerId] = useState(DEMO_SHOP.retailerId);

  const checkListing = useCallback(async () => {
    try {
      const res = await fetch(`${SYNC_API}/retailers/${resolvedRetailerId}`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const data = await res.json();
        setListing({ listed: true, liveStockCount: data.stock?.length ?? 0, erpLinked: !!data.erpLinked });
        setServerOnline(true);
      } else if (res.status === 404) {
        setListing({ listed: false, liveStockCount: 0, erpLinked: false });
        setServerOnline(true);
      }
    } catch {
      setServerOnline(false);
      setListing(null);
    }
  }, [resolvedRetailerId]);

  useEffect(() => { checkListing(); }, [checkListing]);

  function toggle(id: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function publish() {
    setStatus('syncing');
    const items = inventory
      .filter((i) => selected.has(i.productId))
      .map(({ productId, quantity, price, mrp }) => ({ productId, quantity, price, mrp }));

    try {
      let retailerId = resolvedRetailerId;

      // First time: register the retailer via the dealer sale endpoint
      if (!listing?.listed) {
        const regRes = await fetch(`${SYNC_API}/sales`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ retailer: DEMO_SHOP, items }),
        });
        const regData = await regRes.json();
        retailerId = regData.retailer?.id ?? retailerId;
        setResolvedRetailerId(retailerId);
      }

      // Push ERP inventory
      const syncRes = await fetch(`${SYNC_API}/erp-sync/${retailerId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, apiKey: 'erp-demo-key' }),
      });
      if (!syncRes.ok) throw new Error(await syncRes.text());

      setResult({ ok: true, synced: items.length });
      setStatus('done');
      await checkListing();
    } catch (e) {
      setResult({ ok: false, error: String(e) });
      setStatus('error');
    }
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, padding: '16px 20px', background: 'linear-gradient(135deg, #16a34a, #15803d)', borderRadius: 14 }}>
        <div style={{ fontSize: 30 }}>⚡</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px' }}>KrishiDukan</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>Publish inventory · Reach customers instantly</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: serverOnline === null ? 'rgba(255,255,255,0.5)' : serverOnline ? '#86efac' : '#fca5a5' }}>
          {serverOnline ? <Wifi size={13} /> : <WifiOff size={13} />}
          {serverOnline === null ? 'Checking…' : serverOnline ? 'Connected' : 'Offline'}
        </div>
      </div>

      {/* Listing status */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 16, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Store size={15} style={{ color: '#16a34a' }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>KrishiDukan Listing Status</span>
          </div>
          <button onClick={checkListing} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}><RefreshCw size={13} /></button>
        </div>
        {listing === null ? (
          <p style={{ fontSize: 13, color: '#9ca3af' }}>Checking…</p>
        ) : listing.listed ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <CheckCircle size={15} style={{ color: '#16a34a' }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: '#15803d' }}>Live on KrishiDukan</span>
              {listing.erpLinked && <span style={{ fontSize: 11, color: '#7c3aed', background: '#ede9fe', border: '1px solid #c4b5fd', borderRadius: 8, padding: '1px 7px', fontWeight: 600 }}>ERP Synced</span>}
            </div>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>{listing.liveStockCount} products visible to customers</p>
            <a href="http://localhost:5175" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#16a34a', fontWeight: 600, textDecoration: 'none' }}>
              <ExternalLink size={12} /> View on KrishiDukan →
            </a>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#92400e' }}>
            <AlertCircle size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />
            {serverOnline ? 'Not yet listed. Publish your inventory below to go live.' : 'Sync server offline — contact your KrishiDukan admin.'}
          </div>
        )}
      </div>

      {/* Inventory */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 16, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Package size={15} style={{ color: '#16a34a' }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Your Inventory</span>
          </div>
          <span style={{ fontSize: 12, color: '#6b7280' }}>{selected.size}/{inventory.length} selected</span>
        </div>
        {inventory.map((item) => (
          <div
            key={item.productId}
            onClick={() => toggle(item.productId)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, border: `1px solid ${selected.has(item.productId) ? '#bbf7d0' : '#e5e7eb'}`, background: selected.has(item.productId) ? '#f0fdf4' : '#f9fafb', cursor: 'pointer', marginBottom: 8 }}
          >
            <div style={{ width: 18, height: 18, borderRadius: 4, background: selected.has(item.productId) ? '#16a34a' : '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {selected.has(item.productId) && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{item.name}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: item.quantity > 0 ? '#16a34a' : '#dc2626' }}>
                {item.quantity > 0 ? `${item.quantity} units in stock` : 'Out of stock'}
              </div>
            </div>
            <div style={{ textAlign: 'right', marginRight: 8, flexShrink: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#16a34a' }}>₹{item.price}</div>
              <div style={{ fontSize: 11, color: '#9ca3af', textDecoration: 'line-through' }}>₹{item.mrp}</div>
            </div>
            {/* Editable quantity */}
            <input
              type="number" min={0} value={item.quantity}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setInventory((prev) => prev.map((i) => i.productId === item.productId ? { ...i, quantity: Math.max(0, +e.target.value) } : i))}
              style={{ width: 58, padding: '5px 6px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, textAlign: 'center', flexShrink: 0 }}
            />
          </div>
        ))}
      </div>

      {/* Publish */}
      <button
        onClick={publish}
        disabled={status === 'syncing' || !serverOnline || selected.size === 0}
        style={{ width: '100%', padding: '14px', background: status === 'syncing' ? '#9ca3af' : '#16a34a', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: status === 'syncing' ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 12 }}
      >
        {status === 'syncing'
          ? <><RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Publishing…</>
          : <><Upload size={16} /> Publish {selected.size} Product{selected.size !== 1 ? 's' : ''} to KrishiDukan</>}
      </button>

      {result && (
        <div style={{ padding: '12px 16px', background: result.ok ? '#f0fdf4' : '#fef2f2', border: `1px solid ${result.ok ? '#bbf7d0' : '#fecaca'}`, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, marginBottom: 14 }}>
          {result.ok
            ? <><CheckCircle size={14} style={{ color: '#16a34a' }} /><span style={{ color: '#15803d', fontWeight: 600 }}>✓ {result.synced} products are now live on KrishiDukan!</span></>
            : <><AlertCircle size={14} style={{ color: '#dc2626' }} /><span style={{ color: '#dc2626' }}>Error: {result.error}</span></>}
        </div>
      )}

      {/* Info */}
      <div style={{ padding: '14px 16px', background: '#f0fdf4', borderRadius: 12, border: '1px solid #bbf7d0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#15803d', marginBottom: 8 }}>
          <Zap size={14} /> How real-time sync works
        </div>
        <ol style={{ fontSize: 12, color: '#166534', lineHeight: 1.9, paddingLeft: 16, margin: 0 }}>
          <li>When KaranArjun sells to you → your store is auto-created on KrishiDukan</li>
          <li>Edit quantities above → click Publish → live on the map in seconds</li>
          <li>Customers near you can see your shop, call you, or get directions</li>
          <li>Upgrade subscription to list your own additional products</li>
        </ol>
      </div>
    </div>
  );
}
