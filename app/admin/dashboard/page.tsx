import { createAdminClient } from '@/utils/supabase/server';
import DashboardClient from './DashboardClient';
import { Shield } from 'lucide-react';
import Link from 'next/link';

export const revalidate = 0; // Disable caching

export default async function AdminDashboard() {
  const supabase = createAdminClient();

  // 1. Fetch system KPIs via DEFINER RPC function
  let kpis = null;
  try {
    const { data: kpiData, error: kpiError } = await supabase.rpc('get_admin_kpis');
    if (!kpiError && kpiData && kpiData.length > 0) {
      kpis = kpiData[0];
    } else if (kpiError) {
      console.error('Error fetching admin KPIs via RPC:', kpiError);
    }
  } catch (err) {
    console.error('RPC Error:', err);
  }

  // 2. Fetch pending bus owner registration requests
  let pendingRequests: any[] = [];
  try {
    const { data, error } = await supabase
      .from('bus_owner_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (!error && data) {
      pendingRequests = data;
    } else if (error) {
      console.error('Error fetching pending bus owner requests:', error);
    }
  } catch (err) {
    console.error('Fetch requests error:', err);
  }

  return (
    <div style={{ paddingBottom: '60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '2.25rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Shield color="var(--danger)" size={32} /> System Admin Dashboard
          </h1>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)' }}>Welcome to the PaySmart operations control terminal.</p>
        </div>

        <div>
          {/* Admin Sign Out */}
          <Link href="/admin/login" style={{ textDecoration: 'none' }}>
            <button 
              className="btn-primary" 
              style={{ background: 'var(--danger)', padding: '10px 20px', fontSize: '0.9rem' }}
            >
              Sign Out
            </button>
          </Link>
        </div>
      </div>

      <DashboardClient kpis={kpis} initialRequests={pendingRequests} />
    </div>
  );
}
