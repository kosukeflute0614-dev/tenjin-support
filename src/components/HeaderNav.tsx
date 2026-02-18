'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import UserMenu from './UserMenu';
import { useAuth } from '@/components/AuthProvider';

export default function HeaderNav() {
    const pathname = usePathname();
    const { user } = useAuth();

    // ログインしていない場合は何も表示しない（UserMenu側でログインボタン表示）
    if (!user) {
        return <UserMenu />;
    }

    // 予約フォーム(ゲスト用ページ)ではナビゲーションを表示しない
    if (pathname?.startsWith('/book/')) {
        return null;
    }

    return (
        <nav style={{ display: 'flex', alignItems: 'center', gap: '2.5rem' }}>
            <div style={{ display: 'flex', listStyle: 'none', gap: '2rem', margin: 0, padding: 0 }}>
                <Link href="/dashboard" className="nav-link" style={{
                    fontWeight: pathname === '/dashboard' ? 'bold' : 'normal',
                    color: pathname === '/dashboard' ? 'var(--primary)' : 'inherit',
                    textDecoration: 'none',
                    fontSize: '0.95rem',
                    letterSpacing: '0.05em'
                }}>
                    ダッシュボード
                </Link>
                <Link href="/productions" className="nav-link" style={{
                    fontWeight: pathname?.startsWith('/productions') ? 'bold' : 'normal',
                    color: pathname?.startsWith('/productions') ? 'var(--primary)' : 'inherit',
                    textDecoration: 'none',
                    fontSize: '0.95rem',
                    letterSpacing: '0.05em'
                }}>
                    公演一覧
                </Link>
            </div>
            <div style={{ height: '20px', width: '1px', background: '#e5e7eb' }}></div>
            <UserMenu />
        </nav>
    );
}
