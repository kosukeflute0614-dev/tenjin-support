import './globals.css'
import type { Metadata } from 'next'
import { Inter, Playfair_Display } from 'next/font/google'
import { getProductions } from '@/app/actions/production'
import { getActiveProductionId } from '@/app/actions/production-context'
import HeaderNav from '@/components/HeaderNav'

import Image from 'next/image'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-serif' })

export const metadata: Metadata = {
  title: 'Theater Production Support',
  description: '演劇制作総合サポートアプリ',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const productions = await getProductions();
  const activeId = await getActiveProductionId();

  return (
    <html lang="ja">
      <body className={`${inter.variable} ${playfair.variable}`}>
        <header className="global-header">
          <div className="container header-container">
            <h1 className="logo">
              <Image
                src="/logo.png"
                alt="Tenjin-Support"
                width={180}
                height={60}
                style={{ height: 'auto', width: 'auto', maxHeight: '45px', objectFit: 'contain' }}
              />
            </h1>
            <HeaderNav productions={productions} activeId={activeId} />
          </div>
        </header>
        <main className="main-content">
          <div className="container">
            {children}
          </div>
        </main>
        <footer className="global-footer">
          <div className="container footer-content">
            <p>&copy; 2026 Tenjin-Support Theater Ticketing System</p>
          </div>
        </footer>
      </body>
    </html>
  )
}
