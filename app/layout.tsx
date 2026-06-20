import './globals.css';
import type { Metadata } from 'next';
import { PHProvider } from './providers';

export const metadata: Metadata = {
  title: 'PaySmart | Smart Bus Ticketing System',
  description: 'Sri Lanka contactless bus ticketing platform with tap-and-pay.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <PHProvider>
          <header className="main-header">
            <div className="container">
              <a href="/" className="logo">Pay<span>Smart</span></a>
              <nav className="nav-links">
                <a href="/register">Register</a>
                <a href="/dashboard">Dashboard</a>
                <a href="/track">Live Track</a>
              </nav>
            </div>
          </header>
          <main className="container">
            {children}
          </main>
        </PHProvider>
      </body>
    </html>
  );
}

