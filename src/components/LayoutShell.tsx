'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
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
        <div className="container header-container">
          <Link href="/" className="logo" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
            <Image src="/logo.jpg" alt="Tenjin-Support" width={220} height={55} style={{ objectFit: 'contain' }} priority />
          </Link>
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
