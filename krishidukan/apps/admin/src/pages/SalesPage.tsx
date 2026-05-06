/**
 * Dealer Sales Page
 * KaranArjun Krushi Seva Kendra records a sale to a retailer.
 * This creates/updates the retailer on KrishiDukan + sets their stock.
 */
import { useState, useEffect } from 'react';
import { Plus, Package, MapPin, Phone, CheckCircle, Loader, Store, Trash2 } from 'lucide-react';

const API = 'http://localhost:3999';

interface Product { id: string; name: string; emoji: string; imageColor: string; }
interface SaleItem { productId: string; quantity: number; price: number; mrp: number; }
interface Sale { id: string; retailerName: string; items: SaleItem[]; createdAt: string; }

const EMPTY_RETAILER = { businessName: '', ownerName: '', phone: '', whatsapp: '', addressLine: '', city: '', state: 'Maharashtra', pincode: '', lat: '', lng: '' };

export function SalesPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');

  // Form state
  const [retailer, setRetailer] = useState({ ...EMPTY_RETAILER });
  const [items, setItems] = useState<SaleItem[]>([]);
  const [dealerNotes, setDealerNotes] = useState('');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([
        fetch(`${API}/products`).then((r) => r.json()),
        fetch(`${API}/sales`).then((r) => r.json()),
      ]);
      setProducts(p);
      setSales(s.reverse());
    } catch { /* sync-server not running — show empty state */ }
    setLoading(false);
  }

  function addItem() {
    if (!products.length) return;
    setItems((prev) => [...prev, { productId: products[0]!.id, quantity: 10, price: 0, mrp: 0 }]);
  }

  function removeItem(i: number) { setItems((prev) => prev.filter((_, idx) => idx !== i)); }
  function updateItem(i: number, patch: Partial<SaleItem>) { setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it)); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!retailer.businessName || !retailer.phone || !items.length) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retailer, items: items.map((it) => ({ ...it, quantity: Number(it.quantity), price: Number(it.price), mrp: Number(it.mrp) })), dealerNotes }),
      });
      const data = await res.json();
      setSuccess(`✓ Sale recorded! ${data.retailer.businessName} is now live on KrishiDukan.`);
      setShowForm(false);
      setRetailer({ ...EMPTY_RETAILER });
      setItems([]);
      setDealerNotes('');
      await loadData();
      setTimeout(() => setSuccess(''), 5000);
    } catch {
      alert('Could not reach sync-server. Is it running on port 3999?');
    }
    setSaving(false);
  }

  return (
    <div style={{ padding: 28, maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>Dealer Sales</h1>
          <p style={{ fontSize: 14, color: '#64748b' }}>
            Record a sale to a retailer → they instantly appear on KrishiDukan with correct stock.
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
        >
          <Plus size={16} /> Record Sale
        </button>
      </div>

      {success && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#052e16', border: '1px solid #16a34a', borderRadius: 10, marginBottom: 20, color: '#4ade80', fontSize: 14 }}>
          <CheckCircle size={16} /> {success}
        </div>
      )}

      {/* Sale form modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <form
            onSubmit={submit}
            style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 14, padding: 24, width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' }}
          >
            <h2 style={{ fontSize: 17, fontWeight: 700, color: '#f1f5f9', marginBottom: 18 }}>Record Sale to Retailer</h2>

            {/* Retailer info */}
            <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 10, padding: 16, marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Store size={15} style={{ color: '#22c55e' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>RETAILER DETAILS</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {([
                  { key: 'businessName', label: 'Shop Name *', placeholder: 'ABC Agro Store' },
                  { key: 'ownerName', label: 'Owner Name', placeholder: 'Rajesh Kumar' },
                  { key: 'phone', label: 'Phone *', placeholder: '+919876543210' },
                  { key: 'whatsapp', label: 'WhatsApp', placeholder: '+919876543210' },
                  { key: 'city', label: 'City', placeholder: 'Nashik' },
                  { key: 'pincode', label: 'Pincode', placeholder: '422001' },
                ] as { key: keyof typeof EMPTY_RETAILER; label: string; placeholder: string }[]).map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>{label}</label>
                    <input
                      value={retailer[key]}
                      onChange={(e) => setRetailer((r) => ({ ...r, [key]: e.target.value }))}
                      placeholder={placeholder}
                      style={{ width: '100%', padding: '8px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', fontSize: 13, boxSizing: 'border-box' }}
                    />
                  </div>
                ))}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>Address</label>
                  <input value={retailer.addressLine} onChange={(e) => setRetailer((r) => ({ ...r, addressLine: e.target.value }))} placeholder="Plot 12, Main Market Road" style={{ width: '100%', padding: '8px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>Latitude (for map)</label>
                  <input value={retailer.lat} onChange={(e) => setRetailer((r) => ({ ...r, lat: e.target.value }))} placeholder="19.9975" style={{ width: '100%', padding: '8px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>Longitude (for map)</label>
                  <input value={retailer.lng} onChange={(e) => setRetailer((r) => ({ ...r, lng: e.target.value }))} placeholder="73.7898" style={{ width: '100%', padding: '8px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              </div>
            </div>

            {/* Items sold */}
            <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 10, padding: 16, marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Package size={15} style={{ color: '#22c55e' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>PRODUCTS SOLD *</span>
                </div>
                <button type="button" onClick={addItem} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#22c55e', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  <Plus size={12} /> Add product
                </button>
              </div>
              {items.length === 0 && (
                <p style={{ fontSize: 13, color: '#475569', textAlign: 'center', padding: '16px 0' }}>No products added yet. Click "Add product".</p>
              )}
              {items.map((item, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 32px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <select
                    value={item.productId}
                    onChange={(e) => updateItem(i, { productId: e.target.value })}
                    style={{ padding: '7px 8px', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', fontSize: 13 }}
                  >
                    {products.map((p) => <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}
                  </select>
                  <input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(i, { quantity: +e.target.value })} placeholder="Qty" style={{ padding: '7px 8px', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', fontSize: 13, textAlign: 'center' }} />
                  <input type="number" min={0} value={item.price || ''} onChange={(e) => updateItem(i, { price: +e.target.value })} placeholder="Price" style={{ padding: '7px 8px', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', fontSize: 13, textAlign: 'center' }} />
                  <input type="number" min={0} value={item.mrp || ''} onChange={(e) => updateItem(i, { mrp: +e.target.value })} placeholder="MRP" style={{ padding: '7px 8px', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', fontSize: 13, textAlign: 'center' }} />
                  <button type="button" onClick={() => removeItem(i)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}><Trash2 size={14} /></button>
                </div>
              ))}
              {items.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 32px', gap: 8, fontSize: 10, color: '#475569', paddingLeft: 4 }}>
                  <span>Product</span><span style={{ textAlign: 'center' }}>Qty</span><span style={{ textAlign: 'center' }}>Price ₹</span><span style={{ textAlign: 'center' }}>MRP ₹</span><span />
                </div>
              )}
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>Notes (optional)</label>
              <textarea value={dealerNotes} onChange={(e) => setDealerNotes(e.target.value)} placeholder="e.g. Credit sale, 30-day payment terms" rows={2} style={{ width: '100%', padding: '8px 10px', background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => setShowForm(false)} style={{ flex: 1, padding: '10px', background: '#334155', color: '#94a3b8', border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
              <button type="submit" disabled={saving || !retailer.businessName || !retailer.phone || items.length === 0} style={{ flex: 2, padding: '10px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {saving ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : '✓ Record Sale & Publish to KrishiDukan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Sales history */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#475569' }}>Loading…</div>
      ) : sales.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#1e293b', borderRadius: 12, border: '1px solid #334155' }}>
          <Package size={40} style={{ color: '#334155', margin: '0 auto 12px', display: 'block' }} />
          <p style={{ color: '#64748b', fontSize: 15, marginBottom: 6 }}>No sales recorded yet</p>
          <p style={{ color: '#475569', fontSize: 13 }}>When you record a sale, the retailer will appear on KrishiDukan.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sales.map((sale) => (
            <div key={sale.id} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <Store size={14} style={{ color: '#22c55e' }} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>{sale.retailerName}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#475569' }}>{new Date(sale.createdAt).toLocaleString()}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#22c55e', background: '#052e16', border: '1px solid #166534', borderRadius: 20, padding: '3px 10px' }}>
                  <CheckCircle size={11} /> Live on KrishiDukan
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {sale.items.map((item) => (
                  <div key={item.productId} style={{ fontSize: 12, color: '#94a3b8', background: '#0f172a', border: '1px solid #334155', borderRadius: 6, padding: '3px 10px' }}>
                    {item.quantity} units · ₹{item.price}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
