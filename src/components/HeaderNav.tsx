'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import UserMenu from './UserMenu';
import { useAuth } from '@/components/AuthProvider';

export default function HeaderNav() {
    const pathname = usePathname();
    const router = useRouter();
    const { user, profile, loading } = useAuth();

    // ログインしていない場合はナビゲーションを表示しない
    if (!user) {
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
                    textDecoration: 'none'
                }}>
                    ダッシュボード
                </Link>
                <Link href="/productions" className="nav-link" style={{
                    fontWeight: pathname?.startsWith('/productions') ? 'bold' : 'normal',
                    color: pathname?.startsWith('/productions') ? 'var(--primary)' : 'inherit',
                    textDecoration: 'none'
                }}>
                    公演一覧
                </Link>
                <Link href="/reservations" className="nav-link" style={{
                    fontWeight: pathname?.startsWith('/reservations') ? 'bold' : 'normal',
                    color: pathname?.startsWith('/reservations') ? 'var(--primary)' : 'inherit',
                    textDecoration: 'none'
                }}>
                    予約一覧
                </Link>
            </div>
            <div style={{ marginLeft: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ fontSize: '0.9rem', color: '#666' }}>{profile?.troupeName || user?.email}</span>
            </div>
            <div style={{ height: '20px', width: '1px', background: '#e5e7eb' }}></div>
            <UserMenu />
        </nav>
    );
}
