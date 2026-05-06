import { useState, useEffect } from 'react';
import { Store, MapPin, Phone, Wifi, WifiOff, RefreshCw, ExternalLink } from 'lucide-react';

const API = 'http://localhost:3999';

interface RetailerWithStock {
  id: string;
  businessName: string;
  ownerName: string;
  phone: string;
  city: string;
  state: string;
  type: string;
  erpLinked: boolean;
  rating: number;
  createdAt: string;
  stock: { productId: string; inStock: boolean; quantity: number; price: number }[];
}

const TYPE_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  dealer: { label: 'Dealer (Direct)', color: '#22c55e', bg: '#052e16' },
  retailer: { label: 'Retailer', color: '#60a5fa', bg: '#1e3a5f' },
  erp_retailer: { label: 'ERP Retailer', color: '#a78bfa', bg: '#2e1065' },
};

export function RetailersPage() {
  const [retailers, setRetailers] = useState<RetailerWithStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await fetch(`${API}/retailers`).then((r) => r.json());
      setRetailers(data);
    } catch {
      setError('Cannot reach sync-server on port 3999. Make sure it is running.');
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const inStockCount = (r: RetailerWithStock) => r.stock.filter((s) => s.inStock).length;

  return (
    <div style={{ padding: 28, maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>Retailers on KrishiDukan</h1>
          <p style={{ fontSize: 14, color: '#64748b' }}>All retailers currently live — includes your direct store + all distributor-created entries.</p>
        </div>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Retailers', value: retailers.length, color: '#22c55e' },
          { label: 'ERP Linked', value: retailers.filter((r) => r.erpLinked).length, color: '#a78bfa' },
          { label: 'Stock Lines', value: retailers.reduce((acc, r) => acc + r.stock.length, 0), color: '#60a5fa' },
        ].map((s) => (
          <div key={s.label} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '16px 20px' }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: s.color, marginBottom: 2 }}>{s.value}</div>
            <div style={{ fontSize: 13, color: '#64748b' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: '#450a0a', border: '1px solid #dc2626', borderRadius: 8, color: '#fca5a5', fontSize: 13, marginBottom: 16 }}>{error}</div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#475569' }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {retailers.map((r) => {
            const typeInfo = TYPE_LABEL[r.type] ?? TYPE_LABEL['retailer']!;
            return (
              <div key={r.id} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 10, background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🏪</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9' }}>{r.businessName}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: typeInfo.color, background: typeInfo.bg, borderRadius: 10, padding: '2px 8px' }}>{typeInfo.label}</span>
                        {r.erpLinked && (
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#a78bfa', background: '#2e1065', borderRadius: 10, padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <Wifi size={10} /> ERP Synced
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#64748b', flexWrap: 'wrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPin size={11} />{r.city}, {r.state}</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Phone size={11} />{r.phone}</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Store size={11} />{inStockCount(r)} of {r.stock.length} products in stock</span>
                      </div>
                    </div>
                  </div>
                  <a href={`http://localhost:5175/retailer/${r.id}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: 6, fontSize: 12, color: '#94a3b8', textDecoration: 'none', flexShrink: 0 }}>
                    <ExternalLink size={12} /> View on site
                  </a>
                </div>

                {/* Stock grid */}
                {r.stock.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    {r.stock.map((s) => (
                      <div key={s.productId} style={{ fontSize: 11, color: s.inStock ? '#4ade80' : '#ef4444', background: '#0f172a', border: `1px solid ${s.inStock ? '#166534' : '#450a0a'}`, borderRadius: 6, padding: '3px 10px' }}>
                        {s.inStock ? `✓ ${s.quantity} units · ₹${s.price}` : '✗ Out of stock'} · <span style={{ color: '#475569' }}>{s.productId.replace('kapl-', '')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
