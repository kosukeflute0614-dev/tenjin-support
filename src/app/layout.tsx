import './globals.css'
import type { Metadata } from 'next'
import { Inter, Playfair_Display } from 'next/font/google'
import { AuthProvider } from '@/components/AuthProvider';
import { ToastProvider } from '@/components/Toast';
import RouteGuard from '@/components/RouteGuard';
import LayoutShell from '@/components/LayoutShell';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-serif' })

export const metadata: Metadata = {
  title: 'Tenjin-Support | 演劇公演の制作業務をまるごとサポート',
  description: '予約管理、当日受付、チェックイン、売上集計、アンケートまで。小劇場の公演制作をひとつのアプリで完結。',
  icons: {
    icon: '/icon.jpg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body className={`${inter.variable} ${playfair.variable}`}>
        <a href="#main-content" className="skip-link">メインコンテンツへスキップ</a>
        <AuthProvider>
          <ToastProvider>
            <RouteGuard>
              <LayoutShell>
                {children}
              </LayoutShell>
            </RouteGuard>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
