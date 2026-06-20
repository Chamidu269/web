'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';
import { User, ShieldAlert, Bus, MapPin, CreditCard, ChevronRight } from 'lucide-react';
import posthog from 'posthog-js';

export default function RegisterPage() {
  const [role, setRole] = useState<'passenger' | 'bus_owner' | null>(null);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const supabase = createClient();

  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [nic, setNic] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [gender, setGender] = useState('');
  const [rfid, setRfid] = useState('');

  // Validations
  const validateNIC = (nicVal: string) => {
    // Old NIC: 9 digits + V/X
    const oldNicRegex = /^\d{9}[vVxX]$/;
    // New NIC: 12 digits
    const newNicRegex = /^\d{12}$/;
    return oldNicRegex.test(nicVal) || newNicRegex.test(nicVal);
  };

  const validatePhone = (phoneVal: string) => {
    // Sri Lankan phone number starting with +94
    const phoneRegex = /^\+94\d{9}$/;
    return phoneRegex.test(phoneVal.replace(/\s+/g, ''));
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Perform passenger fields validation before signup
    if (role === 'passenger') {
      if (!validateNIC(nic)) {
        setError('Invalid NIC format. Must be 9 digits followed by V/X, or 12 digits.');
        setLoading(false);
        return;
      }
      if (!validatePhone(phone)) {
        setError('Invalid phone number. Must be in Sri Lankan format (e.g. +94771234567).');
        setLoading(false);
        return;
      }
    }

    try {
      // 1. Sign Up the User using Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      if (authData.user) {
        const userId = authData.user.id;

        if (role === 'passenger') {
          // 2. Insert profile role
          const { error: profileError } = await supabase.from('profiles').insert([
            {
              id: userId,
              role: 'passenger',
              status: 'active',
            }
          ]);

          if (profileError) throw profileError;

          // 3. Insert passenger details
          const { error: passengerError } = await supabase.from('passengers').insert([
            {
              id: userId,
              full_name: fullName,
              nic: nic,
              phone: phone,
              gender: gender,
              address: address,
              rfid_uid: rfid || null,
            }
          ]);

          if (passengerError) throw passengerError;

          // 4. Insert initial wallet account
          const { error: accountError } = await supabase.from('accounts').insert([
            {
              passenger_id: userId,
              balance: 0.00,
              status: 'active',
            }
          ]);

          if (accountError) throw accountError;

          // Track passenger registration in PostHog
          posthog.capture('passenger_registered', {
            id: userId,
            nic: nic,
          });

          alert('Registration successful! You can now sign in.');
          router.push('/login');
        } else if (role === 'bus_owner') {
          // 2. Insert profile role for bus owner (pending status)
          const { error: profileError } = await supabase.from('profiles').insert([
            {
              id: userId,
              role: 'bus_owner',
              status: 'pending',
            }
          ]);

          if (profileError) throw profileError;

          // Track owner registration in PostHog
          posthog.capture('owner_registered', {
            id: userId,
          });

          // Redirect to profile completion page
          router.push('/owner/complete-profile');
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred during registration. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const nextStep = () => {
    if (step === 1 && role === 'passenger') {
      if (!email || !password || !fullName) {
        setError('Please fill out all fields.');
        return;
      }
      setError('');
      setStep(2);
    } else if (step === 2 && role === 'passenger') {
      if (!nic || !phone || !address || !gender) {
        setError('Please fill out all fields.');
        return;
      }
      setError('');
      setStep(3);
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '40px auto', padding: '0 15px' }}>
      <div className="glass-panel" style={{ padding: '40px 30px' }}>
        <h1 style={{ textAlign: 'center', marginBottom: '8px', fontWeight: 300 }}>
          Join Pay<span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>Smart</span>
        </h1>
        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: '32px' }}>
          Sri Lanka's Contactless Transit System
        </p>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)', color: 'var(--danger)', padding: '12px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem' }}>
            <ShieldAlert size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* Step 0: Role Selection */}
        {step === 0 && (
          <div>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '20px', textAlign: 'center' }}>Choose your account type</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '30px' }}>
              <div 
                onClick={() => setRole('passenger')}
                style={{
                  border: role === 'passenger' ? '2px solid var(--primary-color)' : '1px solid var(--glass-border)',
                  background: role === 'passenger' ? 'rgba(59, 130, 246, 0.1)' : 'var(--glass-bg)',
                  padding: '30px 20px',
                  borderRadius: '16px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <User size={36} color={role === 'passenger' ? 'var(--primary-color)' : 'var(--text-secondary)'} style={{ marginBottom: '12px' }} />
                <h3 style={{ fontSize: '1.1rem', marginBottom: '6px' }}>Passenger</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>Tap and pay for bus journeys, view tickets, and manage wallet balance.</p>
              </div>

              <div 
                onClick={() => setRole('bus_owner')}
                style={{
                  border: role === 'bus_owner' ? '2px solid var(--accent-color)' : '1px solid var(--glass-border)',
                  background: role === 'bus_owner' ? 'rgba(139, 92, 246, 0.1)' : 'var(--glass-bg)',
                  padding: '30px 20px',
                  borderRadius: '16px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <Bus size={36} color={role === 'bus_owner' ? 'var(--accent-color)' : 'var(--text-secondary)'} style={{ marginBottom: '12px' }} />
                <h3 style={{ fontSize: '1.1rem', marginBottom: '6px' }}>Bus Owner</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>Register buses, trace live routes on maps, and view operator earnings.</p>
              </div>
            </div>

            <button 
              onClick={() => {
                if (!role) {
                  setError('Please select an account type to proceed.');
                  return;
                }
                setError('');
                setStep(1);
              }}
              className="btn-primary" 
              style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
            >
              Continue <ChevronRight size={18} />
            </button>

            <p style={{ marginTop: '24px', textAlign: 'center', fontSize: '0.9rem' }}>
              Already have an account? <Link href="/login" style={{ color: 'var(--primary-color)', textDecoration: 'none', fontWeight: 600 }}>Sign in here</Link>
            </p>
          </div>
        )}

        {/* Step 1: User Account Credentials */}
        {step === 1 && (
          <form onSubmit={role === 'bus_owner' ? handleRegister : (e) => { e.preventDefault(); nextStep(); }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '20px' }}>
              {role === 'passenger' ? 'Passenger Credentials' : 'Bus Owner Signup'}
            </h2>
            
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="form-input" placeholder="name@example.com" required />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="form-input" placeholder="Min. 6 characters" required minLength={6} />
            </div>

            {role === 'passenger' && (
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="form-input" placeholder="e.g. Priyantha Silva" required />
              </div>
            )}

            <div style={{ display: 'flex', gap: '15px', marginTop: '30px' }}>
              <button type="button" onClick={() => setStep(0)} className="btn-primary" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', flex: 1 }}>
                Back
              </button>
              <button type="submit" className="btn-primary" style={{ flex: 2, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }} disabled={loading}>
                {role === 'bus_owner' ? (loading ? 'Creating...' : 'Register as Owner') : 'Next'}
              </button>
            </div>
          </form>
        )}

        {/* Step 2: Passenger Details */}
        {step === 2 && role === 'passenger' && (
          <form onSubmit={(e) => { e.preventDefault(); nextStep(); }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '20px' }}>Personal Information</h2>

            <div className="form-group">
              <label className="form-label">NIC (National Identity Card)</label>
              <input type="text" value={nic} onChange={(e) => setNic(e.target.value)} className="form-input" placeholder="e.g. 199012345678 or 901234567V" required />
            </div>

            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="form-input" placeholder="+94 7X XXX XXXX" required />
            </div>

            <div className="form-group">
              <label className="form-label">Gender</label>
              <select value={gender} onChange={(e) => setGender(e.target.value)} className="form-input" required style={{ appearance: 'none', background: 'rgba(15, 23, 42, 0.7)' }}>
                <option value="">Select gender...</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Permanent Address</label>
              <textarea value={address} onChange={(e) => setAddress(e.target.value)} className="form-input" rows={3} placeholder="Your full residential address" required></textarea>
            </div>

            <div style={{ display: 'flex', gap: '15px', marginTop: '30px' }}>
              <button type="button" onClick={() => setStep(1)} className="btn-primary" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', flex: 1 }}>
                Back
              </button>
              <button type="submit" className="btn-primary" style={{ flex: 2 }}>
                Next
              </button>
            </div>
          </form>
        )}

        {/* Step 3: Link RFID Card */}
        {step === 3 && role === 'passenger' && (
          <form onSubmit={handleRegister}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <CreditCard size={48} color="var(--primary-color)" style={{ margin: '0 auto 16px' }} />
              <h2 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>Link Your RFID Card</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Tap your transit card on a registration scanner or type your Card UID manually below.
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">RFID Card UID (Optional)</label>
              <input type="text" value={rfid} onChange={(e) => setRfid(e.target.value)} className="form-input" placeholder="e.g. 1A2B3C4D" />
            </div>

            <div style={{ display: 'flex', gap: '15px', marginTop: '30px' }}>
              <button type="button" onClick={() => setStep(2)} className="btn-primary" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', flex: 1 }}>
                Back
              </button>
              <button type="submit" className="btn-primary" style={{ flex: 2 }} disabled={loading}>
                {loading ? 'Processing...' : 'Complete Registration'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
