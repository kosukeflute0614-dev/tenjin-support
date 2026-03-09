'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import UserMenu from './UserMenu';
import { useAuth } from '@/components/AuthProvider';
import { getActiveProductionId } from '@/app/actions/production-context';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export default function HeaderNav() {
    const pathname = usePathname();
    const { user, isOrganizer } = useAuth();
    const [productionName, setProductionName] = useState<string | null>(null);
    const [hasProduction, setHasProduction] = useState<boolean | null>(null);

    useEffect(() => {
        const fetchProduction = async () => {
            if (!user) return;
            try {
                const activeId = await getActiveProductionId();
                if (!activeId) {
                    setHasProduction(false);
                    return;
                }
                setHasProduction(true);
                const prodSnap = await getDoc(doc(db, 'productions', activeId));
                if (prodSnap.exists()) {
                    setProductionName(prodSnap.data().title || '公演');
                }
            } catch {
                setHasProduction(false);
            }
        };

        if (user && isOrganizer) {
            fetchProduction();
        }
    }, [user, isOrganizer, pathname]);

    // 主催者（Googleログイン済み）以外は何も表示しない
    if (!user || !isOrganizer) {
        return null;
    }

    // 予約フォーム(ゲスト用ページ)ではナビゲーションを表示しない
    if (pathname?.startsWith('/book/')) {
        return null;
    }

    const isDashboard = pathname === '/dashboard';
    const linkHref = hasProduction === false ? '/productions' : '/dashboard';

    return (
        <nav style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
            <div style={{ display: 'flex', listStyle: 'none', gap: '1.5rem', margin: 0, padding: 0 }}>
                <Link href={linkHref} className="nav-link" style={{
                    fontWeight: isDashboard ? 'bold' : 'normal',
                    color: isDashboard ? 'var(--primary)' : 'inherit',
                    textDecoration: 'none',
                    fontSize: '0.9rem',
                    letterSpacing: '0.03em',
                    maxWidth: '200px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }}>
                    {productionName || '公演一覧'}
                </Link>
            </div>
            <div style={{ height: '20px', width: '1px', background: '#e5e7eb' }}></div>
            <UserMenu />
        </nav>
    );
}
