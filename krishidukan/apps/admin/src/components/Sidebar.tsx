import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Store, BarChart3, LogOut, ShoppingCart, MapPin } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/sales', label: 'Record Sale', icon: ShoppingCart },
  { to: '/retailers', label: 'Retailers', icon: MapPin },
  { to: '/shops', label: 'Pending Shops', icon: Store },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
];

const s: Record<string, React.CSSProperties> = {
  sidebar: { width: 220, background: '#1e293b', minHeight: '100vh', display: 'flex', flexDirection: 'column', borderRight: '1px solid #334155' },
  logo: { padding: '24px 20px 16px', borderBottom: '1px solid #334155' },
  logoText: { fontSize: 18, fontWeight: 700, color: '#22c55e', letterSpacing: '-0.5px' },
  subText: { fontSize: 11, color: '#64748b', marginTop: 2 },
  nav: { flex: 1, padding: '12px 0' },
  footer: { padding: '16px 20px', borderTop: '1px solid #334155' },
  logoutBtn: { background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 },
};

export function Sidebar() {
  const { user, logout } = useAuth();
  return (
    <aside style={s['sidebar']}>
      <div style={s['logo']}>
        <div style={s['logoText']}>⚡ KrishiDukan</div>
        <div style={s['subText']}>KaranArjun Dealer Panel</div>
      </div>
      <nav style={s['nav']}>
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 20px', fontSize: 14, textDecoration: 'none',
              color: isActive ? '#22c55e' : '#94a3b8',
              background: isActive ? 'rgba(34,197,94,0.08)' : 'transparent',
              borderLeft: isActive ? '3px solid #22c55e' : '3px solid transparent',
            })}
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div style={s['footer']}>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user?.email}
        </div>
        <button style={s['logoutBtn']} onClick={() => void logout()}>
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </aside>
  );
}
