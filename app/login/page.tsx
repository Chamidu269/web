'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Redirect to dashboard on success
    router.push('/dashboard');
    router.refresh();
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundImage: 'url("/bluered_metro_bus.png")',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
    }}>
      <div className="login-card">
        <h1 style={{ fontSize: '2rem', marginBottom: '8px', fontWeight: 300, textAlign: 'center' }}>
          Pay<span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>Smart</span>
        </h1>
        <p style={{ textAlign: 'center', marginBottom: '24px', fontSize: '0.875rem', color: '#525252' }}>
          Smart contactless transit ticketing
        </p>
        
        {error && (
          <div style={{ 
            backgroundColor: '#ffd7d9', 
            borderLeft: '4px solid var(--danger)', 
            color: 'var(--danger)', 
            padding: '12px', 
            marginBottom: '20px',
            fontSize: '0.875rem' 
          }}>
            {error}
          </div>
        )}
        
        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input 
              type="email" 
              className="form-input" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required 
            />
          </div>
          <div className="form-group" style={{ marginBottom: '32px' }}>
            <label className="form-label">Password</label>
            <input 
              type="password" 
              className="form-input" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required 
            />
          </div>
          <button type="submit" className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p style={{ marginTop: '24px', textAlign: 'center', fontSize: '0.875rem', marginBottom: 0 }}>
          Don't have an account? <Link href="/register" style={{ color: 'var(--primary-color)', fontWeight: 600, textDecoration: 'none' }}>Sign up here</Link>
        </p>
      </div>
    </div>
  );
}
