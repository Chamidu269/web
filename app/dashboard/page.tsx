'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { 
  CreditCard, Wallet, Calendar, MapPin, Navigation, ArrowUpRight, 
  RefreshCw, LogOut, Ticket, Compass 
} from 'lucide-react';
import Link from 'next/link';

interface TripItem {
  id: string;
  board_time: string;
  alight_time: string | null;
  distance_km: number | null;
  fare: number | null;
  status: 'in_progress' | 'completed' | 'cancelled';
  buses: {
    bus_number: string;
    route_name: string | null;
  } | null;
}

export default function DashboardPage() {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<TripItem[]>([]);
  const [activeTrip, setActiveTrip] = useState<TripItem | null>(null);
  const [passengerName, setPassengerName] = useState('');
  const [rfidUid, setRfidUid] = useState<string | null>(null);
  
  const router = useRouter();
  const supabase = createClient();

  const fetchUserData = async () => {
    // 1. Check if user is logged in
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      router.push('/login');
      return;
    }

    // Fetch passenger profile info
    const { data: passenger } = await supabase
      .from('passengers')
      .select('full_name, rfid_uid')
      .eq('id', user.id)
      .single();

    if (passenger) {
      setPassengerName(passenger.full_name);
      setRfidUid(passenger.rfid_uid);
    }

    // 2. Fetch the user's wallet balance from accounts
    const { data: account } = await supabase
      .from('accounts')
      .select('balance')
      .eq('passenger_id', user.id)
      .single();

    if (account) {
      setBalance(parseFloat(account.balance.toString()));
    }

    // 3. Fetch recent trips
    const { data: tripsData } = await supabase
      .from('trips')
      .select(`
        id,
        board_time,
        alight_time,
        distance_km,
        fare,
        status,
        buses (
          bus_number,
          route_name
        )
      `)
      .eq('passenger_id', user.id)
      .order('board_time', { ascending: false })
      .limit(6);

    if (tripsData) {
      const formattedTrips = tripsData as any[];
      const active = formattedTrips.find(t => t.status === 'in_progress');
      setActiveTrip(active || null);
      setTrips(formattedTrips.filter(t => t.status !== 'in_progress').slice(0, 5));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUserData();

    // Subscribe to REALTIME updates
    let accountsChannel: any;
    let tripsChannel: any;

    const setupRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Listen to wallet account balance updates
      accountsChannel = supabase
        .channel(`account-balance-${user.id}-${Math.random().toString(36).substring(7)}`)
        .on(
          'postgres_changes',
          { 
            event: 'UPDATE', 
            schema: 'public', 
            table: 'accounts', 
            filter: `passenger_id=eq.${user.id}` 
          },
          (payload: any) => {
            if (payload.new && payload.new.balance !== undefined) {
              setBalance(parseFloat(payload.new.balance));
            }
          }
        )
        .subscribe();

      // Listen to trips mutations (tap in/out)
      tripsChannel = supabase
        .channel(`passenger-trips-${user.id}-${Math.random().toString(36).substring(7)}`)
        .on(
          'postgres_changes',
          { 
            event: '*', 
            schema: 'public', 
            table: 'trips', 
            filter: `passenger_id=eq.${user.id}` 
          },
          () => {
            // Auto-reload data when trips change
            fetchUserData();
          }
        )
        .subscribe();
    };

    setupRealtime();

    return () => {
      if (accountsChannel) supabase.removeChannel(accountsChannel);
      if (tripsChannel) supabase.removeChannel(tripsChannel);
    };
  }, [router, supabase]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', marginTop: '100px' }}>
        <RefreshCw className="animate-spin" size={32} style={{ margin: '0 auto 16px' }} />
        <p>Syncing passenger profile...</p>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: '60px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '2.25rem' }}>Welcome, {passengerName || 'Passenger'}</h1>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)' }}>
            RFID: <strong style={{ fontFamily: 'monospace' }}>{rfidUid || 'Unlinked'}</strong>
          </p>
        </div>
        
        <button 
          onClick={async () => {
            await supabase.auth.signOut();
            router.push('/login');
          }}
          className="btn-primary" 
          style={{ background: 'var(--danger)', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <LogOut size={16} /> Sign Out
        </button>
      </div>

      {/* ACTIVE JOURNEY CARD */}
      {activeTrip && (
        <div className="glass-panel" style={{ border: '1px solid var(--accent-color)', background: 'rgba(139, 92, 246, 0.08)', marginBottom: '30px', display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div style={{ background: 'var(--accent-color)', color: 'white', padding: '12px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Compass size={24} className="animate-pulse" />
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--accent-color)', fontWeight: 700, letterSpacing: '0.05em' }}>Journey In Progress</span>
              <h3 style={{ margin: '2px 0 4px 0', fontSize: '1.2rem' }}>On Bus: {activeTrip.buses?.bus_number}</h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Boarded: <strong>{new Date(activeTrip.board_time).toLocaleTimeString()}</strong> · Route: {activeTrip.buses?.route_name || 'N/A'}
              </p>
            </div>
          </div>
          <span style={{ background: 'var(--accent-color)', color: 'white', padding: '6px 12px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600 }}>
            TAP RFID TO ALIGHT
          </span>
        </div>
      )}
      
      {/* Wallet and Quick Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '25px', marginBottom: '40px' }}>
        
        {/* Wallet Panel */}
        <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '30px 24px' }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '20px', borderRadius: '50%' }}>
            <Wallet size={36} color="var(--success)" />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Transit Wallet Balance</p>
            <h2 style={{ fontSize: '2.5rem', margin: '5px 0', color: 'var(--success)', fontWeight: 700 }}>
              LKR {balance !== null ? balance.toFixed(2) : '0.00'}
            </h2>
            <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--success)', padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>
              Active Account
            </span>
          </div>
        </div>
        
        {/* Quick Actions Panel */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '24px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 600 }}>Passenger Actions</h3>
          <div style={{ display: 'flex', gap: '15px' }}>
            <Link href="/recharge" style={{ flex: 1, textDecoration: 'none' }}>
              <button className="btn-primary" style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                Recharge <ArrowUpRight size={16} />
              </button>
            </Link>
            <Link href="/tickets" style={{ flex: 1, textDecoration: 'none' }}>
              <button className="btn-primary" style={{ width: '100%', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                <Ticket size={16} /> View Tickets
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* Trips Section */}
      <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Calendar size={22} color="var(--primary-color)" /> Recent Journeys
      </h2>

      {trips.length === 0 ? (
        <div className="glass-panel" style={{ padding: '40px', textAlign: 'center' }}>
          <Compass size={36} color="var(--text-secondary)" style={{ margin: '0 auto 12px' }} />
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
            Your completed transit journeys will appear here. Tap in on a bus scanner to begin!
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {trips.map((trip) => (
            <div key={trip.id} className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '12px', borderRadius: '50%' }}>
                  <Compass size={20} color="var(--primary-color)" />
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1rem' }}>{trip.buses?.route_name || 'Transit Route'}</h4>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Bus: <strong>{trip.buses?.bus_number}</strong> · Date: {new Date(trip.board_time).toLocaleDateString()} at {new Date(trip.board_time).toLocaleTimeString()}
                  </p>
                  {trip.alight_time && (
                    <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Duration: {Math.max(1, Math.round((new Date(trip.alight_time).getTime() - new Date(trip.board_time).getTime()) / 60000))} mins · Distance: {trip.distance_km ? `${Number(trip.distance_km).toFixed(1)} km` : '0.0 km'}
                    </p>
                  )}
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>Fare Charged</span>
                <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--accent-color)' }}>
                  LKR {trip.fare ? Number(trip.fare).toFixed(2) : '0.00'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
