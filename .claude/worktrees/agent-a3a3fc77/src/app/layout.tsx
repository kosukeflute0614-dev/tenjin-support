import './globals.css'
import type { Metadata } from 'next'
import { Inter, Playfair_Display } from 'next/font/google'
import HeaderNav from '@/components/HeaderNav'
import Link from 'next/link';
import { AuthProvider } from '@/components/AuthProvider';
import RouteGuard from '@/components/RouteGuard';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-serif' })

export const metadata: Metadata = {
  title: 'Theater Production Support',
  description: '演劇制作総合サポートアプリ',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body className={`${inter.variable} ${playfair.variable}`}>
        <AuthProvider>
          <RouteGuard>
            <header className="global-header">
              <div className="container header-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 0' }}>
                <Link href="/" className="logo" style={{ fontSize: '1.5rem', fontWeight: 'bold', textDecoration: 'none', color: 'inherit' }}>Tenjin-Support</Link>
                <HeaderNav />
              </div>
            </header>
            <main className="main-content">
              <div className="container">
                {children}
              </div>
            </main>
            <footer className="global-footer">
              <div className="container footer-content" style={{ textAlign: 'center', padding: '2rem 0', color: '#888' }}>
                <p>&copy; 2026 Tenjin-Support Theater Ticketing System</p>
              </div>
            </footer>
          </RouteGuard>
        </AuthProvider>
      </body>
    </html>
  )
}
