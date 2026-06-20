'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { ArrowLeft, Ticket, Calendar, QrCode, Compass, RefreshCw, X } from 'lucide-react';
import Link from 'next/link';

interface TicketItem {
  id: string;
  issued_at: string;
  qr_code_data: string;
  trips: {
    board_time: string;
    alight_time: string | null;
    distance_km: number | null;
    fare: number | null;
    buses: {
      bus_number: string;
      route_name: string | null;
    } | null;
  } | null;
}

export default function TicketsPage() {
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  
  const supabase = createClient();
  const router = useRouter();

  const fetchTickets = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }

    const { data, error } = await supabase
      .from('tickets')
      .select(`
        id,
        issued_at,
        qr_code_data,
        trips (
          board_time,
          alight_time,
          distance_km,
          fare,
          buses (
            bus_number,
            route_name
          )
        )
      `)
      .eq('passenger_id', user.id)
      .order('issued_at', { ascending: false });

    if (error) {
      console.error('Error fetching tickets:', error);
    } else if (data) {
      setTickets(data as any[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTickets();

    // Subscribe to REALTIME ticket delivery (e.g. when passenger taps out of a bus)
    let ticketsChannel: any;

    const setupRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      ticketsChannel = supabase
        .channel(`passenger-tickets-${user.id}-${Math.random().toString(36).substring(7)}`)
        .on(
          'postgres_changes',
          { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'tickets', 
            filter: `passenger_id=eq.${user.id}` 
          },
          (payload: any) => {
            console.log('New ticket delivered in realtime:', payload.new);
            // Reload the list instantly
            fetchTickets();
          }
        )
        .subscribe();
    };

    setupRealtime();

    return () => {
      if (ticketsChannel) supabase.removeChannel(ticketsChannel);
    };
  }, [router, supabase]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', marginTop: '100px' }}>
        <RefreshCw className="animate-spin" size={32} style={{ margin: '0 auto 16px' }} />
        <p>Retrieved ticket slips...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '600px', margin: '40px auto', padding: '0 15px', paddingBottom: '60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '30px' }}>
        <Link href="/dashboard" style={{ textDecoration: 'none', color: 'var(--text-secondary)' }}>
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h1 style={{ margin: 0, fontSize: '2rem' }}>My Journeys & Tickets</h1>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)' }}>Contactless receipt slips and travel validation QR codes.</p>
        </div>
      </div>

      {tickets.length === 0 ? (
        <div className="glass-panel" style={{ padding: '50px 30px', textAlign: 'center' }}>
          <Ticket size={48} color="var(--text-secondary)" style={{ margin: '0 auto 16px', opacity: 0.5 }} />
          <h3>No travel tickets yet</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '8px 0 0 0' }}>
            When you complete a bus journey by tapping out, your digital ticket invoice will instantly appear here.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {tickets.map((ticket) => {
            const isExpanded = selectedTicketId === ticket.id;
            const trip = ticket.trips;
            const bus = trip?.buses;

            return (
              <div 
                key={ticket.id} 
                className="glass-panel" 
                style={{ 
                  border: isExpanded ? '1px solid var(--primary-color)' : '1px solid var(--glass-border)',
                  transition: 'all 0.2s ease',
                  padding: '24px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '15px' }}>
                  <div>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: '1.15rem' }}>{bus?.route_name || 'Transit Route'}</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      <Calendar size={14} />
                      <span>{new Date(ticket.issued_at).toLocaleDateString()} at {new Date(ticket.issued_at).toLocaleTimeString()}</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Bus: <strong>{bus?.bus_number || 'N/A'}</strong> · Distance: <strong>{trip?.distance_km ? `${Number(trip.distance_km).toFixed(1)} km` : '0.0 km'}</strong>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>Fare Charged</span>
                    <h2 style={{ margin: '2px 0 8px 0', color: 'var(--accent-color)', fontSize: '1.4rem', fontWeight: 700 }}>
                      LKR {trip?.fare ? Number(trip.fare).toFixed(2) : '0.00'}
                    </h2>
                    
                    <button 
                      onClick={() => setSelectedTicketId(isExpanded ? null : ticket.id)}
                      className="btn-primary" 
                      style={{ 
                        padding: '6px 12px', 
                        fontSize: '0.8rem', 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '6px',
                        background: isExpanded ? 'var(--danger)' : 'var(--primary-color)'
                      }}
                    >
                      {isExpanded ? <X size={14} /> : <QrCode size={14} />}
                      {isExpanded ? 'Close QR' : 'View Ticket'}
                    </button>
                  </div>
                </div>

                {/* Expanded QR Section */}
                {isExpanded && (
                  <div style={{ 
                    marginTop: '20px', 
                    borderTop: '1px solid var(--glass-border)', 
                    paddingTop: '20px', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center',
                    background: 'rgba(0, 0, 0, 0.2)',
                    borderRadius: '8px',
                    padding: '20px'
                  }}>
                    <div style={{ background: 'white', padding: '15px', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', marginBottom: '16px' }}>
                      <img 
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(ticket.qr_code_data)}`} 
                        alt="Transit Ticket Validation QR Code" 
                        style={{ display: 'block', width: '180px', height: '180px' }}
                      />
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Security Hash</span>
                    <span style={{ fontSize: '0.8rem', fontFamily: 'monospace', wordBreak: 'break-all', textAlign: 'center', maxWidth: '300px', color: 'var(--primary-color)' }}>
                      {ticket.qr_code_data}
                    </span>
                    
                    <div style={{ width: '100%', borderTop: '1px solid var(--glass-border)', marginTop: '20px', paddingTop: '15px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', fontSize: '0.85rem' }}>
                      <div>
                        <span style={{ color: 'var(--text-secondary)', display: 'block' }}>Boarded</span>
                        <strong>{trip?.board_time ? new Date(trip.board_time).toLocaleTimeString() : 'N/A'}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-secondary)', display: 'block' }}>Alighted</span>
                        <strong>{trip?.alight_time ? new Date(trip.alight_time).toLocaleTimeString() : 'N/A'}</strong>
                      </div>
                    </div>
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
