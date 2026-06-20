import { createClient } from '@/utils/supabase/server';
import OwnerDashboardClient from './OwnerDashboardClient';
import { ShieldAlert, AlertCircle, Clock, ShieldX, LogOut } from 'lucide-react';
import Link from 'next/link';

export const revalidate = 0; // Disable caching

export default async function OwnerDashboard() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div style={{ textAlign: 'center', marginTop: '100px' }}>
        <p>You must be signed in to view this page.</p>
      </div>
    );
  }

  // 1. Fetch Bus Owner details and verification status
  const { data: owner, error: ownerError } = await supabase
    .from('bus_owners')
    .select('*')
    .eq('id', user.id)
    .single();

  if (ownerError || !owner) {
    // Under review or hasn't filled profile, redirect to complete-profile (normally handled by middleware)
    return (
      <div style={{ maxWidth: '500px', margin: '80px auto', textAlign: 'center' }}>
        <div className="glass-panel" style={{ padding: '40px 30px' }}>
          <AlertCircle size={48} color="var(--primary-color)" style={{ margin: '0 auto 16px' }} />
          <h2>Profile Incomplete</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>Please complete your registration first.</p>
          <Link href="/owner/complete-profile">
            <button className="btn-primary">Complete Profile</button>
          </Link>
        </div>
      </div>
    );
  }

  // 2. Render review states
  if (owner.status === 'pending') {
    return (
      <div style={{ maxWidth: '550px', margin: '80px auto', padding: '0 15px' }}>
        <div className="glass-panel" style={{ textAlign: 'center', padding: '50px 30px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
          <div style={{ background: 'rgba(59, 130, 246, 0.08)', width: '70px', height: '70px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <Clock size={36} color="var(--primary-color)" />
          </div>
          <h1 style={{ fontSize: '1.75rem', marginBottom: '12px' }}>Profile Under Review</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.6', marginBottom: '30px' }}>
            Hi <strong>{owner.full_name}</strong>, your transit operator application is currently in queue. 
            An administrator is verifying your business documentation and fleet credentials. 
            You will gain system operational access once approved.
          </p>
          <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', borderTop: '1px solid var(--glass-border)', paddingTop: '24px' }}>
            <a href="/login" style={{ textDecoration: 'none' }}>
              <button className="btn-primary" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <LogOut size={16} /> Log Out
              </button>
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (owner.status === 'rejected') {
    return (
      <div style={{ maxWidth: '550px', margin: '80px auto', padding: '0 15px' }}>
        <div className="glass-panel" style={{ textAlign: 'center', padding: '50px 30px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          <div style={{ background: 'rgba(239, 68, 68, 0.08)', width: '70px', height: '70px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <ShieldX size={36} color="var(--danger)" />
          </div>
          <h1 style={{ fontSize: '1.75rem', marginBottom: '12px', color: 'var(--danger)' }}>Application Rejected</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.6', marginBottom: '20px' }}>
            Unfortunately, your bus owner application has been rejected by our administration team.
          </p>
          
          <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '15px', borderRadius: '8px', textAlign: 'left', marginBottom: '30px' }}>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--danger)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Reason for Decision</span>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{owner.rejection_reason || 'No specific reason provided.'}</span>
          </div>

          <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '24px' }}>
            <a href="/login" style={{ textDecoration: 'none' }}>
              <button className="btn-primary" style={{ background: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 auto' }}>
                <LogOut size={16} /> Log Out
              </button>
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (owner.status === 'suspended') {
    return (
      <div style={{ maxWidth: '550px', margin: '80px auto', padding: '0 15px' }}>
        <div className="glass-panel" style={{ textAlign: 'center', padding: '50px 30px', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
          <div style={{ background: 'rgba(245, 158, 11, 0.08)', width: '70px', height: '70px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <ShieldAlert size={36} color="#f59e0b" />
          </div>
          <h1 style={{ fontSize: '1.75rem', marginBottom: '12px', color: '#f59e0b' }}>Account Suspended</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.6', marginBottom: '30px' }}>
            Your operator portal privileges have been temporarily suspended by system administrators. 
            Please contact support at <strong>ops@paysmart.lk</strong> for dispute resolution.
          </p>
          <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '24px' }}>
            <a href="/login" style={{ textDecoration: 'none' }}>
              <button className="btn-primary" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 auto' }}>
                <LogOut size={16} /> Log Out
              </button>
            </a>
          </div>
        </div>
      </div>
    );
  }

  // 3. Retrieve owner's fleet buses
  const { data: buses } = await supabase
    .from('buses')
    .select('*')
    .eq('owner_id', user.id)
    .order('registered_at', { ascending: false });

  const busList = buses || [];
  const busIds = busList.map(b => b.id);

  // 4. Fetch locations
  let initialLocations: any[] = [];
  if (busIds.length > 0) {
    const { data } = await supabase
      .from('bus_locations')
      .select('*')
      .in('bus_id', busIds);
    initialLocations = data || [];
  }

  // 5. Query today's operational stats
  let todayTrips = 0;
  let todayEarnings = 0;

  if (busIds.length > 0) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: trips } = await supabase
      .from('trips')
      .select('fare, status')
      .in('bus_id', busIds)
      .gte('board_time', todayStart.toISOString());

    if (trips) {
      todayTrips = trips.length;
      todayEarnings = trips
        .filter(t => t.status === 'completed' && t.fare)
        .reduce((sum, t) => sum + parseFloat(t.fare.toString()), 0);
    }
  }

  return (
    <div style={{ paddingBottom: '60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '2.25rem' }}>Operator Dashboard</h1>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)' }}>
            Logged in as operator: <strong>{owner.full_name}</strong>
          </p>
        </div>
        <div>
          {/* Sign Out */}
          <Link href="/login" style={{ textDecoration: 'none' }}>
            <button className="btn-primary" style={{ background: 'var(--danger)', padding: '10px 20px', fontSize: '0.9rem' }}>
              Sign Out
            </button>
          </Link>
        </div>
      </div>

      <OwnerDashboardClient 
        buses={busList} 
        initialLocations={initialLocations} 
        metrics={{ todayTrips, todayEarnings }} 
      />
    </div>
  );
}
