'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import UserMenu from './UserMenu';
import { useAuth } from '@/components/AuthProvider';

export default function HeaderNav() {
    const pathname = usePathname();
    const { user, isOrganizer } = useAuth();

    // 主催者（Googleログイン済み）以外は何も表示しない
    if (!user || !isOrganizer) {
        return null;
    }

    // 予約フォーム(ゲスト用ページ)ではナビゲーションを表示しない
    if (pathname?.startsWith('/book/')) {
        return null;
    }

    return (
        <nav style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
            <div style={{ display: 'flex', listStyle: 'none', gap: '1.5rem', margin: 0, padding: 0 }}>
                <Link href="/dashboard" className="nav-link" style={{
                    fontWeight: pathname === '/dashboard' ? 'bold' : 'normal',
                    color: pathname === '/dashboard' ? 'var(--primary)' : 'inherit',
                    textDecoration: 'none',
                    fontSize: '0.9rem',
                    letterSpacing: '0.03em'
                }}>
                    ダッシュボード
                </Link>
            </div>
            <div style={{ height: '20px', width: '1px', background: '#e5e7eb' }}></div>
            <UserMenu />
        </nav>
    );
}
