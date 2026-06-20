export default function Home() {
  return (
    <div style={{ textAlign: 'center', padding: '60px 0' }}>
      <h1 style={{ fontSize: '2.5rem', fontWeight: 300 }}>
        Welcome to Pay<span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>Smart</span>
      </h1>
      <p style={{ fontSize: '1.1rem', maxWidth: '600px', margin: '0 auto 40px', color: 'var(--text-secondary)' }}>
        The smart, contactless bus ticketing platform for Sri Lankan local buses.
        Tap your card, track your journey, and manage your wallet easily.
      </p>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '20px' }}>
        <a href="/register" style={{ textDecoration: 'none' }}>
          <button className="btn-primary" style={{ padding: '0 32px' }}>
            Register Now
          </button>
        </a>
        <a href="/dashboard" style={{ textDecoration: 'none' }}>
          <button className="btn-secondary" style={{ padding: '0 32px' }}>
            Go to Dashboard
          </button>
        </a>
      </div>
    </div>
  );
}
