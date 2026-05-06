import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Phone, Navigation, Star, List, Map, MessageCircle, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { PRODUCTS, BRANDS, getRetailersForProduct, formatDistance, distanceM } from '../demoData';
import type { Retailer } from '../demoData';
import { useLocation } from '../LocationContext';
import { RetailerMap } from '../components/RetailerMap';
import type { MapStockResult as StockResult } from '../components/RetailerMap';
import { fetchLiveProductStock, isSyncAvailable } from '../syncApi';
import type { LiveRetailer, LiveStock } from '../syncApi';

type ViewMode = 'map' | 'list';

function liveToResult(live: LiveRetailer, stock: LiveStock, userLat: number, userLng: number): StockResult {
  const retailer: Retailer = {
    id: live.id,
    businessName: live.businessName,
    ownerName: live.ownerName,
    phone: live.phone,
    whatsapp: live.whatsapp,
    addressLine: live.addressLine,
    city: live.city,
    state: live.state,
    pincode: live.pincode,
    lat: live.lat,
    lng: live.lng,
    rating: live.rating,
    totalRatings: live.totalRatings,
    openHours: live.openHours ?? 'Mon–Sat: 9 AM – 7 PM',
  };
  return {
    retailer,
    stock,
    distanceM: distanceM(userLat, userLng, live.lat, live.lng),
    type: live.type,
  };
}

export function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { location, requestGps, requesting } = useLocation();
  const [viewMode, setViewMode] = useState<ViewMode>('map');
  const [selectedRetailer, setSelectedRetailer] = useState<Retailer | null>(null);
  const [results, setResults] = useState<StockResult[]>([]);
  const [syncOnline, setSyncOnline] = useState<boolean | null>(null);
  const [lastRefresh, setLastRefresh] = useState(0);

  const product = PRODUCTS.find((p) => p.id === id);
  const brand = product ? BRANDS.find((b) => b.id === product.brandId) : null;

  const load = useCallback(async () => {
    if (!id) return;
    // Check if sync-server is running
    const online = await isSyncAvailable();
    setSyncOnline(online);

    if (online) {
      // Live data from sync-server (includes dealer-created retailers + ERP retailers)
      const liveResults = await fetchLiveProductStock(id);
      const mapped = liveResults
        .map((r) => liveToResult(r.retailer, r.stock, location.lat, location.lng))
        .sort((a, b) => {
          if (a.stock.inStock !== b.stock.inStock) return a.stock.inStock ? -1 : 1;
          return a.distanceM - b.distanceM;
        });
      setResults(mapped);
    } else {
      // Fallback: demo data
      const demo = getRetailersForProduct(id, location.lat, location.lng);
      setResults(demo.map((r) => ({ ...r, type: 'retailer' })));
    }
    setLastRefresh(Date.now());
  }, [id, location.lat, location.lng]);

  useEffect(() => { load(); }, [load]);

  if (!product) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <p style={{ color: '#dc2626', fontSize: 14 }}>Product not found</p>
        <button onClick={() => navigate('/')} style={{ marginTop: 12, padding: '8px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Back</button>
      </div>
    );
  }

  const inStock = results.filter((r) => r.stock.inStock);
  const outOfStock = results.filter((r) => !r.stock.inStock);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* Back nav + toggle */}
      <div style={{ position: 'sticky', top: 60, zIndex: 30, background: '#fff', padding: '10px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: '#374151' }}>
          <ArrowLeft size={20} />
        </button>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#111827', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {product.shortName}
        </span>
        <button onClick={load} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: '#9ca3af' }} title="Refresh">
          <RefreshCw size={14} />
        </button>
        <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 8, padding: 2, gap: 2 }}>
          {(['map', 'list'] as ViewMode[]).map((mode) => (
            <button key={mode} onClick={() => setViewMode(mode)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: viewMode === mode ? '#fff' : 'transparent', color: viewMode === mode ? '#111827' : '#6b7280', boxShadow: viewMode === mode ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
              {mode === 'map' ? <Map size={13} /> : <List size={13} />} {mode === 'map' ? 'Map' : 'List'}
            </button>
          ))}
        </div>
      </div>

      {/* Product hero */}
      <section style={{ padding: 16, background: '#fff', borderBottom: '1px solid #f3f4f6' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ width: 72, height: 72, borderRadius: 14, flexShrink: 0, background: `linear-gradient(135deg, ${product.imageColor}20, ${product.imageColor}40)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38 }}>
            {product.emoji}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: brand?.color ?? '#16a34a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
              {brand?.name} · {product.categoryLabel}
            </div>
            <h1 style={{ fontSize: 17, fontWeight: 700, color: '#111827', lineHeight: 1.3, marginBottom: 6 }}>{product.name}</h1>
            <p style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>{product.description}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
          {product.benefits.map((b) => (
            <span key={b} style={{ fontSize: 11, color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '3px 8px', fontWeight: 500 }}>✓ {b}</span>
          ))}
        </div>
      </section>

      {/* Location + sync status bar */}
      <div style={{ padding: '8px 16px', background: '#f0fdf4', borderBottom: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <MapPin size={13} style={{ color: '#15803d' }} />
          <span style={{ fontSize: 12, color: '#15803d' }}>
            Near <strong>{location.label}</strong> · {inStock.length} in stock
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {syncOnline !== null && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: syncOnline ? '#15803d' : '#9ca3af' }}>
              {syncOnline ? <Wifi size={11} /> : <WifiOff size={11} />}
              {syncOnline ? 'Live data' : 'Demo data'}
            </span>
          )}
          {location.source !== 'gps' && (
            <button onClick={requestGps} disabled={requesting} style={{ background: 'transparent', border: 'none', color: '#15803d', fontSize: 11, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>
              {requesting ? 'Getting…' : 'Use my GPS'}
            </button>
          )}
        </div>
      </div>

      {/* Map view */}
      {viewMode === 'map' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: 340, background: '#e5e7eb' }}>
            <RetailerMap
              results={results}
              userLat={location.lat}
              userLng={location.lng}
              onSelect={setSelectedRetailer}
              selected={selectedRetailer}
            />
          </div>
          {selectedRetailer ? (
            <RetailerCard result={results.find((r) => r.retailer.id === selectedRetailer.id)!} onClose={() => setSelectedRetailer(null)} />
          ) : (
            <div style={{ padding: '14px 16px', background: '#fff' }}>
              <p style={{ fontSize: 13, color: '#6b7280', textAlign: 'center' }}>
                {results.length > 0 ? `Tap a pin · ${inStock.length} stocking this product` : 'No retailers found near you'}
              </p>
            </div>
          )}
          {results.length > 0 && (
            <div style={{ padding: '0 16px 16px', background: '#fff', borderTop: '1px solid #f3f4f6' }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 10, paddingTop: 14 }}>ALL RETAILERS</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {results.map((r) => (
                  <RetailerRow key={r.retailer.id} result={r} onSelect={() => setSelectedRetailer(r.retailer)} isSelected={selectedRetailer?.id === r.retailer.id} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* List view */}
      {viewMode === 'list' && (
        <div style={{ padding: 16 }}>
          {results.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📍</div>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 6 }}>No retailers found</p>
              <p style={{ fontSize: 13 }}>Enable GPS or check back after your dealer records sales.</p>
            </div>
          ) : (
            <>
              {inStock.length > 0 && (
                <>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#15803d', marginBottom: 10 }}>IN STOCK ({inStock.length})</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                    {inStock.map((r) => <RetailerCard key={r.retailer.id} result={r} />)}
                  </div>
                </>
              )}
              {outOfStock.length > 0 && (
                <>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', marginBottom: 10 }}>OUT OF STOCK ({outOfStock.length})</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: 0.6 }}>
                    {outOfStock.map((r) => <RetailerCard key={r.retailer.id} result={r} />)}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RetailerCard({ result, onClose }: { result: StockResult; onClose?: () => void }) {
  const { retailer, stock, distanceM: d, type } = result;
  function openMaps() {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${retailer.lat},${retailer.lng}`, '_blank');
  }
  const isDealer = type === 'dealer';
  return (
    <div style={{ background: '#fff', border: `1px solid ${isDealer ? '#bbf7d0' : '#e5e7eb'}`, borderRadius: 14, padding: 14, position: 'relative' }}>
      {onClose && <button onClick={onClose} style={{ position: 'absolute', top: 10, right: 10, background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 16, padding: 4 }}>✕</button>}
      {isDealer && (
        <div style={{ fontSize: 11, fontWeight: 700, color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '2px 8px', display: 'inline-block', marginBottom: 8 }}>
          ⚡ Official Dealer — Direct Purchase
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: isDealer ? '#f0fdf4' : '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🏪</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 2 }}>{retailer.businessName}</div>
          <div style={{ fontSize: 12, color: '#6b7280', display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            <Star size={11} fill="#f59e0b" stroke="none" />
            <span style={{ fontWeight: 600, color: '#374151' }}>{retailer.rating.toFixed(1)}</span>
            <span>· {retailer.city}</span>
            <span style={{ color: '#16a34a', fontWeight: 600 }}>· {formatDistance(d)}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#16a34a' }}>₹{stock.price}</div>
          {stock.mrp > stock.price && <div style={{ fontSize: 11, color: '#9ca3af', textDecoration: 'line-through' }}>₹{stock.mrp}</div>}
        </div>
      </div>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>{retailer.addressLine}{retailer.city ? `, ${retailer.city}` : ''}</div>
      {stock.inStock
        ? <div style={{ fontSize: 11, color: '#15803d', fontWeight: 700, marginBottom: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e' }} /> In stock · {stock.quantity} units</div>
        : <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 700, marginBottom: 10 }}>✗ Out of stock</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <a href={`tel:${retailer.phone}`} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '9px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#15803d', textDecoration: 'none' }}>
          <Phone size={13} /> Call
        </a>
        {retailer.whatsapp && (
          <a href={`https://wa.me/${retailer.whatsapp.replace('+', '')}`} target="_blank" rel="noopener noreferrer" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '9px 12px', background: '#f0fff4', border: '1px solid #86efac', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#15803d', textDecoration: 'none' }}>
            <MessageCircle size={13} /> WhatsApp
          </a>
        )}
        <button onClick={openMaps} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '9px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#1d4ed8', cursor: 'pointer' }}>
          <Navigation size={13} /> Directions
        </button>
      </div>
    </div>
  );
}

function RetailerRow({ result, onSelect, isSelected }: { result: StockResult; onSelect: () => void; isSelected: boolean }) {
  const { retailer, stock, distanceM: d, type } = result;
  const isDealer = type === 'dealer';
  return (
    <button onClick={onSelect} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: isSelected ? '#f0fdf4' : (isDealer ? '#fefce8' : '#f9fafb'), border: `1px solid ${isSelected ? '#bbf7d0' : (isDealer ? '#fde68a' : '#e5e7eb')}`, borderRadius: 10, cursor: 'pointer', textAlign: 'left' }}>
      <div style={{ fontSize: 18 }}>{isDealer ? '⚡' : '🏪'}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{retailer.businessName}</div>
        <div style={{ fontSize: 11, color: '#6b7280' }}>{retailer.city} · {formatDistance(d)}{isDealer ? ' · Official Dealer' : ''}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {stock.inStock
          ? <span style={{ fontSize: 11, color: '#15803d', fontWeight: 700, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '2px 7px' }}>₹{stock.price}</span>
          : <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>Out of stock</span>}
      </div>
    </button>
  );
}
