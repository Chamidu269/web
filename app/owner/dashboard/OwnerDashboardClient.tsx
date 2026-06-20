'use client';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { createClient } from '@/utils/supabase/client';
import { Bus, DollarSign, Activity, MapPin, Plus, ArrowRight } from 'lucide-react';
import Link from 'next/link';

// Dynamically import Leaflet Map to avoid SSR errors
const BusTrackerMap = dynamic(() => import('@/components/BusTrackerMap'), {
  ssr: false,
  loading: () => (
    <div style={{ height: '500px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.03)', borderRadius: '16px', border: '1px solid var(--glass-border)' }}>
      <p style={{ color: 'var(--text-secondary)' }}>Initializing satellite navigation systems...</p>
    </div>
  )
});

interface BusItem {
  id: string;
  bus_number: string;
  route_name: string | null;
  status: string;
  registered_at: string;
}

interface BusLocation {
  bus_id: string;
  lat: number;
  lng: number;
  speed_kmh: number | null;
  updated_at: string;
}

interface OwnerDashboardClientProps {
  buses: BusItem[];
  initialLocations: BusLocation[];
  metrics: {
    todayTrips: number;
    todayEarnings: number;
  };
}

export default function OwnerDashboardClient({ buses, initialLocations, metrics }: OwnerDashboardClientProps) {
  // Convert list to record
  const initialLocRecord: Record<string, BusLocation> = {};
  initialLocations.forEach(loc => {
    initialLocRecord[loc.bus_id] = loc;
  });

  const [locations, setLocations] = useState<Record<string, BusLocation>>(initialLocRecord);
  const supabase = createClient();

  useEffect(() => {
    // Subscribe to REALTIME updates on the bus_locations table
    const channel = supabase
      .channel(`schema-db-changes-${Math.random().toString(36).substring(7)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bus_locations',
        },
        (payload: any) => {
          const updatedLoc = payload.new as BusLocation;
          if (updatedLoc && updatedLoc.bus_id) {
            setLocations(prev => ({
              ...prev,
              [updatedLoc.bus_id]: updatedLoc
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  // Compute active buses on map
  const activeBusesCount = buses.filter(b => b.status === 'active').length;

  return (
    <div>
      {/* Metrics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '40px' }}>
        <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '15px', borderRadius: '12px' }}>
            <Bus size={28} color="var(--primary-color)" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.85rem' }}>Active Fleet Size</p>
            <h3 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>{activeBusesCount}</h3>
          </div>
        </div>

        <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '15px', borderRadius: '12px' }}>
            <Activity size={28} color="var(--success)" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.85rem' }}>Today's Trips Completed</p>
            <h3 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>{metrics.todayTrips}</h3>
          </div>
        </div>

        <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ background: 'rgba(245, 158, 11, 0.1)', padding: '15px', borderRadius: '12px' }}>
            <DollarSign size={28} color="#f59e0b" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.85rem' }}>Today's Gross Earnings</p>
            <h3 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>
              LKR {metrics.todayEarnings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '30px', marginBottom: '40px' }}>
        
        {/* Map Column */}
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MapPin size={22} color="var(--primary-color)" /> Live Satellite Tracking
          </h2>
          <BusTrackerMap buses={buses} locations={locations} />
        </div>

        {/* Fleet Column */}
        <div style={{ marginTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>Fleet Directory</h2>
            <Link href="/owner/buses" style={{ textDecoration: 'none' }}>
              <button className="btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Plus size={14} /> Add/Edit
              </button>
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {buses.length === 0 ? (
              <div className="glass-panel" style={{ padding: '30px', textAlign: 'center' }}>
                <p style={{ color: 'var(--text-secondary)', margin: 0 }}>No buses registered to your account yet.</p>
              </div>
            ) : (
              buses.map((bus) => {
                const loc = locations[bus.id];
                return (
                  <div key={bus.id} className="glass-panel" style={{ borderLeft: bus.status === 'active' ? '4px solid var(--success)' : '4px solid var(--text-secondary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Bus size={18} color="var(--primary-color)" />
                        <span style={{ fontWeight: 700 }}>{bus.bus_number}</span>
                      </div>
                      <span style={{
                        fontSize: '0.75rem',
                        background: bus.status === 'active' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                        color: bus.status === 'active' ? 'var(--success)' : 'var(--text-secondary)',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontWeight: 600,
                        textTransform: 'uppercase'
                      }}>
                        {bus.status}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      <span>Route: <strong>{bus.route_name || 'Not configured'}</strong></span>
                      <span>
                        {loc ? `Speed: ${loc.speed_kmh || 0} km/h` : 'No Signal'}
                      </span>
                    </div>

                    {loc && (
                      <div style={{ marginTop: '8px', borderTop: '1px solid var(--glass-border)', paddingTop: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Lat/Lng: {Number(loc.lat).toFixed(4)}, {Number(loc.lng).toFixed(4)}</span>
                        <span>Updated: {new Date(loc.updated_at).toLocaleTimeString()}</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
