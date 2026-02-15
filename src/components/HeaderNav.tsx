'use client';

import { usePathname } from 'next/navigation';
import ProductionSwitcher from './ProductionSwitcher';

type Props = {
    productions: { id: string, title: string }[];
    activeId?: string;
};

export default function HeaderNav({ productions, activeId }: Props) {
    const pathname = usePathname();

    // Hide administrative navigation on public booking pages
    if (pathname?.startsWith('/book')) {
        return null;
    }

    return (
        <nav className="header-nav" style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
            <ProductionSwitcher productions={productions} activeId={activeId} />
            <div className="user-menu" style={{ marginLeft: 'auto' }}>
                Admin User ▼
            </div>
        </nav>
    );
}
