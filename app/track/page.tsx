'use client';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { createClient } from '@/utils/supabase/client';
import { MapPin, Compass, Search, Bus, Info } from 'lucide-react';
import Link from 'next/link';

// Dynamically import Leaflet Map to avoid SSR errors
const BusTrackerMap = dynamic(() => import('@/components/BusTrackerMap'), {
  ssr: false,
  loading: () => (
    <div style={{ height: '500px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.03)', borderRadius: '16px', border: '1px solid var(--glass-border)' }}>
      <p style={{ color: 'var(--text-secondary)' }}>Loading satellite tracking data...</p>
    </div>
  )
});

interface BusItem {
  id: string;
  bus_number: string;
  route_name: string | null;
  status: string;
}

interface BusLocation {
  bus_id: string;
  lat: number;
  lng: number;
  speed_kmh: number | null;
  updated_at: string;
}

export default function TrackPage() {
  const [buses, setBuses] = useState<BusItem[]>([]);
  const [locations, setLocations] = useState<Record<string, BusLocation>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  const supabase = createClient();

  useEffect(() => {
    const fetchData = async () => {
      // 1. Fetch all active buses
      const { data: busesData } = await supabase
        .from('buses')
        .select('id, bus_number, route_name, status')
        .eq('status', 'active');

      if (busesData) {
        setBuses(busesData);
        
        const busIds = busesData.map(b => b.id);
        
        if (busIds.length > 0) {
          // 2. Fetch initial bus locations
          const { data: locData } = await supabase
            .from('bus_locations')
            .select('*')
            .in('bus_id', busIds);

          if (locData) {
            const locRecord: Record<string, BusLocation> = {};
            locData.forEach(loc => {
              locRecord[loc.bus_id] = loc;
            });
            setLocations(locRecord);
          }
        }
      }
      setLoading(false);
    };

    fetchData();

    // 3. Subscribe to Realtime coordinate updates on bus_locations table
    const channel = supabase
      .channel(`public-locations-feed-${Math.random().toString(36).substring(7)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bus_locations'
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

  // Filter buses by search query
  const filteredBuses = buses.filter(b => {
    return b.bus_number.toLowerCase().includes(search.toLowerCase()) ||
           (b.route_name || '').toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div style={{ paddingBottom: '60px' }}>
      <div style={{ marginBottom: '30px' }}>
        <h1 style={{ margin: 0, fontSize: '2.25rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Compass color="var(--primary-color)" size={32} /> Live Transit Tracker
        </h1>
        <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)' }}>
          Trace transit fleet locations across Sri Lanka in real-time. Click on any bus node to inspect route details.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '30px' }}>
        
        {/* MAP CONTAINER */}
        <div>
          {loading ? (
            <div style={{ height: '500px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.03)', borderRadius: '16px', border: '1px solid var(--glass-border)' }}>
              <p style={{ color: 'var(--text-secondary)' }}>Synchronizing GPS feeds...</p>
            </div>
          ) : (
            <BusTrackerMap buses={buses} locations={locations} />
          )}
        </div>

        {/* BUS LISTING INDEX */}
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 600, marginBottom: '15px' }}>Active Routes</h2>
          
          <div style={{ position: 'relative', marginBottom: '20px' }}>
            <Search size={16} color="var(--text-secondary)" style={{ position: 'absolute', left: '10px', top: '10px' }} />
            <input 
              type="text" 
              className="form-input" 
              placeholder="Search by bus number or route..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '36px', paddingTop: '8px', paddingBottom: '8px', fontSize: '0.85rem' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '420px', overflowY: 'auto' }}>
            {filteredBuses.length === 0 ? (
              <div className="glass-panel" style={{ padding: '24px', textAlign: 'center' }}>
                <Info size={24} color="var(--text-secondary)" style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>No active vehicles found matching criteria.</p>
              </div>
            ) : (
              filteredBuses.map((bus) => {
                const loc = locations[bus.id];
                return (
                  <div key={bus.id} className="glass-panel" style={{ padding: '15px', borderLeft: loc ? '3px solid var(--success)' : '3px solid var(--glass-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', fontWeight: 700 }}>
                        <Bus size={14} color="var(--primary-color)" />
                        <span>{bus.bus_number}</span>
                      </div>
                      {loc && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ width: '6px', height: '6px', background: 'var(--success)', borderRadius: '50%', display: 'inline-block' }}></span>
                          Live
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Route: <strong>{bus.route_name || 'Generic Service'}</strong>
                    </div>
                    {loc && (
                      <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                        <span>Speed: {loc.speed_kmh ? `${loc.speed_kmh} km/h` : 'Stopped'}</span>
                        <span>As of {new Date(loc.updated_at).toLocaleTimeString()}</span>
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
