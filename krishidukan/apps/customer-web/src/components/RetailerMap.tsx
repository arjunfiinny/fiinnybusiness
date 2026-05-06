import { useEffect, useRef } from 'react';
import type { Map, Marker } from 'leaflet';
import type { Retailer } from '../demoData';
import { formatDistance } from '../demoData';

export interface MapStockResult {
  retailer: Retailer;
  stock: { price: number; mrp: number; inStock: boolean; quantity: number };
  distanceM: number;
  type?: string;
}

interface Props {
  results: MapStockResult[];
  userLat: number;
  userLng: number;
  onSelect: (retailer: Retailer) => void;
  selected: Retailer | null;
}

export function RetailerMap({ results, userLat, userLng, onSelect, selected }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Dynamically import Leaflet to avoid SSR issues
    import('leaflet').then((L) => {
      // Fix default marker icon paths broken by bundlers
      delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(containerRef.current!, {
        zoomControl: true,
        scrollWheelZoom: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18,
      }).addTo(map);

      mapRef.current = map;

      // User location marker (blue dot)
      const userIcon = L.divIcon({
        html: `<div style="width:14px;height:14px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 2px 6px rgba(37,99,235,0.5)"></div>`,
        className: '',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      L.marker([userLat, userLng], { icon: userIcon })
        .addTo(map)
        .bindPopup('<strong>Your location</strong>');

      renderMarkers(L, map, results, onSelect);
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update markers when results change
  useEffect(() => {
    if (!mapRef.current) return;
    import('leaflet').then((L) => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      renderMarkers(L, mapRef.current!, results, onSelect);

      // Fit bounds to include all markers + user
      const latlngs: [number, number][] = [[userLat, userLng], ...results.map((r) => [r.retailer.lat, r.retailer.lng] as [number, number])];
      if (latlngs.length > 1) {
        mapRef.current!.fitBounds(latlngs, { padding: [40, 40] });
      } else {
        mapRef.current!.setView([userLat, userLng], 8);
      }
    });
  }, [results, selected]); // eslint-disable-line react-hooks/exhaustive-deps

  function renderMarkers(L: typeof import('leaflet'), map: Map, data: MapStockResult[], cb: (r: Retailer) => void) {
    data.forEach(({ retailer, stock, distanceM: d }) => {
      const isInStock = stock.inStock;
      const icon = L.divIcon({
        html: `<div style="
          background:${isInStock ? '#16a34a' : '#9ca3af'};
          color:#fff;font-size:10px;font-weight:700;
          padding:3px 7px;border-radius:12px;
          white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.25);
          border:2px solid #fff;
        ">${isInStock ? '✓ In Stock' : 'Out of Stock'}</div>`,
        className: '',
        iconAnchor: [40, 12],
      });

      const marker = L.marker([retailer.lat, retailer.lng], { icon })
        .addTo(map)
        .bindPopup(`
          <div style="min-width:180px;font-family:sans-serif">
            <div style="font-weight:700;font-size:13px;margin-bottom:4px">${retailer.businessName}</div>
            <div style="font-size:11px;color:#6b7280;margin-bottom:4px">${retailer.city} · ${formatDistance(d)}</div>
            <div style="font-size:12px;margin-bottom:8px;color:${isInStock ? '#16a34a' : '#dc2626'};font-weight:600">
              ${isInStock ? `✓ In Stock — ₹${stock.price}` : '✗ Out of Stock'}
            </div>
            <a href="https://www.google.com/maps/dir/?api=1&destination=${retailer.lat},${retailer.lng}"
               target="_blank"
               style="display:inline-block;background:#1d4ed8;color:#fff;padding:5px 10px;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none">
              🗺 Get Directions
            </a>
          </div>
        `)
        .on('click', () => cb(retailer));

      markersRef.current.push(marker);
    });
  }

  return (
    <>
      {/* Inject Leaflet CSS once */}
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <div ref={containerRef} style={{ width: '100%', height: '100%', borderRadius: 'inherit' }} />
    </>
  );
}
