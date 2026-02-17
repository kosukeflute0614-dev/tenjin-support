'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import UserMenu from './UserMenu';

type Props = {
    productions: any[];
    activeId: string | null;
};

export default function HeaderNav({ productions, activeId }: Props) {
    const pathname = usePathname();

    // 予約フォーム(ゲスト用ページ)ではナビゲーションを表示しない
    if (pathname?.startsWith('/book/')) {
        return null;
    }

    return (
        <nav style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
            <ul style={{ display: 'flex', listStyle: 'none', gap: '1.5rem', margin: 0, padding: 0 }}>
                <li>
                    <Link href="/" style={{
                        fontWeight: pathname === '/' ? 'bold' : 'normal',
                        color: pathname === '/' ? 'var(--primary)' : 'inherit'
                    }}>
                        ダッシュボード
                    </Link>
                </li>
                <li>
                    <Link href="/productions" style={{
                        fontWeight: pathname?.startsWith('/productions') ? 'bold' : 'normal',
                        color: pathname?.startsWith('/productions') ? 'var(--primary)' : 'inherit'
                    }}>
                        公演管理
                    </Link>
                </li>
                <li>
                    <Link href="/reservations" style={{
                        fontWeight: pathname?.startsWith('/reservations') ? 'bold' : 'normal',
                        color: pathname?.startsWith('/reservations') ? 'var(--primary)' : 'inherit'
                    }}>
                        予約一覧
                    </Link>
                </li>
            </ul>
            <div style={{ height: '20px', width: '1px', background: '#e5e7eb' }}></div>
            <UserMenu />
        </nav>
    );
}
