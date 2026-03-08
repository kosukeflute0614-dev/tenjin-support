'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import HeaderNav from '@/components/HeaderNav';

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLandingPage = pathname === '/';

  // LP has its own header/footer, so skip the app shell
  if (isLandingPage) {
    return <>{children}</>;
  }

  return (
    <>
      <header className="global-header">
        <div className="container header-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 0' }}>
          <Link href="/" className="logo" style={{ fontSize: '1.5rem', fontWeight: 'bold', textDecoration: 'none', color: 'inherit' }}>Tenjin-Support</Link>
          <HeaderNav />
        </div>
      </header>
      <main id="main-content" className="main-content">
        <div className="container">
          {children}
        </div>
      </main>
      <footer className="global-footer">
        <div className="container footer-content" style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)' }}>
          <p>&copy; 2026 Tenjin-Support Theater Ticketing System</p>
        </div>
      </footer>
    </>
  );
}
